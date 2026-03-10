"use server";

import { createClient } from "@/utils/supabase/server";
import {
  DancerPricingBreakdown,
  LineItem,
  PricingInput,
  PricingQuote,
} from "@/types";
import { buildPaymentSchedule } from "@/utils/buildPaymentSchedule";

/* -------------------------------------------------------------------------- */
/* Public server action                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Computes the full pricing quote for a family's enrollment.
 *
 * This is the authoritative pricing computation — all pricing happens
 * server-side. The client receives a PricingQuote for display only.
 * At batch creation the server recomputes and validates the totals match.
 *
 * Calculation order (confirmed with client):
 *  Per dancer:
 *    1. Base tuition (rate bands or per-session price rows)
 *    2. Recital fee (from rate band; $0 for competition)
 *    3. Senior extra fees: video ($15/registrant) + costume ($65 × weeklyClassCount)
 *    4. Session/class discount rules (% first, flat second)
 *    5. Registration fee ($40, not discountable)
 *  Family level:
 *    6. Sum dancer tuition → tuitionSubtotal
 *    7. Family discount ($50 flat, once per family per semester)
 *    8. Auto-pay admin fee (if applicable)
 *    9. Grand total
 *
 * @throws Error if required configuration is missing
 */
export async function computePricingQuote(
  input: PricingInput,
): Promise<PricingQuote> {
  const supabase = await createClient();

  /* ---------------------------------------------------------------------- */
  /* 1. Fetch fee config                                                      */
  /* ---------------------------------------------------------------------- */
  const { data: feeConfigRow, error: feeConfigError } = await supabase
    .from("semester_fee_config")
    .select("*")
    .eq("semester_id", input.semesterId)
    .maybeSingle();

  if (feeConfigError) throw new Error(feeConfigError.message);

  // Use defaults if admin hasn't configured fees yet
  const feeConfig = {
    registration_fee_per_child: Number(
      feeConfigRow?.registration_fee_per_child ?? 40,
    ),
    family_discount_amount: Number(feeConfigRow?.family_discount_amount ?? 50),
    auto_pay_admin_fee_monthly: Number(
      feeConfigRow?.auto_pay_admin_fee_monthly ?? 5,
    ),
    auto_pay_installment_count: Number(
      feeConfigRow?.auto_pay_installment_count ?? 5,
    ),
    senior_video_fee_per_registrant: Number(
      feeConfigRow?.senior_video_fee_per_registrant ?? 15,
    ),
    senior_costume_fee_per_class: Number(
      feeConfigRow?.senior_costume_fee_per_class ?? 65,
    ),
    junior_costume_fee_per_class: Number(
      feeConfigRow?.junior_costume_fee_per_class ?? 55,
    ),
  };

  /* ---------------------------------------------------------------------- */
  /* 2. Resolve family ID and check if family discount already applied       */
  /* ---------------------------------------------------------------------- */
  let familyId = input.familyId;
  if (!familyId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("family_id")
        .eq("id", user.id)
        .maybeSingle();
      familyId = (profile as any)?.family_id ?? undefined;
    }
  }

  let isDiscountEligible = true;
  if (familyId) {
    const { count: priorDiscountCount } = await supabase
      .from("registration_batches")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("semester_id", input.semesterId)
      .gt("family_discount_amount", 0)
      .eq("status", "confirmed");
    isDiscountEligible = (priorDiscountCount ?? 0) === 0;
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Fetch semester discount rules (evaluated per dancer below)           */
  /* ---------------------------------------------------------------------- */
  const { data: discountLinks } = await supabase
    .from("semester_discounts")
    .select(
      `discount_id,
       discounts (
         id, name, category, eligible_sessions_mode, give_session_scope, is_active,
         discount_rules ( id, threshold, threshold_unit, value, value_type ),
         discount_rule_sessions ( session_id )
       )`,
    )
    .eq("semester_id", input.semesterId);

  const activeDiscounts: ActiveDiscount[] = (discountLinks ?? [])
    .map((link: any) => link.discounts as ActiveDiscount | null)
    .filter((d): d is ActiveDiscount => d !== null && d.is_active === true);

  const familyDancerCount = input.enrollments.filter(
    (e) => e.sessionIds.length > 0,
  ).length;

  /* ---------------------------------------------------------------------- */
  /* 4. Per-dancer computation                                                */
  /* ---------------------------------------------------------------------- */
  const perDancer: DancerPricingBreakdown[] = [];

  for (const { dancerId, dancerName: dancerNameOverride, sessionIds } of input.enrollments) {
    if (sessionIds.length === 0) continue;

    // Fetch the class + schedule_date for each session
    const { data: sessionRows, error: sessionError } = await supabase
      .from("class_sessions")
      .select("id, schedule_date, day_of_week, classes(id, name, division, discipline, is_competition_track)")
      .in("id", sessionIds);

    if (sessionError) throw new Error(sessionError.message);
    if (!sessionRows || sessionRows.length === 0) {
      throw new Error(`No sessions found for dancer ${dancerId}`);
    }

    // Fetch dancer name (use override for new dancers not yet in DB)
    let dancerName = dancerNameOverride ?? "";
    if (!dancerName) {
      const { data: dancerRow } = await supabase
        .from("dancers")
        .select("first_name, last_name")
        .eq("id", dancerId)
        .maybeSingle();
      dancerName = dancerRow
        ? `${dancerRow.first_name} ${dancerRow.last_name}`
        : dancerId;
    }

    // Resolve division from enrolled classes
    const classesForDancer = sessionRows.map((s) => {
      const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
      return cls as {
        id: string;
        name: string;
        division: string;
        discipline: string;
        is_competition_track: boolean;
      } | null;
    });

    const divisions = [
      ...new Set(
        classesForDancer
          .filter(Boolean)
          .map((c) => c!.division)
          .filter((d) => d !== "competition"),
      ),
    ];

    const division = resolveDivision(divisions);

    // Per-day model: weekly class count = distinct (class_id, day_of_week) pairs.
    // Legacy model: weekly class count = total enrolled sessions.
    const isPerDayModel = sessionRows.some((s) => (s as any).schedule_date !== null);
    let weeklyClassCount: number;
    if (isPerDayModel) {
      const classDayPairs = new Set(
        sessionRows.map((s) => {
          const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
          return `${(cls as any)?.id ?? ""}:${(s as any).day_of_week ?? ""}`;
        }),
      );
      weeklyClassCount = classDayPairs.size;
    } else {
      weeklyClassCount = sessionIds.length;
    }

    // Classify each class as "standard" or "fee-exempt".
    // Fee-exempt programs (technique, pointe, competition) skip the
    // registration fee and video/costume fees entirely.
    // Early childhood has no video/costume fees but DOES pay registration.
    const isFeeExemptClass = (cls: {
      discipline: string;
      division: string;
    }): boolean =>
      cls.discipline === "technique" ||
      cls.discipline === "pointe" ||
      cls.division === "competition";

    const standardClasses = classesForDancer.filter(
      (c) => c !== null && !isFeeExemptClass(c),
    );

    // Weekly class count used for costume fee: only standard (non-exempt) classes.
    let standardWeeklyCount: number;
    if (isPerDayModel) {
      const stdClassDayPairs = new Set(
        sessionRows
          .filter((s) => {
            const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
            return cls && !isFeeExemptClass(cls as { discipline: string; division: string });
          })
          .map((s) => {
            const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
            return `${(cls as any)?.id ?? ""}:${(s as any).day_of_week ?? ""}`;
          }),
      );
      standardWeeklyCount = stdClassDayPairs.size;
    } else {
      standardWeeklyCount = standardClasses.length;
    }

    // Dual-path pricing: check for per-session price rows first,
    // fall back to tuition_rate_bands for sessions without explicit prices.
    const { data: priceRowsData, error: priceRowsError } = await supabase
      .from("class_session_price_rows")
      .select("class_session_id, amount")
      .in("class_session_id", sessionIds)
      .eq("is_default", true);

    if (priceRowsError) throw new Error(priceRowsError.message);

    const priceRowMap = new Map<string, number>();
    for (const row of priceRowsData ?? []) {
      priceRowMap.set(row.class_session_id as string, Number(row.amount));
    }

    const perSessionIds = sessionIds.filter((id) => priceRowMap.has(id));
    const rateBandIds = sessionIds.filter((id) => !priceRowMap.has(id));

    const lineItems: LineItem[] = [];
    let tuition = 0;
    let recitalFee = 0;

    // Per-session priced sessions (additive, no recital fee)
    if (perSessionIds.length > 0) {
      const perSessionTotal = round2(
        perSessionIds.reduce((sum, id) => sum + priceRowMap.get(id)!, 0),
      );
      tuition += perSessionTotal;
      lineItems.push({
        type: "tuition",
        label: `Tuition (${perSessionIds.length} session${perSessionIds.length !== 1 ? "s" : ""}, per-session pricing)`,
        amount: perSessionTotal,
      });
    }

    // Rate-band sessions (use division + count of this subset)
    if (rateBandIds.length > 0) {
      const bandCount = rateBandIds.length;
      const { data: rateBand, error: bandError } = await supabase
        .from("tuition_rate_bands")
        .select("base_tuition, recital_fee_included")
        .eq("semester_id", input.semesterId)
        .eq("division", division)
        .eq("weekly_class_count", bandCount)
        .maybeSingle();

      if (bandError) throw new Error(bandError.message);
      if (!rateBand) {
        throw new Error(
          `No tuition rate configured for division="${division}", ` +
            `weekly_class_count=${bandCount} in semester ${input.semesterId}. ` +
            `Please configure tuition rate bands in the semester's Payment step.`,
        );
      }

      const bandTotal = Number(rateBand.base_tuition);
      const bandRecital = Number(rateBand.recital_fee_included);
      tuition += bandTotal;
      recitalFee += bandRecital;
      lineItems.push(
        {
          type: "tuition",
          label: `Tuition (${divisionLabel(division)}, ${bandCount}x/week)`,
          amount: round2(bandTotal - bandRecital),
        },
        { type: "recital_fee", label: "Recital Fee", amount: bandRecital },
      );
    }

    /* -------------------------------------------------------------------- */
    /* Division costume / video fees                                          */
    /* Only applied to standard (non-exempt) classes.                        */
    /* Senior → video fee (flat, per registrant) + costume (per std class)   */
    /* Junior → costume fee only (per std class); no video fee               */
    /* Technique / Pointe / Competition / Early Childhood → exempt           */
    /* -------------------------------------------------------------------- */
    let videoFee = 0;
    let costumeFee = 0;

    if (standardWeeklyCount > 0) {
      if (division === "senior") {
        videoFee = feeConfig.senior_video_fee_per_registrant;
        costumeFee = round2(feeConfig.senior_costume_fee_per_class * standardWeeklyCount);

        tuition += videoFee;
        tuition += costumeFee;

        lineItems.push(
          {
            type: "video_fee",
            label: "Video Fee (Senior)",
            amount: videoFee,
            description: "One-time video fee per senior registrant",
          },
          {
            type: "costume_fee",
            label: `Costume Fee (${standardWeeklyCount} class${standardWeeklyCount !== 1 ? "es" : ""})`,
            amount: costumeFee,
            description: `$${feeConfig.senior_costume_fee_per_class} per class`,
          },
        );
      } else if (division === "junior") {
        costumeFee = round2(feeConfig.junior_costume_fee_per_class * standardWeeklyCount);
        tuition += costumeFee;
        lineItems.push({
          type: "costume_fee",
          label: `Costume Fee (${standardWeeklyCount} class${standardWeeklyCount !== 1 ? "es" : ""})`,
          amount: costumeFee,
          description: `$${feeConfig.junior_costume_fee_per_class} per class`,
        });
      }
    }

    /* -------------------------------------------------------------------- */
    /* Session/class discount rule evaluation                                 */
    /* Percentage discounts applied first, flat discounts second.            */
    /* Registration fee is NOT discountable.                                 */
    /* Note: give_session_scope is not yet granularly enforced — discounts   */
    /* currently reduce the dancer's full tuition. Granular per-session      */
    /* application can be added in a future pass.                            */
    /* -------------------------------------------------------------------- */
    let sessionDiscountTotal = 0;

    const percentRules = getApplicableRules(
      activeDiscounts,
      sessionIds,
      familyDancerCount,
      weeklyClassCount,
      "percent",
    );
    for (const rule of percentRules) {
      const reduction = round2(tuition * (rule.value / 100));
      tuition = round2(tuition - reduction);
      sessionDiscountTotal = round2(sessionDiscountTotal - reduction);
      lineItems.push({
        type: "session_discount",
        label: `Discount: ${rule.discountName}`,
        amount: -reduction,
        description: `${rule.value}% off tuition`,
      });
    }

    const flatRules = getApplicableRules(
      activeDiscounts,
      sessionIds,
      familyDancerCount,
      weeklyClassCount,
      "flat",
    );
    for (const rule of flatRules) {
      const reduction = Math.min(rule.value, tuition); // never go below $0
      tuition = round2(tuition - reduction);
      sessionDiscountTotal = round2(sessionDiscountTotal - reduction);
      lineItems.push({
        type: "session_discount",
        label: `Discount: ${rule.discountName}`,
        amount: -reduction,
      });
    }

    /* -------------------------------------------------------------------- */
    /* Registration fee (not discountable)                                   */
    /* Exempt when ALL of the dancer's classes are fee-exempt programs       */
    /* (technique, pointe, competition). Early childhood is NOT exempt.      */
    /* -------------------------------------------------------------------- */
    const allClassesAreExempt =
      classesForDancer.length > 0 &&
      classesForDancer.every((c) => c !== null && isFeeExemptClass(c));
    const registrationFee = allClassesAreExempt
      ? 0
      : feeConfig.registration_fee_per_child;
    if (registrationFee > 0) {
      lineItems.push({
        type: "registration_fee",
        label: "Registration Fee",
        amount: registrationFee,
      });
    }

    perDancer.push({
      dancerId,
      dancerName,
      division,
      weeklyClassCount,
      tuition: round2(tuition),
      recitalFee: round2(recitalFee),
      videoFee: round2(videoFee),
      costumeFee: round2(costumeFee),
      sessionDiscountTotal: round2(sessionDiscountTotal),
      registrationFee,
      lineItems,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Family-level aggregation                                              */
  /* ---------------------------------------------------------------------- */
  const tuitionSubtotal = round2(
    perDancer.reduce((s, d) => s + d.tuition, 0),
  );
  const registrationFeeTotal = round2(
    perDancer.reduce((s, d) => s + d.registrationFee, 0),
  );
  const recitalFeeTotal = round2(
    perDancer.reduce((s, d) => s + d.recitalFee, 0),
  );

  /* ---------------------------------------------------------------------- */
  /* 6. Family discount: $X flat, once per family per semester               */
  /* Applied after all per-session discounts.                                */
  /* ---------------------------------------------------------------------- */
  const familyDiscountAmount = isDiscountEligible
    ? feeConfig.family_discount_amount
    : 0;

  /* ---------------------------------------------------------------------- */
  /* 7. Auto-pay admin fee: $X/month × installment count                    */
  /* ---------------------------------------------------------------------- */
  const autoPayAdminFeeTotal =
    input.paymentPlanType === "auto_pay_monthly"
      ? round2(
          feeConfig.auto_pay_admin_fee_monthly *
            feeConfig.auto_pay_installment_count,
        )
      : 0;

  /* ---------------------------------------------------------------------- */
  /* 8. Grand total                                                          */
  /* ---------------------------------------------------------------------- */
  const grandTotal = round2(
    tuitionSubtotal +
      registrationFeeTotal -
      familyDiscountAmount +
      autoPayAdminFeeTotal,
  );

  /* ---------------------------------------------------------------------- */
  /* 9. Family-level line items                                              */
  /* ---------------------------------------------------------------------- */
  const familyLineItems: LineItem[] = [
    ...perDancer.flatMap((d) => d.lineItems),
  ];

  if (familyDiscountAmount > 0) {
    familyLineItems.push({
      type: "family_discount",
      label: "Family Discount",
      amount: -familyDiscountAmount,
      description: "Applied once per family per semester",
    });
  }

  if (autoPayAdminFeeTotal > 0) {
    familyLineItems.push({
      type: "auto_pay_admin_fee",
      label: `Auto-pay Admin Fee (${feeConfig.auto_pay_installment_count} months × $${feeConfig.auto_pay_admin_fee_monthly})`,
      amount: autoPayAdminFeeTotal,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 10. Payment schedule                                                    */
  /* ---------------------------------------------------------------------- */
  const today = new Date().toISOString().slice(0, 10);
  const { amountDueNow, schedule } = buildPaymentSchedule(
    input.paymentPlanType,
    grandTotal,
    feeConfig,
    today,
  );

  return {
    perDancer,
    tuitionSubtotal,
    registrationFeeTotal,
    recitalFeeTotal,
    familyDiscountAmount,
    autoPayAdminFeeTotal,
    grandTotal,
    amountDueNow,
    lineItems: familyLineItems,
    paymentSchedule: schedule,
  };
}

/* -------------------------------------------------------------------------- */
/* Discount Rule Evaluation                                                    */
/* -------------------------------------------------------------------------- */

interface ActiveDiscount {
  id: string;
  name: string;
  category: string;
  eligible_sessions_mode: "all" | "selected";
  give_session_scope: string | null;
  is_active: boolean;
  discount_rules: Array<{
    id: string;
    threshold: number;
    threshold_unit: "person" | "session";
    value: number;
    value_type: "flat" | "percent";
  }>;
  discount_rule_sessions: Array<{ session_id: string | null }>;
}

/**
 * Returns applicable discount rules for a dancer, filtered by value_type.
 * Eligibility checks:
 *   - eligible_sessions_mode === 'all' → always eligible
 *   - eligible_sessions_mode === 'selected' → dancer must have at least one
 *     session that is in discount_rule_sessions
 * Threshold checks:
 *   - threshold_unit === 'person' → familyDancerCount must meet threshold
 *   - threshold_unit === 'session' → weeklyClassCount must meet threshold
 *   - threshold === 0 → unconditional
 */
function getApplicableRules(
  discounts: ActiveDiscount[],
  dancerSessionIds: string[],
  familyDancerCount: number,
  weeklyClassCount: number,
  valueType: "percent" | "flat",
): Array<{ discountName: string; value: number }> {
  const results: Array<{ discountName: string; value: number }> = [];
  const sessionSet = new Set(dancerSessionIds);

  for (const discount of discounts) {
    // Session eligibility
    if (discount.eligible_sessions_mode === "selected") {
      const eligibleSessionIds = new Set(
        discount.discount_rule_sessions
          .map((s) => s.session_id)
          .filter(Boolean),
      );
      const hasEligibleSession = dancerSessionIds.some((id) =>
        eligibleSessionIds.has(id),
      );
      if (!hasEligibleSession) continue;
    }

    // Evaluate each rule
    for (const rule of discount.discount_rules ?? []) {
      if (rule.value_type !== valueType) continue;

      // Threshold check
      if (rule.threshold > 0) {
        if (
          rule.threshold_unit === "person" &&
          familyDancerCount < rule.threshold
        )
          continue;
        if (
          rule.threshold_unit === "session" &&
          weeklyClassCount < rule.threshold
        )
          continue;
      }

      results.push({ discountName: discount.name, value: rule.value });
    }
  }

  // Suppress TS warning for sessionSet being unused when eligible_sessions_mode = 'all'
  void sessionSet;
  return results;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolves the pricing division from an array of class divisions.
 * - All same → use that division
 * - junior + senior mix → senior (higher tier)
 * - early_childhood + anything else → throw (blocked enrollment)
 */
function resolveDivision(divisions: string[]): string {
  const unique = [...new Set(divisions)];

  if (unique.length === 0) return "junior"; // fallback
  if (unique.length === 1) return unique[0];

  if (unique.includes("early_childhood")) {
    throw new Error(
      "A dancer cannot enroll in Early Childhood classes alongside other divisions.",
    );
  }

  // junior + senior → senior
  if (
    unique.every((d) => d === "junior" || d === "senior") &&
    unique.includes("senior")
  ) {
    return "senior";
  }

  // Any other mixed case → use the first non-early_childhood division (best effort)
  return unique.filter((d) => d !== "early_childhood")[0];
}

function divisionLabel(division: string): string {
  const map: Record<string, string> = {
    early_childhood: "Early Childhood",
    junior: "Junior",
    senior: "Senior",
    competition: "Competition",
  };
  return map[division] ?? division;
}
