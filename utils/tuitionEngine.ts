/**
 * utils/tuitionEngine.ts
 *
 * Centralized tuition calculation engine.
 *
 * Supports two pricing modes:
 *   1. Standard division classes — progressive discounts on additional weekly classes.
 *   2. Special programs — fixed semester totals (Technique, Pointe, Competition, Early Childhood).
 *
 * Hard weekly class limits enforced here:
 *   Junior  → max 3 classes/week
 *   Senior  → max 6 classes/week
 */

import type {
  DraftTuitionRateBand,
  DraftSpecialProgramTuition,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Weekly class hard limits
// ─────────────────────────────────────────────────────────────────────────────

const WEEKLY_LIMITS: Record<string, number> = {
  junior: 3,
  senior: 6,
};

/**
 * Returns an error message if `weeklyCount` exceeds the division's hard limit,
 * or null if within bounds.
 */
export function validateWeeklyLimit(
  division: string,
  weeklyCount: number,
): string | null {
  const limit = WEEKLY_LIMITS[division];
  if (limit !== undefined && weeklyCount > limit) {
    const divLabel = division.charAt(0).toUpperCase() + division.slice(1);
    return `${divLabel} Division is limited to ${limit} class${limit !== 1 ? "es" : ""} per week. Remove a class to continue.`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Special program classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if this class uses a fixed special-program rate and should
 * bypass the division-based progressive discount calculation.
 */
export function isSpecialProgramClass(cls: {
  discipline: string;
  division: string;
}): boolean {
  return (
    cls.discipline === "technique" ||
    cls.discipline === "pointe" ||
    cls.division === "early_childhood" ||
    cls.division === "competition"
  );
}

/**
 * Maps a class's discipline/division/level to the canonical `program_key`
 * used in `special_program_tuition`.
 *
 * Returns null if the class is not a special program.
 */
export function getSpecialProgramKey(cls: {
  discipline: string;
  division: string;
  level?: string | null;
}): string | null {
  if (cls.discipline === "technique") return "technique";
  if (cls.discipline === "pointe") {
    // Pre-Pointe classes have "pre" in their level field
    if (cls.level?.toLowerCase().includes("pre")) return "pre_pointe";
    return "pointe";
  }
  if (cls.division === "early_childhood") return "early_childhood";
  if (cls.division === "competition") {
    // Competition division is always looked up by the caller with the correct
    // junior/senior key. Default to competition_junior as a fallback.
    return "competition_junior";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuition calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface TuitionCalculationInput {
  division: string;
  /** Total weekly sessions this dancer is enrolled in (determines discount tier). */
  weeklyClassCount: number;
  discipline: string;
  level?: string | null;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
  /** Per-class costume fee for junior standard classes (default 55). */
  juniorCostumeFeePerClass?: number;
  /** Per-class costume fee for senior standard classes (default 65). */
  seniorCostumeFeePerClass?: number;
  /** Flat video fee for senior registrants (default 15). */
  seniorVideoFeePerRegistrant?: number;
}

export interface TuitionCalculationResult {
  semesterTotal: number;
  autoPayInstallmentAmount: number | null;
  autoPayInstallmentCount: number | null;
  isSpecialProgram: boolean;
  /** How the result was resolved — used by UI for display hints. */
  source: "rate_band" | "special_program" | "unresolved";
  /** Hard-block validation error (weekly limit exceeded, missing rate). */
  validationError: string | null;
  /**
   * Itemised fee breakdown (informational; not authoritative — use
   * computePricingQuote for authoritative totals).
   */
  fees: {
    baseTuition: number;
    registrationFee: number;
    videoFee: number;
    costumeFee: number;
  };
}

const ZERO_FEES = { baseTuition: 0, registrationFee: 0, videoFee: 0, costumeFee: 0 };

const UNRESOLVED: TuitionCalculationResult = {
  semesterTotal: 0,
  autoPayInstallmentAmount: null,
  autoPayInstallmentCount: null,
  isSpecialProgram: false,
  source: "unresolved",
  validationError: null,
  fees: ZERO_FEES,
};

/**
 * Calculate the tuition for a single class based on the semester's configured
 * rate bands and special program overrides.
 *
 * Priority:
 *   1. Hard limit check (blocks if weeklyCount exceeds division maximum)
 *   2. Special program override (technique, pointe, early_childhood, competition)
 *   3. Standard division rate band (indexed by weeklyClassCount)
 */
export function calculateClassTuition(
  input: TuitionCalculationInput,
): TuitionCalculationResult {
  const {
    division,
    weeklyClassCount,
    discipline,
    level,
    rateBands,
    specialRates,
    juniorCostumeFeePerClass = 55,
    seniorCostumeFeePerClass = 65,
    seniorVideoFeePerRegistrant = 15,
  } = input;

  // 1. Hard weekly limit check
  const limitError = validateWeeklyLimit(division, weeklyClassCount);
  if (limitError) {
    return {
      ...UNRESOLVED,
      validationError: limitError,
    };
  }

  // 2. Special program override — fixed fee, no progressive discounts
  if (isSpecialProgramClass({ discipline, division })) {
    const key = getSpecialProgramKey({ discipline, division, level });
    const rate = key ? specialRates.find((r) => r.programKey === key) : null;
    if (!rate) {
      return { ...UNRESOLVED, isSpecialProgram: true };
    }
    return {
      semesterTotal: rate.semesterTotal,
      autoPayInstallmentAmount: rate.autoPayInstallmentAmount,
      autoPayInstallmentCount: rate.autoPayInstallmentCount,
      isSpecialProgram: true,
      source: "special_program",
      validationError: null,
      // Special programs: no registration, video, or costume fees
      fees: {
        baseTuition: rate.semesterTotal,
        registrationFee: rate.registrationFeeOverride ?? 0,
        videoFee: 0,
        costumeFee: 0,
      },
    };
  }

  // 3. Standard division — look up the rate band for this weekly class count.
  //    If no band exists for this count, it means the student has exceeded the
  //    configured tiers → hard block (same as weekly limit enforcement).
  const band = rateBands.find(
    (b) =>
      b.division === division && b.weekly_class_count === weeklyClassCount,
  );
  if (!band) {
    return {
      ...UNRESOLVED,
      validationError: `No tuition rate configured for ${division} division with ${weeklyClassCount} class${weeklyClassCount !== 1 ? "es" : ""} per week. Contact the studio administrator.`,
    };
  }
  if (!band.semester_total) {
    // Band exists but semester_total not yet set — return unresolved without error
    return { ...UNRESOLVED };
  }

  const registrationFee = 40; // global default; PaymentStep feeConfig is authoritative
  const videoFee = division === "senior" ? seniorVideoFeePerRegistrant : 0;
  const costumeFeePerClass =
    division === "senior" ? seniorCostumeFeePerClass : juniorCostumeFeePerClass;
  const costumeFee =
    division === "early_childhood" ? 0 : Math.round(costumeFeePerClass * weeklyClassCount * 100) / 100;

  return {
    semesterTotal: band.semester_total,
    autoPayInstallmentAmount: band.autopay_installment_amount ?? null,
    autoPayInstallmentCount: null, // Installment count comes from semester_fee_config
    isSpecialProgram: false,
    source: "rate_band",
    validationError: null,
    fees: {
      baseTuition: band.base_tuition,
      registrationFee,
      videoFee,
      costumeFee,
    },
  };
}
