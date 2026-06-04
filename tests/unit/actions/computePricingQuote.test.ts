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
  MOCK_COUPON_ROW,
  SEM_ID,
  FAMILY_ID,
  SESSION_BALLET_ID,
  SESSION_CONTEMP_ID,
  DANCER_ID,
  COUPON_ID,
} from "./fixtures/pricingFixtures";

// ── Mock Supabase server client ───────────────────────────────────────────────
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

// ── Mock buildPaymentSchedule (pure utility — not what we're testing) ─────────
vi.mock("@/utils/buildPaymentSchedule", () => ({
  buildPaymentSchedule: vi.fn().mockReturnValue({
    amountDueNow: 0,
    schedule: [],
  }),
}));

import { createClient } from "@/utils/supabase/server";
import { computePricingQuote } from "@/app/actions/computePricingQuote";

const mockCreateClient = vi.mocked(createClient);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds the minimal set of supabase chains for a single-dancer, pay-in-full quote. */
function buildMinimalRoutes(opts: {
  division?: "junior" | "senior";
  rateBandRow?: object | null;
  feeConfigRow?: object | null;
  sessionRow?: object;
  sessionRows?: object[];
  couponLinks?: object[] | null;
  redemptionCount?: number;
  priorBatchCount?: number;
  specialProgramRows?: object[];
  classTierRows?: object[];
} = {}) {
  const division = opts.division ?? "junior";
  const sessionRow = opts.sessionRow ?? MOCK_JUNIOR_SESSION_ROW;
  const sessionRowsData = opts.sessionRows ?? [sessionRow];
  const rateBandRow = opts.rateBandRow !== undefined
    ? opts.rateBandRow
    : (division === "junior" ? MOCK_JUNIOR_RATE_BAND_ROW : MOCK_SENIOR_RATE_BAND_ROW);

  const feeConfigChain = makeChain({
    data: opts.feeConfigRow !== undefined ? opts.feeConfigRow : MOCK_FEE_CONFIG_ROW,
  });
  const rateBandChain = makeChain({ data: rateBandRow });
  const sessionChain = makeChain({ data: sessionRowsData });
  const discountChain = makeChain({ data: [] }); // no threshold discounts by default
  const batchCountChain = makeChain({ count: opts.priorBatchCount ?? 0 });
  const couponChain = makeChain({
    data: (opts.couponLinks !== undefined ? opts.couponLinks : null) ?? [],
  });
  const redemptionChain = makeChain({ count: opts.redemptionCount ?? 0 });
  const specialProgramChain = makeChain({
    data: opts.specialProgramRows ?? [],
  });
  const classTiersChain = makeChain({
    data: opts.classTierRows ?? [],
  });

  return {
    semester_fee_config: feeConfigChain,
    tuition_rate_bands: rateBandChain,
    class_meetings: sessionChain,
    semester_discounts: discountChain,
    registration_orders: batchCountChain,
    semester_coupons: couponChain,
    coupon_redemptions: redemptionChain,
    special_program_tuition: specialProgramChain,
    class_tiers: classTiersChain,
  };
}

