/**
 * Cross-mode convergence test (end-to-end #2a–#2g + flags #1–#2).
 *
 * Verifies that for the SAME class data, tuitionEngine (admin draft preview)
 * and computePricingQuote (authoritative charge engine) produce matching
 * dollar totals across every mode. Locks in the pricing-engine consolidation.
 *
 * Modes covered:
 *   1. Standard rate band — junior 1×/wk
 *   2. Standard rate band — senior 1×/wk (with video + costume)
 *   3. Special program — technique (reg override 0)
 *   4. Special program — early childhood (reg override 40)
 *   5. Special program — competition_senior (is_competition_track=true)
 *   6. Tiered — single tier price_cents
 *   7. Drop-in — class_meetings.drop_in_price
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeChain,
  makeSupabaseMock,
  makePricingInput,
  MOCK_FEE_CONFIG_ROW,
  MOCK_JUNIOR_RATE_BAND_ROW,
  MOCK_SENIOR_RATE_BAND_ROW,
  MOCK_JUNIOR_SESSION_ROW,
  MOCK_SENIOR_SESSION_ROW,
  SEM_ID,
  SESSION_BALLET_ID,
  SESSION_CONTEMP_ID,
  DANCER_ID,
} from "../actions/fixtures/pricingFixtures";

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/utils/buildPaymentSchedule", () => ({
  buildPaymentSchedule: vi.fn().mockReturnValue({
    amountDueNow: 0,
    schedule: [],
  }),
}));

import { createClient } from "@/utils/supabase/server";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { calculateClassTuition } from "@/utils/tuitionEngine";

const mockCreateClient = vi.mocked(createClient);

function buildRoutes(opts: {
  sessionRow: object;
  rateBandRow?: object | null;
  specialProgramRows?: object[];
  classTierRows?: object[];
}) {
  return {
    semester_fee_config: makeChain({ data: MOCK_FEE_CONFIG_ROW }),
    tuition_rate_bands: makeChain({ data: opts.rateBandRow ?? null }),
    class_meetings: makeChain({ data: [opts.sessionRow] }),
    semester_discounts: makeChain({ data: [] }),
    registration_orders: makeChain({ count: 0 }),
    semester_coupons: makeChain({ data: [] }),
    coupon_redemptions: makeChain({ count: 0 }),
    special_program_tuition: makeChain({
      data: opts.specialProgramRows ?? [],
    }),
    class_tiers: makeChain({ data: opts.classTierRows ?? [] }),
  };
}

function setupMock(routes: Record<string, Record<string, unknown>>) {
  mockCreateClient.mockResolvedValue(makeSupabaseMock(routes) as any);
}

const JUNIOR_BAND_FOR_ENGINE = {
  id: "band-jr-1",
  division: "junior",
  weekly_class_count: 1,
  base_tuition: 775.93,
  semester_total: 0, // legacy column — ignored per #2e
  autopay_installment_amount: null,
  recital_fee: 0,
  progressive_discount_percent: 0,
};

const SENIOR_BAND_FOR_ENGINE = {
  ...JUNIOR_BAND_FOR_ENGINE,
  id: "band-sr-1",
  division: "senior",
  base_tuition: 796.43,
};

describe("cross-engine convergence — every charging mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Mode 1: junior standard 1×/wk → preview === charge", async () => {
    setupMock(
      buildRoutes({
        sessionRow: MOCK_JUNIOR_SESSION_ROW,
        rateBandRow: MOCK_JUNIOR_RATE_BAND_ROW,
      }),
    );
    const quote = await computePricingQuote(makePricingInput());
    const preview = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [JUNIOR_BAND_FOR_ENGINE],
      specialRates: [],
    });
    expect(preview.semesterTotal).toBe(quote.grandTotal);
    // Sanity: 775.93 + 40 + 55 = 870.93
    expect(quote.grandTotal).toBe(870.93);
  });

  it("Mode 2: senior standard 1×/wk → preview === charge (incl. video + costume)", async () => {
    setupMock(
      buildRoutes({
        sessionRow: MOCK_SENIOR_SESSION_ROW,
        rateBandRow: MOCK_SENIOR_RATE_BAND_ROW,
      }),
    );
    const quote = await computePricingQuote(
      makePricingInput({ sessionIds: [SESSION_CONTEMP_ID] }),
    );
    const preview = calculateClassTuition({
      division: "senior",
      weeklyClassCount: 1,
      discipline: "contemporary",
      rateBands: [SENIOR_BAND_FOR_ENGINE],
      specialRates: [],
    });
    expect(preview.semesterTotal).toBe(quote.grandTotal);
    // Sanity: 796.43 + 40 + 15 + 65 = 916.43
    expect(quote.grandTotal).toBe(916.43);
  });

  it("Mode 3: technique special program → no costume/video/reg fee, $600", async () => {
    const techniqueSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        discipline: "technique",
      },
    };
    setupMock(
      buildRoutes({
        sessionRow: techniqueSession,
        rateBandRow: null,
        specialProgramRows: [
          {
            program_key: "technique",
            program_label: "Technique 1 / 2 / 3",
            semester_total: 600,
            registration_fee_override: 0,
          },
        ],
      }),
    );
    const quote = await computePricingQuote(makePricingInput());
    const preview = calculateClassTuition({
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
    expect(quote.grandTotal).toBe(600);
    expect(preview.semesterTotal).toBe(600);
    expect(preview.semesterTotal).toBe(quote.grandTotal);
  });

  it("Mode 4: early childhood → $394.11 + $40 reg override", async () => {
    const ecSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        division: "early_childhood",
        discipline: "ballet",
      },
    };
    setupMock(
      buildRoutes({
        sessionRow: ecSession,
        rateBandRow: null,
        specialProgramRows: [
          {
            program_key: "early_childhood",
            program_label: "Early Childhood",
            semester_total: 394.11,
            registration_fee_override: 40,
          },
        ],
      }),
    );
    const quote = await computePricingQuote(makePricingInput());
    expect(quote.grandTotal).toBe(434.11);
    expect(quote.perDancer[0].tuition).toBe(394.11);
    expect(quote.perDancer[0].registrationFee).toBe(40);
  });

  it("Mode 5: competition_senior → no costume/video/reg fee (flag #1)", async () => {
    const compSession = {
      ...MOCK_SENIOR_SESSION_ROW,
      classes: {
        ...MOCK_SENIOR_SESSION_ROW.classes,
        is_competition_track: true,
      },
    };
    setupMock(
      buildRoutes({
        sessionRow: compSession,
        rateBandRow: null,
        specialProgramRows: [
          {
            program_key: "competition_senior",
            program_label: "Competition Team — Senior",
            semester_total: 802.94,
            registration_fee_override: 0,
          },
        ],
      }),
    );
    const quote = await computePricingQuote(
      makePricingInput({ sessionIds: [SESSION_CONTEMP_ID] }),
    );
    expect(quote.grandTotal).toBe(802.94);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].videoFee).toBe(0);
    expect(quote.perDancer[0].registrationFee).toBe(0);
  });

  it("Mode 6: tiered class → tier price_cents/100, no fees", async () => {
    const TIER_ID = "tier-0001";
    const tieredSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: { ...MOCK_JUNIOR_SESSION_ROW.classes, is_tiered: true },
    };
    setupMock(
      buildRoutes({
        sessionRow: tieredSession,
        rateBandRow: null,
        classTierRows: [
          {
            id: TIER_ID,
            class_id: "cls-ballet-000000001",
            label: "Beginner",
            price_cents: 45000,
          },
        ],
      }),
    );
    const quote = await computePricingQuote({
      ...makePricingInput(),
      enrollments: [
        {
          dancerId: DANCER_ID,
          sessionIds: [SESSION_BALLET_ID],
          classTierIdsBySession: { [SESSION_BALLET_ID]: TIER_ID },
        },
      ],
    });
    expect(quote.grandTotal).toBe(450);
    expect(quote.perDancer[0].tuition).toBe(450);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].registrationFee).toBe(0);
  });

  it("Mode 7: drop-in → class_meetings.drop_in_price, no fees", async () => {
    const dropInSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      drop_in_price: 22.5,
      class_sections: { is_drop_in: true },
    };
    setupMock(
      buildRoutes({
        sessionRow: dropInSession,
        rateBandRow: null,
      }),
    );
    const quote = await computePricingQuote(makePricingInput());
    expect(quote.grandTotal).toBe(22.5);
    expect(quote.perDancer[0].tuition).toBe(22.5);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].registrationFee).toBe(0);
  });
});

describe("path priority guarantees", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drop-in section + tiered class flags → drop-in wins (no tier price required)", async () => {
    // Edge case: section.is_drop_in=true but class.is_tiered=true.
    // Drop-in path is evaluated FIRST and must win without a tier selection.
    const conflictSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      drop_in_price: 30,
      class_sections: { is_drop_in: true },
      classes: { ...MOCK_JUNIOR_SESSION_ROW.classes, is_tiered: true },
    };
    setupMock(
      buildRoutes({
        sessionRow: conflictSession,
        rateBandRow: null,
      }),
    );
    // No classTierIdsBySession passed — drop-in path must short-circuit.
    const quote = await computePricingQuote(makePricingInput());
    expect(quote.perDancer[0].tuition).toBe(30);
  });

  it("special program + tiered flag → special wins (would-throw guard)", async () => {
    // Edge: technique discipline + is_tiered=true. Special path is evaluated
    // FIRST and must win.
    const conflictSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        discipline: "technique",
        is_tiered: true,
      },
    };
    setupMock(
      buildRoutes({
        sessionRow: conflictSession,
        rateBandRow: null,
        specialProgramRows: [
          {
            program_key: "technique",
            program_label: "Technique 1 / 2 / 3",
            semester_total: 600,
            registration_fee_override: 0,
          },
        ],
      }),
    );
    const quote = await computePricingQuote(makePricingInput());
    expect(quote.perDancer[0].tuition).toBe(600);
  });
});

describe("post-end-to-end bug fixes", () => {
  beforeEach(() => vi.clearAllMocks());

  // Bug A: drop-in + special reg-fee gate (uses pre_pointe to also cover Bug B).
  it("Bug A: drop-in + special program → reg fee uses program's override, not $40", async () => {
    const SESSION_DROPIN = "ses-aaaa-0000-0000-aaaaaaaaaaaa";
    const SESSION_SPECIAL = "ses-bbbb-0000-0000-bbbbbbbbbbbb";
    const dropInSession = {
      id: SESSION_DROPIN,
      schedule_date: null,
      day_of_week: "monday",
      drop_in_price: 25,
      class_sections: { is_drop_in: true },
      classes: {
        id: "cls-dropin",
        name: "Drop-in",
        division: "junior",
        discipline: "ballet",
        is_competition_track: false,
        is_tiered: false,
        tuition_override_amount: null,
      },
    };
    const prePointeSession = {
      id: SESSION_SPECIAL,
      schedule_date: null,
      day_of_week: "tuesday",
      drop_in_price: null,
      class_sections: { is_drop_in: false },
      classes: {
        id: "cls-prep",
        name: "Pre-Pointe",
        division: "junior",
        discipline: "pre_pointe",
        is_competition_track: false,
        is_tiered: false,
        tuition_override_amount: null,
      },
    };

    setupMock({
      semester_fee_config: makeChain({ data: MOCK_FEE_CONFIG_ROW }),
      tuition_rate_bands: makeChain({ data: null }),
      class_meetings: makeChain({ data: [dropInSession, prePointeSession] }),
      semester_discounts: makeChain({ data: [] }),
      registration_orders: makeChain({ count: 0 }),
      semester_coupons: makeChain({ data: [] }),
      coupon_redemptions: makeChain({ count: 0 }),
      special_program_tuition: makeChain({
        data: [
          {
            program_key: "pre_pointe",
            program_label: "Pre-Pointe",
            semester_total: 500,
            registration_fee_override: 0,
          },
        ],
      }),
      class_tiers: makeChain({ data: [] }),
    });

    const quote = await computePricingQuote({
      ...makePricingInput(),
      enrollments: [
        {
          dancerId: DANCER_ID,
          sessionIds: [SESSION_DROPIN, SESSION_SPECIAL],
        },
      ],
    });

    // Reg fee must come from pre_pointe's registration_fee_override (0), not
    // $40 fallback. Drop-in shouldn't block the override gate.
    expect(quote.perDancer[0].registrationFee).toBe(0);
    // Tuition = 25 (drop-in) + 500 (pre_pointe special) = 525.
    expect(quote.perDancer[0].tuition).toBe(525);
  });

  // Bug B: pre_pointe + early_childhood now in default exempt keys.
  it("Bug B: pre_pointe alone with no fee config → fee-exempt by default", async () => {
    const prePointeSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        discipline: "pre_pointe",
      },
    };
    // No feeConfig row → engine uses defaults. Default exempt keys now include
    // pre_pointe + early_childhood + competition.
    setupMock({
      semester_fee_config: makeChain({ data: null }),
      tuition_rate_bands: makeChain({ data: null }),
      class_meetings: makeChain({ data: [prePointeSession] }),
      semester_discounts: makeChain({ data: [] }),
      registration_orders: makeChain({ count: 0 }),
      semester_coupons: makeChain({ data: [] }),
      coupon_redemptions: makeChain({ count: 0 }),
      special_program_tuition: makeChain({
        data: [
          {
            program_key: "pre_pointe",
            program_label: "Pre-Pointe",
            semester_total: 500,
            registration_fee_override: 0,
          },
        ],
      }),
      class_tiers: makeChain({ data: [] }),
    });

    const quote = await computePricingQuote(makePricingInput());
    expect(quote.perDancer[0].registrationFee).toBe(0);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].tuition).toBe(500);
  });

  // Bug C: deterministic max override (defensive, multi-special case).
  // Uses two compatible-division specials (technique + pre_pointe, both
  // junior). EC + anything would hit the resolveDivision guard, so it's not
  // a valid mix for this defensive test.
  it("Bug C: multi-special programs → picks max(regOverride) deterministically", async () => {
    const SESSION_A = "ses-aaaa-0000-0000-aaaaaaaaaaaa";
    const SESSION_B = "ses-bbbb-0000-0000-bbbbbbbbbbbb";
    const techniqueSession = {
      id: SESSION_A,
      schedule_date: null,
      day_of_week: "monday",
      drop_in_price: null,
      class_sections: { is_drop_in: false },
      classes: {
        id: "cls-tech",
        name: "Technique",
        division: "junior",
        discipline: "technique",
        is_competition_track: false,
        is_tiered: false,
        tuition_override_amount: null,
      },
    };
    const prePointeSession = {
      id: SESSION_B,
      schedule_date: null,
      day_of_week: "tuesday",
      drop_in_price: null,
      class_sections: { is_drop_in: false },
      classes: {
        id: "cls-prep",
        name: "Pre-Pointe",
        division: "junior",
        discipline: "pre_pointe",
        is_competition_track: false,
        is_tiered: false,
        tuition_override_amount: null,
      },
    };

    setupMock({
      semester_fee_config: makeChain({ data: MOCK_FEE_CONFIG_ROW }),
      tuition_rate_bands: makeChain({ data: null }),
      class_meetings: makeChain({ data: [techniqueSession, prePointeSession] }),
      semester_discounts: makeChain({ data: [] }),
      registration_orders: makeChain({ count: 0 }),
      semester_coupons: makeChain({ data: [] }),
      coupon_redemptions: makeChain({ count: 0 }),
      special_program_tuition: makeChain({
        data: [
          {
            program_key: "technique",
            program_label: "Tech",
            semester_total: 600,
            registration_fee_override: 0,
          },
          {
            program_key: "pre_pointe",
            program_label: "Pre-Pointe",
            semester_total: 500,
            registration_fee_override: 20, // artificial — pick max(0, 20)
          },
        ],
      }),
      class_tiers: makeChain({ data: [] }),
    });

    const quote = await computePricingQuote({
      ...makePricingInput(),
      enrollments: [
        { dancerId: DANCER_ID, sessionIds: [SESSION_A, SESSION_B] },
      ],
    });

    // max(0, 20) = 20, regardless of Set iteration order.
    expect(quote.perDancer[0].registrationFee).toBe(20);
    expect(quote.perDancer[0].tuition).toBe(600 + 500);
  });
});
