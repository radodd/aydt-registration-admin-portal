import { describe, it, expect } from "vitest";
import { calculateClassTuition } from "@/utils/tuitionEngine";

// Per #2e: tuitionEngine no longer reads band.semester_total. It derives
// semesterTotal = base_tuition + registrationFee + videoFee + costumeFee so
// the admin draft preview agrees with what computePricingQuote charges.

const JUNIOR_BAND_1X = {
  id: "band-jr-1",
  division: "junior",
  weekly_class_count: 1,
  base_tuition: 775.93,
  // Legacy semester_total left intentionally WRONG to prove it's ignored.
  semester_total: 999_999,
  autopay_installment_amount: null,
  recital_fee: 0,
  progressive_discount_percent: 0,
};

const SENIOR_BAND_1X = {
  ...JUNIOR_BAND_1X,
  id: "band-sr-1",
  division: "senior",
  base_tuition: 796.43,
};

describe("tuitionEngine.calculateClassTuition — #2e convergence", () => {
  it("junior 1x/week → semesterTotal = base_tuition + reg + costume", () => {
    const result = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [JUNIOR_BAND_1X],
      specialRates: [],
    });
    // 775.93 (base) + 40 (reg) + 55 (jr costume × 1) = 870.93
    expect(result.semesterTotal).toBe(870.93);
    expect(result.source).toBe("rate_band");
    expect(result.fees.baseTuition).toBe(775.93);
    expect(result.fees.registrationFee).toBe(40);
    expect(result.fees.videoFee).toBe(0);
    expect(result.fees.costumeFee).toBe(55);
  });

  it("senior 1x/week → includes $15 video + $65 costume", () => {
    const result = calculateClassTuition({
      division: "senior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [SENIOR_BAND_1X],
      specialRates: [],
    });
    // 796.43 + 40 + 15 (video) + 65 (sr costume × 1) = 916.43
    expect(result.semesterTotal).toBe(916.43);
    expect(result.fees.videoFee).toBe(15);
    expect(result.fees.costumeFee).toBe(65);
  });

  it("derives total even if legacy band.semester_total is wildly wrong", () => {
    // The legacy column on JUNIOR_BAND_1X is 999_999. Engine must ignore it
    // and produce the derived value.
    const result = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [JUNIOR_BAND_1X],
      specialRates: [],
    });
    expect(result.semesterTotal).not.toBe(999_999);
    expect(result.semesterTotal).toBe(870.93);
  });

  it("respects registrationFeePerChild override", () => {
    const result = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [JUNIOR_BAND_1X],
      specialRates: [],
      registrationFeePerChild: 50,
    });
    // 775.93 + 50 + 55 = 880.93
    expect(result.semesterTotal).toBe(880.93);
    expect(result.fees.registrationFee).toBe(50);
  });

  it("band with NULL base_tuition → unresolved", () => {
    const result = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [{ ...JUNIOR_BAND_1X, base_tuition: null as any }],
      specialRates: [],
    });
    expect(result.source).toBe("unresolved");
    expect(result.validationError).toBeNull();
  });

  it("special program still reads from specialRates.semesterTotal", () => {
    const result = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "technique",
      rateBands: [],
      specialRates: [
        {
          programKey: "technique",
          semesterTotal: 600,
          autoPayInstallmentAmount: null,
          autoPayInstallmentCount: null,
          registrationFeeOverride: 0,
        } as any,
      ],
    });
    expect(result.source).toBe("special_program");
    expect(result.semesterTotal).toBe(600);
  });
});