function setupMock(routes: Record<string, Record<string, unknown>>) {
  const mock = makeSupabaseMock(routes);
  mockCreateClient.mockResolvedValue(mock as any);
  return mock;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("computePricingQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it("pay-in-full, single junior dancer, 1 class/week → correct grandTotal", async () => {
    setupMock(buildMinimalRoutes({ division: "junior" }));

    const quote = await computePricingQuote(makePricingInput());

    // tuition = 775.93, costume fee = 55 (junior, 1 class), reg fee = 40
    // grandTotal = 775.93 + 55 + 40 = 870.93
    expect(quote.grandTotal).toBeCloseTo(870.93, 2);
    expect(quote.perDancer).toHaveLength(1);
    expect(quote.perDancer[0].division).toBe("junior");
    expect(quote.perDancer[0].registrationFee).toBe(40);
    expect(quote.couponDiscount).toBe(0);
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it("family discount applied for 2-dancer enrollment (no prior batch)", async () => {
    const routes = buildMinimalRoutes({ division: "junior", priorBatchCount: 0 });

    // Override class_meetings to return two dancers' session rows
    const dancer2Id = "dnc-0000-0000-0000-000000000002";
    routes.class_meetings = makeChain({ data: [MOCK_JUNIOR_SESSION_ROW] });

    setupMock(routes);

    const input = {
      semesterId: SEM_ID,
      familyId: FAMILY_ID,
      paymentPlanType: "pay_in_full",
      enrollments: [
        { dancerId: DANCER_ID, dancerName: "Dancer One", sessionIds: [SESSION_BALLET_ID] },
        { dancerId: dancer2Id, dancerName: "Dancer Two", sessionIds: [SESSION_BALLET_ID] },
      ],
    };

    const quote = await computePricingQuote(input);

    expect(quote.familyDiscountAmount).toBe(50);
    // Two dancers: 2 × (775.93 + 55 + 40) = 2 × 870.93 = 1741.86 − 50 = 1691.86
    expect(quote.grandTotal).toBeCloseTo(1691.86, 2);
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it("family discount NOT applied when prior confirmed batch exists", async () => {
    const routes = buildMinimalRoutes({ division: "junior", priorBatchCount: 1 });
    setupMock(routes);

    const input = {
      semesterId: SEM_ID,
      familyId: FAMILY_ID,
      paymentPlanType: "pay_in_full",
      enrollments: [
        { dancerId: DANCER_ID, dancerName: "Dancer One", sessionIds: [SESSION_BALLET_ID] },
        { dancerId: "dnc-2", dancerName: "Dancer Two", sessionIds: [SESSION_BALLET_ID] },
      ],
    };

    const quote = await computePricingQuote(input);

    expect(quote.familyDiscountAmount).toBe(0);
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it("applies flat $25 coupon discount", async () => {
    const flatCoupon = {
      ...MOCK_COUPON_ROW,
      code: "SAVE25",
      value: 25,
      value_type: "flat",
    };

    const couponLinkRow = { coupon: flatCoupon };
    const routes = buildMinimalRoutes({
      division: "junior",
      couponLinks: [couponLinkRow],
    });
    setupMock(routes);

    const quote = await computePricingQuote(
      makePricingInput({ couponCode: "SAVE25" }),
    );

    expect(quote.couponDiscount).toBe(25);
    expect(quote.grandTotal).toBeCloseTo(870.93 - 25, 2);
    expect(quote.appliedCouponName).toBe("Dev Test 10% Off");
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it("skips coupon when uses_count >= max_total_uses", async () => {
    const exhaustedCoupon = {
      ...MOCK_COUPON_ROW,
      max_total_uses: 5,
      uses_count: 5,
    };

    const routes = buildMinimalRoutes({
      division: "junior",
      couponLinks: [{ coupon: exhaustedCoupon }],
    });
    setupMock(routes);

    const quote = await computePricingQuote(
      makePricingInput({ couponCode: "DEVTEST10" }),
    );

    expect(quote.couponDiscount).toBe(0);
    expect(quote.appliedCouponId).toBeUndefined();
  });

  // ── Test 6 ────────────────────────────────────────────────────────────────
  it("senior dancer gets video fee ($15) and costume fee ($65) line items", async () => {
    const routes = buildMinimalRoutes({
      division: "senior",
      sessionRow: MOCK_SENIOR_SESSION_ROW,
    });
    setupMock(routes);

    const quote = await computePricingQuote(
      makePricingInput({ sessionIds: [SESSION_CONTEMP_ID] }),
    );

    const lineItems = quote.lineItems;
    const videoItem = lineItems.find((li) => li.type === "video_fee");
    const costumeItem = lineItems.find((li) => li.type === "costume_fee");

    expect(videoItem).toBeDefined();
    expect(videoItem!.amount).toBe(15);
    expect(costumeItem).toBeDefined();
    expect(costumeItem!.amount).toBe(65); // $65 × 1 class
  });

  // ── Test 7 ────────────────────────────────────────────────────────────────
  it("throws when no tuition rate band is configured for the division", async () => {
    const routes = buildMinimalRoutes({
      division: "junior",
      rateBandRow: null, // maybeSingle returns null
    });
    setupMock(routes);

    await expect(computePricingQuote(makePricingInput())).rejects.toThrow(
      /No tuition rate configured/i,
    );
  });

  // ── Test 8 ────────────────────────────────────────────────────────────────
  it("technique special program → semester_total tuition, reg fee = override (0)", async () => {
    const techniqueSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        discipline: "technique",
      },
    };

    const routes = buildMinimalRoutes({
      division: "junior",
      sessionRow: techniqueSession,
      // Standard rate-band lookup MUST NOT be hit for a pure special-program
      // dancer; pass null to fail loudly if the engine falls through.
      rateBandRow: null,
      specialProgramRows: [
        {
          program_key: "technique",
          program_label: "Technique 1 / 2 / 3",
          semester_total: 600,
          registration_fee_override: 0,
        },
      ],
    });
    setupMock(routes);

    const quote = await computePricingQuote(makePricingInput());

    expect(quote.perDancer[0].tuition).toBe(600);
    expect(quote.perDancer[0].registrationFee).toBe(0);
    expect(quote.registrationFeeTotal).toBe(0);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].videoFee).toBe(0);
  });

  // ── Test 9 ────────────────────────────────────────────────────────────────
  it("early childhood → semester_total + override reg fee ($40)", async () => {
    const ecSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        division: "early_childhood",
        discipline: "ballet",
      },
    };

    const routes = buildMinimalRoutes({
      sessionRow: ecSession,
      rateBandRow: null,
      specialProgramRows: [
        {
          program_key: "early_childhood",
          program_label: "Early Childhood (9-class session)",
          semester_total: 394.11,
          registration_fee_override: 40,
        },
      ],
    });
    setupMock(routes);

    const quote = await computePricingQuote(makePricingInput());

    expect(quote.perDancer[0].tuition).toBe(394.11);
    expect(quote.perDancer[0].registrationFee).toBe(40);
  });

  // ── Test 10 ───────────────────────────────────────────────────────────────
  it("competition senior → competition_senior key (not junior fallback)", async () => {
    const compSession = {
      ...MOCK_SENIOR_SESSION_ROW,
      classes: {
        ...MOCK_SENIOR_SESSION_ROW.classes,
        is_competition_track: true,
      },
    };

    const routes = buildMinimalRoutes({
      division: "senior",
      sessionRow: compSession,
      rateBandRow: null,
      specialProgramRows: [
        {
          program_key: "competition_senior",
          program_label: "Competition Team — Senior",
          semester_total: 802.94,
          registration_fee_override: 0,
        },
        // Deliberately also include junior to prove disambiguation picks senior.
        {
          program_key: "competition_junior",
          program_label: "Competition Team — Junior",
          semester_total: 842.61,
          registration_fee_override: 0,
        },
      ],
    });
    setupMock(routes);

    const quote = await computePricingQuote(
      makePricingInput({ sessionIds: [SESSION_CONTEMP_ID] }),
    );

    // The #2a contract: the tuition line item is sourced from the
    // competition_senior special-program row, NOT a rate-band fallback or the
    // competition_junior key.
    const tuitionLine = quote.perDancer[0].lineItems.find(
      (li) => li.type === "tuition",
    );
    expect(tuitionLine?.amount).toBe(802.94);
    expect(tuitionLine?.label).toMatch(/Competition Team — Senior/);
    expect(quote.perDancer[0].registrationFee).toBe(0);
    // Post-flag-#1 fix: competition classes (is_competition_track=true) are
    // fee-exempt even though their division is "senior" (not "competition").
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].videoFee).toBe(0);
    expect(quote.perDancer[0].tuition).toBe(802.94);
  });

  // ── Flag #1 ───────────────────────────────────────────────────────────────
  // Junior competition: same exemption rule, no junior costume ($55).
  it("competition junior → no costume fee (is_competition_track honored)", async () => {
    const compSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        is_competition_track: true,
      },
    };

    const routes = buildMinimalRoutes({
      division: "junior",
      sessionRow: compSession,
      rateBandRow: null,
      specialProgramRows: [
        {
          program_key: "competition_junior",
          program_label: "Competition Team — Junior",
          semester_total: 842.61,
          registration_fee_override: 0,
        },
      ],
    });
    setupMock(routes);

    const quote = await computePricingQuote(makePricingInput());

    expect(quote.perDancer[0].tuition).toBe(842.61);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].registrationFee).toBe(0);
  });

  // ── Test 11 ───────────────────────────────────────────────────────────────
  it("special program enrolled but unconfigured → throws config error", async () => {
    const techniqueSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        discipline: "technique",
      },
    };

    const routes = buildMinimalRoutes({
      sessionRow: techniqueSession,
      rateBandRow: null,
      specialProgramRows: [], // none configured
    });
    setupMock(routes);

    await expect(computePricingQuote(makePricingInput())).rejects.toThrow(
      /No special program tuition configured for program_key="technique"/i,
    );
  });

  // ── Test 12 ───────────────────────────────────────────────────────────────
  // #2b: tiered classes pull tuition from class_tiers.price_cents and skip
  // costume/video/registration fees.
  it("tiered class → tier price_cents/100 tuition, no fees", async () => {
    const TIER_ID = "tier-0000-0000-0000-000000000001";
    const tieredSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        is_tiered: true,
      },
    };

    const routes = buildMinimalRoutes({
      sessionRow: tieredSession,
      rateBandRow: null, // must NOT be queried — tier path takes over
      classTierRows: [
        {
          id: TIER_ID,
          class_id: "cls-ballet-000000001",
          label: "Beginner",
          price_cents: 45000, // $450.00
        },
      ],
    });
    setupMock(routes);

    const quote = await computePricingQuote({
      ...makePricingInput(),
      enrollments: [
        {
          dancerId: DANCER_ID,
          dancerName: "Test Dancer",
          sessionIds: [SESSION_BALLET_ID],
          classTierIdsBySession: { [SESSION_BALLET_ID]: TIER_ID },
        },
      ],
    });

    const tuitionLine = quote.perDancer[0].lineItems.find(
      (li) => li.type === "tuition",
    );
    expect(tuitionLine?.amount).toBe(450);
    expect(tuitionLine?.label).toMatch(/Beginner/);
    expect(quote.perDancer[0].registrationFee).toBe(0);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].videoFee).toBe(0);
    expect(quote.perDancer[0].tuition).toBe(450);
  });

  // ── Test 13 ───────────────────────────────────────────────────────────────
  it("tiered class without selected tier → throws", async () => {
    const tieredSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        is_tiered: true,
      },
    };

    const routes = buildMinimalRoutes({
      sessionRow: tieredSession,
      rateBandRow: null,
      classTierRows: [],
    });
    setupMock(routes);

    await expect(computePricingQuote(makePricingInput())).rejects.toThrow(
      /Tier not selected/i,
    );
  });

  // ── Test 14 ───────────────────────────────────────────────────────────────
  it("tiered class with NULL price_cents → throws", async () => {
    const TIER_ID = "tier-0000-0000-0000-000000000002";
    const tieredSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        is_tiered: true,
      },
    };

    const routes = buildMinimalRoutes({
      sessionRow: tieredSession,
      rateBandRow: null,
      classTierRows: [
        {
          id: TIER_ID,
          class_id: "cls-ballet-000000001",
          label: "Unpriced",
          price_cents: null,
        },
      ],
    });
    setupMock(routes);

    await expect(
      computePricingQuote({
        ...makePricingInput(),
        enrollments: [
          {
            dancerId: DANCER_ID,
            sessionIds: [SESSION_BALLET_ID],
            classTierIdsBySession: { [SESSION_BALLET_ID]: TIER_ID },
          },
        ],
      }),
    ).rejects.toThrow(/has no price configured/i);
  });

  // ── Test 15 ───────────────────────────────────────────────────────────────
  // #2c: drop-in meeting reads from class_meetings.drop_in_price (section
  // marked is_drop_in=true), no costume/video/reg fee.
  it("drop-in meeting → drop_in_price tuition, no fees", async () => {
    const dropInSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      drop_in_price: 22.5,
      class_sections: { is_drop_in: true },
    };

    const routes = buildMinimalRoutes({
      sessionRow: dropInSession,
      rateBandRow: null,
    });
    setupMock(routes);

    const quote = await computePricingQuote(makePricingInput());

    const tuitionLine = quote.perDancer[0].lineItems.find(
      (li) => li.type === "tuition",
    );
    expect(tuitionLine?.amount).toBe(22.5);
    expect(tuitionLine?.label).toMatch(/drop-in/i);
    expect(quote.perDancer[0].registrationFee).toBe(0);
    expect(quote.perDancer[0].costumeFee).toBe(0);
    expect(quote.perDancer[0].videoFee).toBe(0);
    expect(quote.perDancer[0].tuition).toBe(22.5);
  });

  // ── Test 16 ───────────────────────────────────────────────────────────────
  it("drop-in meeting without drop_in_price → throws", async () => {
    const dropInSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      drop_in_price: null,
      class_sections: { is_drop_in: true },
    };

    const routes = buildMinimalRoutes({
      sessionRow: dropInSession,
      rateBandRow: null,
    });
    setupMock(routes);

    await expect(computePricingQuote(makePricingInput())).rejects.toThrow(
      /has no drop_in_price configured/i,
    );
  });

  // ── Test 17 (#2g) ─────────────────────────────────────────────────────────
  // The legacy class_meeting_price_rows fallback was removed in #2g. A
  // non-drop-in session with no other tuition source must now throw the
  // standard "rate band missing" error instead of silently picking up a
  // legacy price row.
  it("non-drop-in session with no rate band → throws (legacy fallback removed)", async () => {
    const routes = buildMinimalRoutes({
      rateBandRow: null,
    });
    setupMock(routes);

    await expect(computePricingQuote(makePricingInput())).rejects.toThrow(
      /No tuition rate configured/i,
    );
  });

  // ── Test 18 ───────────────────────────────────────────────────────────────
  // #2d: rate-band lookup must be mode-scoped. A dancer with 1 standard + 1
  // drop-in session should hit the junior 1×/wk band, not 2×/wk.
  it("standard + drop-in → bandCount counts standard only", async () => {
    const SESSION_STANDARD = SESSION_BALLET_ID;
    const SESSION_DROPIN = SESSION_CONTEMP_ID;
    const standardSession = {
      ...MOCK_JUNIOR_SESSION_ROW,
      id: SESSION_STANDARD,
      day_of_week: "monday",
    };
    const dropInSession = {
      id: SESSION_DROPIN,
      schedule_date: null,
      day_of_week: "tuesday",
      drop_in_price: 22.5,
      class_sections: { is_drop_in: true },
      classes: {
        id: "cls-dropin-000000001",
        name: "Dropin Class",
        division: "junior",
        discipline: "ballet",
        is_competition_track: false,
      },
    };

    const routes = buildMinimalRoutes({
      division: "junior",
      sessionRows: [standardSession, dropInSession],
      // 1×/wk band must be the lookup — anything else fails this test.
      rateBandRow: MOCK_JUNIOR_RATE_BAND_ROW,
    });
    setupMock(routes);

    const quote = await computePricingQuote({
      ...makePricingInput(),
      enrollments: [
        {
          dancerId: DANCER_ID,
          dancerName: "Test Dancer",
          sessionIds: [SESSION_STANDARD, SESSION_DROPIN],
        },
      ],
    });

    // Verify the rate-band line carries the 1x/week label (not 2x/week).
    const rateBandLine = quote.perDancer[0].lineItems.find(
      (li) =>
        li.type === "tuition" && /Junior, 1x\/week/i.test(li.label),
    );
    expect(rateBandLine?.amount).toBe(775.93);
    // Standard tuition (775.93) + drop-in (22.5), plus junior costume ($55)
    // for the one standard class. Tuition field includes costume.
    expect(quote.perDancer[0].tuition).toBe(775.93 + 22.5 + 55);
    // Per Q2: returned weeklyClassCount reports total enrollments (2).
    expect(quote.perDancer[0].weeklyClassCount).toBe(2);
  });

  // ── Test 19 ───────────────────────────────────────────────────────────────
  // #2d: two different rate-band classes both on Monday → bandCount = 2.
  it("two different rate-band classes same weekday → bandCount = 2", async () => {
    const TWOWK_BAND = {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 2,
      base_tuition: 1551.86, // arbitrary 2x band
    };
    const SESSION_A = "ses-0000-0000-0000-aaaaaaaaa00001";
    const SESSION_B = "ses-0000-0000-0000-bbbbbbbbb00001";
    const sessionA = {
      ...MOCK_JUNIOR_SESSION_ROW,
      id: SESSION_A,
      day_of_week: "monday",
      classes: { ...MOCK_JUNIOR_SESSION_ROW.classes, id: "cls-A" },
    };
    const sessionB = {
      ...MOCK_JUNIOR_SESSION_ROW,
      id: SESSION_B,
      day_of_week: "monday",
      classes: { ...MOCK_JUNIOR_SESSION_ROW.classes, id: "cls-B" },
    };

    const routes = buildMinimalRoutes({
      sessionRows: [sessionA, sessionB],
      rateBandRow: TWOWK_BAND,
    });
    setupMock(routes);

    const quote = await computePricingQuote({
      ...makePricingInput(),
      enrollments: [
        {
          dancerId: DANCER_ID,
          sessionIds: [SESSION_A, SESSION_B],
        },
      ],
    });

    const rateBandLine = quote.perDancer[0].lineItems.find(
      (li) => li.type === "tuition" && /2x\/week/i.test(li.label),
    );
    expect(rateBandLine?.amount).toBe(1551.86);
  });

  // ── Test 20 (#2e end-to-end) ──────────────────────────────────────────────
  // tuitionEngine (admin preview) and computePricingQuote (authoritative
  // charge) must produce identical totals for the same inputs. This is the
  // convergence guarantee of #2e.
  it("convergence: tuitionEngine.semesterTotal === computePricingQuote tuition for same band", async () => {
    // Use the unit-test version of tuitionEngine directly.
    const { calculateClassTuition } = await import("@/utils/tuitionEngine");

    // Admin draft: junior, 1×/week, base $775.93.
    const draftBand = {
      id: "band-jr-1",
      division: "junior",
      weekly_class_count: 1,
      base_tuition: 775.93,
      semester_total: 999_999, // legacy column — ignored post-#2e
      autopay_installment_amount: null,
      recital_fee: 0,
      progressive_discount_percent: 0,
    };
    const previewResult = calculateClassTuition({
      division: "junior",
      weeklyClassCount: 1,
      discipline: "ballet",
      rateBands: [draftBand],
      specialRates: [],
    });

    // Authoritative side: same band shape lives in tuition_rate_bands.
    const routes = buildMinimalRoutes({
      division: "junior",
      rateBandRow: { ...draftBand },
    });
    setupMock(routes);
    const quote = await computePricingQuote(makePricingInput());

    // The preview's semesterTotal (which folds base + reg + video + costume)
    // must equal the authoritative grand total for a single-dancer enrollment
    // with no family discount, coupon, or autopay fee.
    expect(previewResult.semesterTotal).toBe(quote.grandTotal);
  });

  // ── Meeting-plan #22: per-class registration-fee exemption ──────────────────
  it("registration_fee_exempt class → no registration fee line item", async () => {
    // Same junior 1-class scenario as Test 1, but the class is flagged exempt.
    // tuition 775.93 + costume 55, reg fee dropped → grandTotal 830.93.
    const exemptRow = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        registration_fee_exempt: true,
      },
    };
    setupMock(buildMinimalRoutes({ division: "junior", sessionRow: exemptRow }));

    const quote = await computePricingQuote(makePricingInput());

    expect(quote.perDancer[0].registrationFee).toBe(0);
    expect(
      quote.perDancer[0].lineItems.some((li) => li.type === "registration_fee"),
    ).toBe(false);
    expect(quote.grandTotal).toBeCloseTo(830.93, 2);
  });

  it("exempt class does NOT suppress costume/video fees", async () => {
    // Exemption is registration-fee-only. Costume fee (junior, 1 class = $55)
    // must still appear even though the reg fee is gone.
    const exemptRow = {
      ...MOCK_JUNIOR_SESSION_ROW,
      classes: {
        ...MOCK_JUNIOR_SESSION_ROW.classes,
        registration_fee_exempt: true,
      },
    };
    setupMock(buildMinimalRoutes({ division: "junior", sessionRow: exemptRow }));

    const quote = await computePricingQuote(makePricingInput());

    expect(
      quote.perDancer[0].lineItems.some((li) => li.type === "costume_fee"),
    ).toBe(true);
  });
});
