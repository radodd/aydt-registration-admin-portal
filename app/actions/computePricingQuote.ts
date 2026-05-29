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

  // Admin-preview escape hatch (see PricingInput.tolerateMissingPrices). When
  // set, config-completeness gaps become $0 line items + a warning instead of a
  // hard throw, so a draft semester can be walked end-to-end before its prices
  // are filled in. Live checkout never sets this.
  const tolerateMissing = input.tolerateMissingPrices === true;
  const warnings: string[] = [];

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
      ["technique", "pre_pointe", "pointe", "early_childhood", "competition"]) as string[],
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
      .from("registration_orders")
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
         discount_rule_meetings ( meeting_id )
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
    (e) => (e.scheduleIds?.length ?? 0) > 0 || (e.sessionIds?.length ?? 0) > 0,
  ).length;

  /* ---------------------------------------------------------------------- */
  /* 3b. Fetch special program tuition (fixed-fee programs that bypass       */
  /*     rate bands: technique, pre_pointe, pointe, early_childhood,         */
  /*     competition_junior, competition_senior).                            */
  /* ---------------------------------------------------------------------- */
  const { data: specialProgramRows, error: specialProgramError } =
    await supabase
      .from("special_program_tuition")
      .select(
        "program_key, program_label, semester_total, registration_fee_override",
      )
      .eq("semester_id", input.semesterId);
  if (specialProgramError) throw new Error(specialProgramError.message);

  const specialProgramMap = new Map<
    string,
    { label: string; total: number; regOverride: number | null }
  >();
  for (const row of specialProgramRows ?? []) {
    specialProgramMap.set(row.program_key as string, {
      label: row.program_label as string,
      total: Number(row.semester_total),
      regOverride:
        (row as { registration_fee_override: number | null })
          .registration_fee_override != null
          ? Number(
              (row as { registration_fee_override: number | null })
                .registration_fee_override,
            )
          : null,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 3c. Fetch class_tiers prices for all tier IDs referenced in the input.   */
  /*     Tiered classes (classes.is_tiered=true) bypass rate bands and pull   */
  /*     their tuition from the selected tier's price_cents.                 */
  /* ---------------------------------------------------------------------- */
  const allTierIds = new Set<string>();
  for (const e of input.enrollments) {
    for (const id of Object.values(e.classTierIdsBySchedule ?? {})) {
      if (id) allTierIds.add(id);
    }
    for (const id of Object.values(e.classTierIdsBySession ?? {})) {
      if (id) allTierIds.add(id);
    }
  }
  const tierPriceMap = new Map<
    string,
    { classId: string; label: string; priceCents: number | null }
  >();
  if (allTierIds.size > 0) {
    const { data: tierRows, error: tierError } = await supabase
      .from("class_tiers")
      .select("id, class_id, label, price_cents")
      .in("id", [...allTierIds]);
    if (tierError) throw new Error(tierError.message);
    for (const row of tierRows ?? []) {
      tierPriceMap.set(row.id as string, {
        classId: row.class_id as string,
        label: row.label as string,
        priceCents:
          (row as { price_cents: number | null }).price_cents ?? null,
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Per-dancer computation                                                */
  /* ---------------------------------------------------------------------- */
  const perDancer: DancerPricingBreakdown[] = [];

  for (const {
    dancerId,
    dancerName: dancerNameOverride,
    scheduleIds,
    sessionIds,
  } of input.enrollments) {
    const hasSchedules = (scheduleIds?.length ?? 0) > 0;
    const hasSessions = (sessionIds?.length ?? 0) > 0;
    if (!hasSchedules && !hasSessions) continue;

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

    /* ---------------------------------------------------------------------- */
    /* Schedule-based path (class is the registrable unit)                     */
    /* ---------------------------------------------------------------------- */
    if (hasSchedules) {
      const { data: scheduleRows, error: scheduleError } = await supabase
        .from("class_sections")
        .select(
          "id, days_of_week, classes(id, name, division, discipline, is_competition_track, is_tiered, tuition_override_amount)",
        )
        .in("id", scheduleIds!);

      if (scheduleError) throw new Error(scheduleError.message);
      if (!scheduleRows || scheduleRows.length === 0) {
        throw new Error(`No schedules found for dancer ${dancerId}`);
      }

      type ScheduleClassInfo = {
        id: string;
        name: string;
        division: string;
        discipline: string;
        is_competition_track: boolean;
        is_tiered: boolean;
        tuition_override_amount: number | null;
      };

      const classesForDancer = scheduleRows.map((s) => {
        const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
        return cls as ScheduleClassInfo | null;
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

      // displayWeeklyCount = total weekly meetings across ALL enrolled
      // schedules (used for reporting). Counts (schedule_id, day) pairs so a
      // class meeting on Mon+Wed counts as 2, and two different classes both
      // on Monday also count as 2.
      const allPairs = new Set<string>();
      for (const s of scheduleRows) {
        const daysArr: number[] = (s as any).days_of_week ?? [];
        for (const d of daysArr) allPairs.add(`${s.id}:${d}`);
      }
      const weeklyClassCount = allPairs.size || scheduleRows.length;

      // Tiered classes default to no division-based fees (no costume / video /
      // reg fee). Per-tier fee opt-in is a future toggle that doesn't exist
      // yet — treat is_tiered as fee-exempt at the engine level. Competition
      // classes use the is_competition_track boolean (set in PaymentStep);
      // the division on the row is the dancer's age tier, not "competition".
      const isFeeExemptClass = (cls: {
        discipline: string;
        division: string;
        is_tiered?: boolean;
        is_competition_track?: boolean;
      }): boolean => {
        if (cls.is_tiered === true) return true;
        if (cls.is_competition_track === true) return true;
        const keys = feeConfig.costume_fee_exempt_keys;
        return (
          keys.includes(cls.discipline) ||
          (keys.includes("competition") && cls.division === "competition")
        );
      };

      const standardClasses = classesForDancer.filter(
        (c) => c !== null && !isFeeExemptClass(c),
      );

      // standardWeeklyCount: (schedule_id, day) pairs across standard
      // (non-exempt) schedules. Drives costume/video fee and is the count
      // passed to discount-rule threshold evaluation (mode-scoped per #2d:
      // tiered/drop-in/special enrollments don't count toward standard-mode
      // discount thresholds).
      const standardPairs = new Set<string>();
      for (const s of scheduleRows) {
        const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
        if (cls && !isFeeExemptClass(cls as ScheduleClassInfo)) {
          const daysArr: number[] = (s as any).days_of_week ?? [];
          for (const d of daysArr) standardPairs.add(`${s.id}:${d}`);
        }
      }
      const standardWeeklyCount = standardPairs.size || standardClasses.length;

      const lineItems: LineItem[] = [];
      let tuition = 0;
      let recitalFee = 0;

      // Classification priority: special-program > tiered > class-level override > rate band.
      const tierMapForDancer = input.enrollments.find(
        (e) => e.dancerId === dancerId,
      )?.classTierIdsBySchedule ?? {};

      const specialSchedules = scheduleRows.filter((s) => {
        const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
        return cls
          ? classifySpecialProgramKey(cls as ScheduleClassInfo) !== null
          : false;
      });
      const tieredSchedules = scheduleRows.filter((s) => {
        const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
        const c = cls as ScheduleClassInfo | null;
        return (
          c != null &&
          classifySpecialProgramKey(c) === null &&
          c.is_tiered === true
        );
      });
      const overrideSchedules = scheduleRows.filter((s) => {
        const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
        const c = cls as ScheduleClassInfo | null;
        return (
          c != null &&
          classifySpecialProgramKey(c) === null &&
          c.is_tiered !== true &&
          c.tuition_override_amount != null
        );
      });
      const rateBandSchedules = scheduleRows.filter((s) => {
        const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
        const c = cls as ScheduleClassInfo | null;
        return (
          c != null &&
          classifySpecialProgramKey(c) === null &&
          c.is_tiered !== true &&
          c.tuition_override_amount == null
        );
      });

      // Tiered path: each enrolled tiered section must have a tier selected.
      // Tuition = sum of class_tiers.price_cents/100; no costume/video/reg fee.
      for (const s of tieredSchedules) {
        const cls = (Array.isArray(s.classes) ? s.classes[0] : s.classes) as
          | ScheduleClassInfo
          | null;
        if (!cls) continue;
        const tierId = tierMapForDancer[s.id];
        if (!tierId) {
          throw new Error(
            `Tier not selected for tiered class "${cls.name}" (schedule ${s.id}).`,
          );
        }
        const tier = tierPriceMap.get(tierId);
        if (!tier) {
          throw new Error(
            `Selected tier ${tierId} for class "${cls.name}" was not found.`,
          );
        }
        if (tier.priceCents == null) {
          throw new Error(
            `Tier "${tier.label}" for class "${cls.name}" has no price configured.`,
          );
        }
        const tierTuition = round2(tier.priceCents / 100);
        tuition += tierTuition;
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${cls.name} (${tier.label})`,
          amount: tierTuition,
        });
      }

      // Special-program path: dedupe by program_key (each program billed once
      // per dancer even if they're enrolled in multiple sections of it).
      const dancerSpecialKeys = new Set<string>();
      for (const s of specialSchedules) {
        const cls = (Array.isArray(s.classes) ? s.classes[0] : s.classes) as
          | ScheduleClassInfo
          | null;
        if (!cls) continue;
        const key = classifySpecialProgramKey(cls);
        if (!key || dancerSpecialKeys.has(key)) continue;
        dancerSpecialKeys.add(key);
        const program = specialProgramMap.get(key);
        if (!program) {
          throw new Error(
            `No special program tuition configured for program_key="${key}" ` +
              `in semester ${input.semesterId}. ` +
              `Please configure special program tuition in the semester's Payment step.`,
          );
        }
        tuition += program.total;
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${program.label}`,
          amount: round2(program.total),
        });
      }

      // Override path: one line item per unique class with an override
      if (overrideSchedules.length > 0) {
        const seenClasses = new Set<string>();
        for (const s of overrideSchedules) {
          const cls = (Array.isArray(s.classes) ? s.classes[0] : s.classes) as ScheduleClassInfo | null;
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

      // Rate-band path: one lookup for all non-override schedules
      if (rateBandSchedules.length > 0) {
        // bandCount: (schedule_id, day) pairs across rate-band-eligible
        // schedules only. Mode-scoped — tiered/drop-in/special/override
        // are billed separately and must not inflate the band lookup.
        const bandPairs = new Set<string>();
        for (const s of rateBandSchedules) {
          const daysArr: number[] = (s as any).days_of_week ?? [];
          for (const d of daysArr) bandPairs.add(`${s.id}:${d}`);
        }
        const bandCount = bandPairs.size || rateBandSchedules.length;

        const { data: rateBand, error: bandError } = await supabase
          .from("tuition_rate_bands")
          .select("base_tuition")
          .eq("semester_id", input.semesterId)
          .eq("division", division)
          .eq("weekly_class_count", bandCount)
          .maybeSingle();

        if (bandError) throw new Error(bandError.message);
        if (!rateBand) {
          if (!tolerateMissing) {
            throw new Error(
              `No tuition rate configured for division="${division}", ` +
                `weekly_class_count=${bandCount} in semester ${input.semesterId}. ` +
                `Please configure tuition rate bands in the semester's Payment step.`,
            );
          }
          warnings.push(
            `${divisionLabel(division)} (${bandCount}x/week): no tuition rate band configured (counted as $0).`,
          );
          lineItems.push({
            type: "tuition",
            label: `Tuition (${divisionLabel(division)}, ${bandCount}x/week)`,
            amount: 0,
            description: "Rate band not configured",
          });
        } else {
          const bandTotal = Number(rateBand.base_tuition);
          tuition += bandTotal;
          lineItems.push({
            type: "tuition",
            label: `Tuition (${divisionLabel(division)}, ${bandCount}x/week)`,
            amount: round2(bandTotal),
          });
        }
      }

      // Costume / video fees (same logic as session path)
      let recitalCostumeFeePerClass = 0;
      if (division === "senior") {
        recitalCostumeFeePerClass = feeConfig.senior_costume_fee_per_class;
      } else if (division === "junior") {
        recitalCostumeFeePerClass = feeConfig.junior_costume_fee_per_class;
      }
      const recitalCostumeFee = round2(recitalCostumeFeePerClass * standardWeeklyCount);

      let videoFee = 0;
      if (standardWeeklyCount > 0) {
        if (division === "senior") {
          videoFee = feeConfig.senior_video_fee_per_registrant;
          tuition += videoFee;
          tuition += recitalCostumeFee;
          recitalFee += recitalCostumeFee;
          lineItems.push(
            { type: "video_fee", label: "Video Fee (Senior)", amount: videoFee, description: "One-time video fee per senior registrant" },
            { type: "costume_fee", label: `Recital Costume Fee (${standardWeeklyCount} class${standardWeeklyCount !== 1 ? "es" : ""})`, amount: recitalCostumeFee, description: `$${feeConfig.senior_costume_fee_per_class} per class` },
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

      // Session/class discount rules — threshold count is the STANDARD-mode
      // count (mode-scoped per #2d), not the all-modes display count.
      let sessionDiscountTotal = 0;
      const percentRules = getApplicableRules(activeDiscounts, [], familyDancerCount, standardWeeklyCount, "percent");
      for (const rule of percentRules) {
        const reduction = round2(tuition * (rule.value / 100));
        tuition = round2(tuition - reduction);
        sessionDiscountTotal = round2(sessionDiscountTotal - reduction);
        lineItems.push({ type: "session_discount", label: `Discount: ${rule.discountName}`, amount: -reduction, description: `${rule.value}% off tuition` });
      }
      const flatRules = getApplicableRules(activeDiscounts, [], familyDancerCount, standardWeeklyCount, "flat");
      for (const rule of flatRules) {
        const reduction = Math.min(rule.value, tuition);
        tuition = round2(tuition - reduction);
        sessionDiscountTotal = round2(sessionDiscountTotal - reduction);
        lineItems.push({ type: "session_discount", label: `Discount: ${rule.discountName}`, amount: -reduction });
      }

      // Registration fee:
      //  - Dancer enrolled ONLY in special-program classes → use the program's
      //    registration_fee_override. Multi-special-program edge case picks
      //    the max override deterministically (memory says specials don't mix,
      //    so this is defensive against Set iteration ordering).
      //  - Else fall back to the existing exempt-list rule.
      const nonSpecialClasses = classesForDancer.filter(
        (c) => c !== null && classifySpecialProgramKey(c) === null,
      );
      let registrationFee: number;
      if (
        nonSpecialClasses.length === 0 &&
        dancerSpecialKeys.size > 0
      ) {
        let maxOverride: number | null = null;
        for (const key of dancerSpecialKeys) {
          const program = specialProgramMap.get(key);
          const candidate = program?.regOverride ?? null;
          if (candidate != null) {
            maxOverride = maxOverride == null ? candidate : Math.max(maxOverride, candidate);
          }
        }
        registrationFee =
          maxOverride ?? feeConfig.registration_fee_per_child;
      } else {
        const allClassesAreExempt =
          classesForDancer.length > 0 &&
          classesForDancer.every((c) => c !== null && isFeeExemptClass(c));
        registrationFee = allClassesAreExempt
          ? 0
          : feeConfig.registration_fee_per_child;
      }
      if (registrationFee > 0) {
        lineItems.push({ type: "registration_fee", label: "Registration Fee", amount: registrationFee });
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

      continue; // skip the session-based path below
    }

    /* ---------------------------------------------------------------------- */
    /* Session-based path (legacy / drop-in mode)                              */
    /* ---------------------------------------------------------------------- */
    const resolvedSessionIds = sessionIds!;

    // Fetch the class + schedule_date for each session
    const { data: sessionRows, error: sessionError } = await supabase
      .from("class_meetings")
      .select(
        "id, schedule_date, day_of_week, drop_in_price, class_sections(is_drop_in), classes(id, name, division, discipline, is_competition_track, is_tiered, tuition_override_amount)",
      )
      .in("id", resolvedSessionIds);

    if (sessionError) throw new Error(sessionError.message);
    if (!sessionRows || sessionRows.length === 0) {
      throw new Error(`No sessions found for dancer ${dancerId}`);
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
        is_tiered: boolean;
        tuition_override_amount: number | null;
      } | null;
    });

    // Per-meeting drop-in detection: section's is_drop_in flag is the source
    // of truth (Phase 2). Map each sessionId → { isDropIn, dropInPrice }.
    type MeetingDropInInfo = { isDropIn: boolean; dropInPrice: number | null };
    const meetingDropInMap = new Map<string, MeetingDropInInfo>();
    for (const row of sessionRows) {
      const section = Array.isArray((row as any).class_sections)
        ? (row as any).class_sections[0]
        : (row as any).class_sections;
      const isDropIn = section?.is_drop_in === true;
      const dropInPrice =
        (row as { drop_in_price: number | null }).drop_in_price != null
          ? Number((row as { drop_in_price: number | null }).drop_in_price)
          : null;
      meetingDropInMap.set(row.id, { isDropIn, dropInPrice });
    }
    const dropInSessionIds = new Set(
      resolvedSessionIds.filter(
        (id) => meetingDropInMap.get(id)?.isDropIn === true,
      ),
    );

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
      weeklyClassCount = resolvedSessionIds.length;
    }

    // Classify each class as "standard" or "fee-exempt".
    // Fee-exempt programs (technique, pointe, competition) skip the
    // registration fee and video/costume fees entirely.
    // Early childhood has no video/costume fees but DOES pay registration.
    // Tiered classes default to no division-based fees (no costume / video /
    // reg fee). Per-tier fee opt-in is a future toggle that doesn't exist
    // yet — treat is_tiered as fee-exempt at the engine level. Competition
    // classes use the is_competition_track boolean (set in PaymentStep);
    // the division on the row is the dancer's age tier, not "competition".
    const isFeeExemptClass = (cls: {
      discipline: string;
      division: string;
      is_tiered?: boolean;
      is_competition_track?: boolean;
    }): boolean => {
      if (cls.is_tiered === true) return true;
      if (cls.is_competition_track === true) return true;
      const keys = feeConfig.costume_fee_exempt_keys;
      return (
        keys.includes(cls.discipline) ||
        (keys.includes("competition") && cls.division === "competition")
      );
    };

    // Costume / video fee math is keyed off the dancer's standard (non-exempt,
    // non-drop-in) classes. Drop-in meetings always count as fee-exempt per the
    // Phase 2 pricing model (see #2c).
    const nonDropInSessionRows = sessionRows.filter(
      (s) => !dropInSessionIds.has(s.id),
    );
    const nonDropInClassesForDancer = nonDropInSessionRows.map((s) => {
      const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
      return cls as {
        id: string;
        name: string;
        division: string;
        discipline: string;
        is_competition_track: boolean;
        is_tiered: boolean;
        tuition_override_amount: number | null;
      } | null;
    });

    const standardClasses = nonDropInClassesForDancer.filter(
      (c) => c !== null && !isFeeExemptClass(c),
    );

    // Weekly class count used for costume fee: only standard (non-exempt) classes.
    let standardWeeklyCount: number;
    if (isPerDayModel) {
      const stdClassDayPairs = new Set(
        nonDropInSessionRows
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

    // Pricing paths (priority order):
    //   1. Drop-in              → class_meetings.drop_in_price (section.is_drop_in)
    //   2. Special program      → special_program_tuition.semester_total
    //   3. Tiered               → class_tiers.price_cents of the selected tier
    //   4. Class-level override → flat class tuition bypassing rate bands
    //   5. Rate-band lookup     → division + weekly count progressive tiers
    // The legacy class_meeting_price_rows table is no longer consulted (#2g).

    // Build sessionId → class map for override + special-program lookups.
    type SessionClassInfo = {
      id: string;
      name: string;
      division: string;
      discipline: string;
      is_competition_track: boolean;
      is_tiered: boolean;
      tuition_override_amount: number | null;
    };
    const sessionClassMap = new Map<string, SessionClassInfo>();
    for (const row of sessionRows) {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      if (cls) sessionClassMap.set(row.id, cls as SessionClassInfo);
    }

    const tierMapForDancer =
      input.enrollments.find((e) => e.dancerId === dancerId)
        ?.classTierIdsBySession ?? {};

    // Classification priority: drop-in > special-program > tiered >
    // per-session price rows (legacy) > class override > rate band.
    const dropInIds = resolvedSessionIds.filter((id) =>
      dropInSessionIds.has(id),
    );
    const nonDropInIds = resolvedSessionIds.filter(
      (id) => !dropInSessionIds.has(id),
    );

    const afterPerSessionIds = nonDropInIds;

    const specialIds = afterPerSessionIds.filter((id) => {
      const cls = sessionClassMap.get(id);
      return cls != null && classifySpecialProgramKey(cls) !== null;
    });
    const tieredIds = afterPerSessionIds.filter((id) => {
      if (specialIds.includes(id)) return false;
      const cls = sessionClassMap.get(id);
      return cls != null && cls.is_tiered === true;
    });
    const remainingIds = afterPerSessionIds.filter(
      (id) => !specialIds.includes(id) && !tieredIds.includes(id),
    );
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

    // Path -1: Drop-in meetings. Tuition = class_meetings.drop_in_price; one
    // line item per meeting. No costume/video/registration fee.
    if (dropInIds.length > 0) {
      let dropInTotal = 0;
      for (const sid of dropInIds) {
        const info = meetingDropInMap.get(sid);
        const cls = sessionClassMap.get(sid);
        if (info?.dropInPrice == null) {
          if (!tolerateMissing) {
            throw new Error(
              `Drop-in meeting ${sid}${cls ? ` (${cls.name})` : ""} has no drop_in_price configured.`,
            );
          }
          warnings.push(
            `${cls?.name ?? "Drop-in class"}: no drop-in price configured (counted as $0).`,
          );
          continue; // treat as $0
        }
        dropInTotal += info.dropInPrice;
      }
      const total = round2(dropInTotal);
      tuition += total;
      lineItems.push({
        type: "tuition",
        label: `Tuition (${dropInIds.length} drop-in${dropInIds.length !== 1 ? "s" : ""})`,
        amount: total,
      });
    }

    // Path 0: Special-program classes (fixed semester tuition; bypass rate bands).
    // Dedupe by program_key so each program bills once per dancer.
    const dancerSpecialKeys = new Set<string>();
    for (const sid of specialIds) {
      const cls = sessionClassMap.get(sid);
      if (!cls) continue;
      const key = classifySpecialProgramKey(cls);
      if (!key || dancerSpecialKeys.has(key)) continue;
      dancerSpecialKeys.add(key);
      const program = specialProgramMap.get(key);
      if (!program) {
        if (!tolerateMissing) {
          throw new Error(
            `No special program tuition configured for program_key="${key}" ` +
              `in semester ${input.semesterId}. ` +
              `Please configure special program tuition in the semester's Payment step.`,
          );
        }
        warnings.push(
          `${cls.name}: no special-program tuition configured (counted as $0).`,
        );
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${cls.name}`,
          amount: 0,
          description: "Price not configured",
        });
        continue; // treat as $0
      }
      tuition += program.total;
      lineItems.push({
        type: "tuition",
        label: `Tuition — ${program.label}`,
        amount: round2(program.total),
      });
    }

    // Path 0b: Tiered classes (classes.is_tiered=true). Tuition = the selected
    // tier's price_cents/100; no costume/video/registration fees.
    for (const sid of tieredIds) {
      const cls = sessionClassMap.get(sid);
      if (!cls) continue;
      const tierId = tierMapForDancer[sid];
      if (!tierId) {
        if (!tolerateMissing) {
          throw new Error(
            `Tier not selected for tiered class "${cls.name}" (session ${sid}).`,
          );
        }
        warnings.push(`${cls.name}: no tier selected (counted as $0).`);
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${cls.name}`,
          amount: 0,
          description: "Tier not selected",
        });
        continue; // treat as $0
      }
      const tier = tierPriceMap.get(tierId);
      if (!tier) {
        if (!tolerateMissing) {
          throw new Error(
            `Selected tier ${tierId} for class "${cls.name}" was not found.`,
          );
        }
        warnings.push(`${cls.name}: selected tier not found (counted as $0).`);
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${cls.name}`,
          amount: 0,
          description: "Tier not found",
        });
        continue; // treat as $0
      }
      if (tier.priceCents == null) {
        if (!tolerateMissing) {
          throw new Error(
            `Tier "${tier.label}" for class "${cls.name}" has no price configured.`,
          );
        }
        warnings.push(
          `${cls.name} (${tier.label}): no tier price configured (counted as $0).`,
        );
        lineItems.push({
          type: "tuition",
          label: `Tuition — ${cls.name} (${tier.label})`,
          amount: 0,
          description: "Price not configured",
        });
        continue; // treat as $0
      }
      const tierTuition = round2(tier.priceCents / 100);
      tuition += tierTuition;
      lineItems.push({
        type: "tuition",
        label: `Tuition — ${cls.name} (${tier.label})`,
        amount: tierTuition,
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
        // Legacy model: scope to rate-band-eligible sessions only (per #2d).
        bandCount = rateBandIds.length;
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
        if (!tolerateMissing) {
          throw new Error(
            `No tuition rate configured for division="${division}", ` +
              `weekly_class_count=${bandCount} in semester ${input.semesterId}. ` +
              `Please configure tuition rate bands in the semester's Payment step.`,
          );
        }
        warnings.push(
          `${divisionLabel(division)} (${bandCount}x/week): no tuition rate band configured (counted as $0).`,
        );
        lineItems.push({
          type: "tuition",
          label: `Tuition (${divisionLabel(division)}, ${bandCount}x/week)`,
          amount: 0,
          description: "Rate band not configured",
        });
      } else {
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

    // Discount-rule threshold count is STANDARD-mode scoped (per #2d);
    // tiered/drop-in/special enrollments do not count toward standard-mode
    // discount thresholds.
    const percentRules = getApplicableRules(
      activeDiscounts,
      sessionIds ?? [],
      familyDancerCount,
      standardWeeklyCount,
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
      sessionIds ?? [],
      familyDancerCount,
      standardWeeklyCount,
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
    // Registration fee:
    //  - Dancer enrolled ONLY in special-program classes (drop-in meetings
    //    excluded from this check — they have their own no-fee model) →
    //    use the program's registration_fee_override.
    //  - Else fall back to the existing exempt-list rule.
    const nonSpecialNonDropInClasses = nonDropInClassesForDancer.filter(
      (c) => c !== null && classifySpecialProgramKey(c) === null,
    );
    let registrationFee: number;
    if (
      nonSpecialNonDropInClasses.length === 0 &&
      dancerSpecialKeys.size > 0
    ) {
      // Multi-special-program edge case: pick the max override deterministically
      // (Set iteration would otherwise be insertion-order dependent). Memory's
      // resolved interpretation says specials don't mix in a single semester,
      // so this is defensive; max keeps us conservative if it ever happens.
      let maxOverride: number | null = null;
      for (const key of dancerSpecialKeys) {
        const program = specialProgramMap.get(key);
        const candidate = program?.regOverride ?? null;
        if (candidate != null) {
          maxOverride = maxOverride == null ? candidate : Math.max(maxOverride, candidate);
        }
      }
      registrationFee =
        maxOverride ?? feeConfig.registration_fee_per_child;
    } else {
      // Drop-in meetings count as fee-exempt (no reg fee). Use the
      // non-drop-in projection so a dancer with ONLY drop-in meetings pays $0.
      const allClassesAreExempt =
        nonDropInClassesForDancer.length === 0 ||
        nonDropInClassesForDancer.every(
          (c) => c !== null && isFeeExemptClass(c),
        );
      registrationFee = allClassesAreExempt
        ? 0
        : feeConfig.registration_fee_per_child;
    }
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
  const allEnrolledSessionIds = input.enrollments.flatMap((e) => e.sessionIds ?? []);
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
          coupon_session_restrictions ( meeting_id )
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
            (r: { meeting_id: string }) => r.meeting_id,
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
    warnings: warnings.length > 0 ? warnings : undefined,
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
  discount_rule_meetings: Array<{ meeting_id: string | null }>;
}

/**
 * Returns applicable discount rules for a dancer, filtered by value_type.
 * Eligibility checks:
 *   - eligible_sessions_mode === 'all' → always eligible
 *   - eligible_sessions_mode === 'selected' → dancer must have at least one
 *     session that is in discount_rule_meetings
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
        discount.discount_rule_meetings
          .map((s) => s.meeting_id)
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

/**
 * Returns the `special_program_tuition.program_key` a class maps to,
 * or null if the class is a standard rate-band class.
 *
 * Mirrors how PaymentStep authors the program rows (the source of truth):
 *   - `is_competition_track` → competition_junior / competition_senior
 *     (disambiguated by the class's own `division` column)
 *   - discipline = technique / pre_pointe / pointe → matching key
 *   - division = early_childhood → "early_childhood"
 */
function classifySpecialProgramKey(cls: {
  discipline: string;
  division: string;
  is_competition_track: boolean;
}): string | null {
  if (cls.is_competition_track) {
    return cls.division === "senior"
      ? "competition_senior"
      : "competition_junior";
  }
  if (cls.discipline === "technique") return "technique";
  if (cls.discipline === "pre_pointe") return "pre_pointe";
  if (cls.discipline === "pointe") return "pointe";
  if (cls.division === "early_childhood") return "early_childhood";
  return null;
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
