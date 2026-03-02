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
 * @throws Error if required configuration is missing (no fee config,
 *   no rate band for a given division/class count)
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
  };

  /* ---------------------------------------------------------------------- */
  /* 2. Resolve family ID and check if discount already applied              */
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
  /* 3. Per-dancer computation                                                */
  /* ---------------------------------------------------------------------- */
  const perDancer: DancerPricingBreakdown[] = [];

  for (const { dancerId, dancerName: dancerNameOverride, sessionIds } of input.enrollments) {
    if (sessionIds.length === 0) continue;

    // Fetch the class for each session (to get division)
    const { data: sessionRows, error: sessionError } = await supabase
      .from("class_sessions")
      .select("id, classes(id, name, division, is_competition_track)")
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

    // Weekly class count = number of enrolled sessions (each session = 1 class/week)
    const weeklyClassCount = sessionIds.length;

    // Look up tuition rate band
    const { data: rateBand, error: bandError } = await supabase
      .from("tuition_rate_bands")
      .select("base_tuition, recital_fee_included")
      .eq("semester_id", input.semesterId)
      .eq("division", division)
      .eq("weekly_class_count", weeklyClassCount)
      .maybeSingle();

    if (bandError) throw new Error(bandError.message);
    if (!rateBand) {
      throw new Error(
        `No tuition rate configured for division="${division}", ` +
          `weekly_class_count=${weeklyClassCount} in semester ${input.semesterId}. ` +
          `Please configure tuition rate bands in the semester's Payment step.`,
      );
    }

    const tuition = Number(rateBand.base_tuition);
    const recitalFee = Number(rateBand.recital_fee_included);
    const tuitionBase = round2(tuition - recitalFee);
    const registrationFee = feeConfig.registration_fee_per_child;

    const lineItems: LineItem[] = [
      {
        type: "tuition",
        label: `Tuition (${divisionLabel(division)}, ${weeklyClassCount}x/week)`,
        amount: tuitionBase,
      },
      { type: "recital_fee", label: "Recital Fee", amount: recitalFee },
      {
        type: "registration_fee",
        label: "Registration Fee",
        amount: registrationFee,
      },
    ];

    perDancer.push({
      dancerId,
      dancerName,
      division,
      weeklyClassCount,
      tuition,
      recitalFee,
      registrationFee,
      lineItems,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Family-level aggregation                                              */
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
  /* 5. Family discount: $X flat, once per family per semester                */
  /* ---------------------------------------------------------------------- */
  const familyDiscountAmount = isDiscountEligible
    ? feeConfig.family_discount_amount
    : 0;

  /* ---------------------------------------------------------------------- */
  /* 6. Auto-pay admin fee: $X/month × installment count                     */
  /* ---------------------------------------------------------------------- */
  const autoPayAdminFeeTotal =
    input.paymentPlanType === "auto_pay_monthly"
      ? round2(
          feeConfig.auto_pay_admin_fee_monthly *
            feeConfig.auto_pay_installment_count,
        )
      : 0;

  /* ---------------------------------------------------------------------- */
  /* 7. Grand total                                                           */
  /* ---------------------------------------------------------------------- */
  const grandTotal = round2(
    tuitionSubtotal +
      registrationFeeTotal -
      familyDiscountAmount +
      autoPayAdminFeeTotal,
  );

  /* ---------------------------------------------------------------------- */
  /* 8. Family-level line items                                               */
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
  /* 9. Payment schedule                                                      */
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
