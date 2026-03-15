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
    costume_fee_exempt_keys: (feeConfigRow?.costume_fee_exempt_keys ??
      ["technique", "pointe", "competition"]) as string[],
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

  // const activeDiscounts: ActiveDiscount[] = (discountLinks ?? [])
  //   .map((link: any) => link.discounts as ActiveDiscount | null)
  //   .filter((d): d is ActiveDiscount => d !== null && d.is_active === true);

  const activeDiscounts: ActiveDiscount[] = (discountLinks ?? [])
    .map((link: any) => link.discounts as ActiveDiscount | null)
    .filter(
      (d): d is ActiveDiscount =>
        d !== null && d.is_active === true && d.category !== "family",
    );

  const familyDancerCount = input.enrollments.filter(
    (e) => e.sessionIds.length > 0,
  ).length;

  /* ---------------------------------------------------------------------- */
  /* 4. Per-dancer computation                                                */
  /* ---------------------------------------------------------------------- */
  const perDancer: DancerPricingBreakdown[] = [];

  for (const {
    dancerId,
    dancerName: dancerNameOverride,
    sessionIds,
  } of input.enrollments) {
    if (sessionIds.length === 0) continue;

    // Fetch the class + schedule_date for each session
    const { data: sessionRows, error: sessionError } = await supabase
      .from("class_sessions")
      .select(
        "id, schedule_date, day_of_week, classes(id, name, division, discipline, is_competition_track, tuition_override_amount)",
      )
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
        tuition_override_amount: number | null;
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
    const isPerDayModel = sessionRows.some(
      (s) => (s as any).schedule_date !== null,
    );
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
    }): boolean => {
      const keys = feeConfig.costume_fee_exempt_keys;
      return (
        keys.includes(cls.discipline) ||
        (keys.includes("competition") && cls.division === "competition")
      );
    };

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
            return (
              cls &&
              !isFeeExemptClass(cls as { discipline: string; division: string })
            );
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

    // Tri-path pricing (priority order):
    //   1. Per-session price rows  → explicit per-session amounts
    //   2. Class-level overrides   → flat class tuition bypassing rate bands
    //   3. Rate-band lookup        → division + weekly count progressive tiers
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

    // Build sessionId → class map for override lookups.
    type SessionClassInfo = {
      id: string;
      name: string;
      division: string;
      tuition_override_amount: number | null;
    };
    const sessionClassMap = new Map<string, SessionClassInfo>();
    for (const row of sessionRows) {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      if (cls) sessionClassMap.set(row.id, cls as SessionClassInfo);
    }

    const perSessionIds = sessionIds.filter((id) => priceRowMap.has(id));
    const remainingIds = sessionIds.filter((id) => !priceRowMap.has(id));

    // Among remaining, split by whether the class has a flat override.
    const overrideIds = remainingIds.filter((id) => {
      const cls = sessionClassMap.get(id);
      return cls != null && cls.tuition_override_amount != null;
    });
    const rateBandIds = remainingIds.filter((id) => {
      const cls = sessionClassMap.get(id);
      return cls == null || cls.tuition_override_amount == null;
    });

    const lineItems: LineItem[] = [];
    let tuition = 0;
    let recitalFee = 0;

    // Path 1: Per-session priced sessions (additive, no recital fee)
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

    // Path 2: Class-level tuition overrides (one line item per unique class)
    if (overrideIds.length > 0) {
      const seenClasses = new Set<string>();
      for (const sid of overrideIds) {
        const cls = sessionClassMap.get(sid);
        if (!cls || seenClasses.has(cls.id)) continue;
        seenClasses.add(cls.id);
        const overrideAmount = round2(Number(cls.tuition_override_amount));
        tuition += overrideAmount;
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${cls.name} (custom rate)`,
          amount: overrideAmount,
        });
      }
    }

    // Path 3: Rate-band sessions (use division + count of this subset only)
    if (rateBandIds.length > 0) {
      // In per-day model, deduplicate by (class_id, day_of_week) so that
      // multiple dated instances of the same class count as 1 class/week.
      let bandCount: number;
      if (isPerDayModel) {
        const bandSessionRows = sessionRows.filter((s) =>
          rateBandIds.includes(s.id),
        );
        const bandClassDayPairs = new Set(
          bandSessionRows.map((s) => {
            const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
            const clsId = (cls as { id?: string } | null)?.id ?? "";
            const dow =
              (s as { day_of_week?: string | null }).day_of_week ?? "";
            return `${clsId}:${dow}`;
          }),
        );
        bandCount = bandClassDayPairs.size;
      } else {
        bandCount = weeklyClassCount;
      }
      const { data: rateBand, error: bandError } = await supabase
        .from("tuition_rate_bands")
        .select("base_tuition")
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
      tuition += bandTotal;
      lineItems.push(
        {
          type: "tuition",
          label: `Tuition (${divisionLabel(division)}, ${bandCount}x/week)`,
          amount: round2(bandTotal),
        },
      );
    }

    // Compute costume fee: per-class rate × standard weekly class count.
    // Junior: $55/class, Senior: $65/class (from semester_fee_config defaults).
    let recitalCostumeFeePerClass = 0;
    if (division === "senior") {
      recitalCostumeFeePerClass = feeConfig.senior_costume_fee_per_class;
    } else if (division === "junior") {
      recitalCostumeFeePerClass = feeConfig.junior_costume_fee_per_class;
    }
    const recitalCostumeFee = round2(
      recitalCostumeFeePerClass * standardWeeklyCount,
    );

    /* -------------------------------------------------------------------- */
    /* Division costume / video fees                                          */
    /* Only applied to standard (non-exempt) classes.                        */
    /* Senior → video fee (flat, per registrant) + costume (per std class)   */
    /* Junior → costume fee only (per std class); no video fee               */
    /* Technique / Pointe / Competition / Early Childhood → exempt           */
    /* -------------------------------------------------------------------- */
    let videoFee = 0;

    if (standardWeeklyCount > 0) {
      if (division === "senior") {
        videoFee = feeConfig.senior_video_fee_per_registrant;
        tuition += videoFee;
        tuition += recitalCostumeFee;
        recitalFee += recitalCostumeFee;

        lineItems.push(
          {
            type: "video_fee",
            label: "Video Fee (Senior)",
            amount: videoFee,
            description: "One-time video fee per senior registrant",
          },
          {
            type: "costume_fee",
            label: `Recital Costume Fee (${standardWeeklyCount} class${standardWeeklyCount !== 1 ? "es" : ""})`,
            amount: recitalCostumeFee,
            description: `$${feeConfig.senior_costume_fee_per_class} per class`,
          },
        );
      } else if (division === "junior") {
        tuition += recitalCostumeFee;
        recitalFee += recitalCostumeFee;
        lineItems.push({
          type: "costume_fee",
          label: `Recital Costume Fee (${standardWeeklyCount} class${standardWeeklyCount !== 1 ? "es" : ""})`,
          amount: recitalCostumeFee,
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
      costumeFee: round2(recitalCostumeFee),
      sessionDiscountTotal: round2(sessionDiscountTotal),
      registrationFee,
      lineItems,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Family-level aggregation                                              */
  /* ---------------------------------------------------------------------- */
  const tuitionSubtotal = round2(perDancer.reduce((s, d) => s + d.tuition, 0));
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
  const familyDiscountAmount =
    isDiscountEligible && familyDancerCount >= 2
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
  /* 8. Pre-coupon grand total                                              */
  /* ---------------------------------------------------------------------- */
  const preCouponTotal = round2(
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
  /* 10. Coupon / promo code                                                 */
  /* Evaluated after all other discounts; stackable flag controls whether    */
  /* it applies when threshold-based discounts are already active.           */
  /* ---------------------------------------------------------------------- */
  const allEnrolledSessionIds = input.enrollments.flatMap((e) => e.sessionIds);
  const hasThresholdDiscounts = perDancer.some(
    (d) => d.sessionDiscountTotal < 0,
  );

  type EligibleLineItemType = "tuition" | "registration_fee" | "recital_fee";
  const ALL_ELIGIBLE: EligibleLineItemType[] = ["tuition", "registration_fee", "recital_fee"];

  function computeEligibleBase(
    lineItems: LineItem[],
    eligibleTypes: string[] | null | undefined,
    mostExpensiveOnly: boolean | null | undefined,
  ): number {
    const types = (eligibleTypes?.length ? eligibleTypes : ALL_ELIGIBLE) as EligibleLineItemType[];
    const amounts = lineItems
      .filter((li) => li.amount > 0 && types.includes(li.type as EligibleLineItemType))
      .map((li) => li.amount);
    if (amounts.length === 0) return 0;
    return mostExpensiveOnly
      ? Math.max(...amounts)
      : round2(amounts.reduce((s, a) => s + a, 0));
  }

  let couponDiscount = 0;
  let appliedCouponId: string | undefined;
  let appliedCouponName: string | undefined;

  const resolvedFamilyId = familyId ?? "";

  // Try code-based coupon first, then auto-apply coupons
  const couponCandidates: Array<{ code: string | null }> = input.couponCode
    ? [{ code: input.couponCode }]
    : [{ code: null }];

  for (const candidate of couponCandidates) {
    if (!resolvedFamilyId) break;

    const now = new Date().toISOString();

    // Fetch matching coupon for this semester
    let couponQuery = supabase
      .from("semester_coupons")
      .select(
        `coupon:discount_coupons (
          id, name, code, value, value_type,
          valid_from, valid_until, max_total_uses, uses_count,
          max_per_family, stackable, eligible_sessions_mode, is_active,
          applies_to_most_expensive_only, eligible_line_item_types,
          coupon_session_restrictions ( session_id )
        )`,
      )
      .eq("semester_id", input.semesterId);

    if (candidate.code) {
      couponQuery = couponQuery.ilike("coupon.code", candidate.code.trim());
    } else {
      couponQuery = couponQuery.is("coupon.code", null);
    }

    const { data: couponLinks } = await couponQuery;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchedCoupons: any[] = (couponLinks ?? [])
      .map((row: any) => row.coupon)
      .filter(Boolean)
      .filter((c: any) =>
        candidate.code
          ? c.code?.toLowerCase() === candidate.code!.trim().toLowerCase()
          : c.code === null,
      )
      .filter((c: any) => c.is_active);

    for (const coupon of matchedCoupons) {
      // Date window
      if (coupon.valid_from && now < coupon.valid_from) continue;
      if (coupon.valid_until && now > coupon.valid_until) continue;
      // Usage cap
      if (
        coupon.max_total_uses !== null &&
        coupon.uses_count >= coupon.max_total_uses
      )
        continue;
      // Per-family limit
      const { count: redemptions } = await supabase
        .from("coupon_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("coupon_id", coupon.id)
        .eq("family_id", resolvedFamilyId);
      if ((redemptions ?? 0) >= coupon.max_per_family) continue;
      // Session eligibility
      if (coupon.eligible_sessions_mode === "selected") {
        const restrictedIds = new Set(
          (coupon.coupon_session_restrictions ?? []).map(
            (r: { session_id: string }) => r.session_id,
          ),
        );
        if (!allEnrolledSessionIds.some((id) => restrictedIds.has(id)))
          continue;
      }
      // Stackable check
      if (!coupon.stackable && hasThresholdDiscounts) continue;

      // Apply — first valid coupon wins
      const eligibleBase = computeEligibleBase(
        familyLineItems,
        coupon.eligible_line_item_types,
        coupon.applies_to_most_expensive_only,
      );
      const rawDiscount =
        coupon.value_type === "percent"
          ? round2((eligibleBase * Number(coupon.value)) / 100)
          : Number(coupon.value);
      couponDiscount = Math.min(rawDiscount, eligibleBase); // clamp: never exceed eligible base
      appliedCouponId = coupon.id;
      appliedCouponName = coupon.name;
      break;
    }
    if (couponDiscount > 0) break;
  }

  if (couponDiscount > 0) {
    familyLineItems.push({
      type: "coupon_discount",
      label: appliedCouponName ?? "Promo Code",
      amount: -couponDiscount,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 11. Final grand total (after coupon)                                   */
  /* ---------------------------------------------------------------------- */
  const grandTotal = round2(preCouponTotal - couponDiscount);

  /* ---------------------------------------------------------------------- */
  /* 12. Payment schedule                                                    */
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
    couponDiscount,
    appliedCouponId,
    appliedCouponName,
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
