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
  couponLinks?: object[] | null;
  redemptionCount?: number;
  priorBatchCount?: number;
} = {}) {
  const division = opts.division ?? "junior";
  const sessionRow = opts.sessionRow ?? MOCK_JUNIOR_SESSION_ROW;
  const rateBandRow = opts.rateBandRow !== undefined
    ? opts.rateBandRow
    : (division === "junior" ? MOCK_JUNIOR_RATE_BAND_ROW : MOCK_SENIOR_RATE_BAND_ROW);

  const feeConfigChain = makeChain({
    data: opts.feeConfigRow !== undefined ? opts.feeConfigRow : MOCK_FEE_CONFIG_ROW,
  });
  const rateBandChain = makeChain({ data: rateBandRow });
  const sessionChain = makeChain({ data: [sessionRow] });
  const discountChain = makeChain({ data: [] }); // no threshold discounts by default
  const priceRowsChain = makeChain({ data: [] }); // no per-session price rows
  const batchCountChain = makeChain({ count: opts.priorBatchCount ?? 0 });
  const couponChain = makeChain({
    data: (opts.couponLinks !== undefined ? opts.couponLinks : null) ?? [],
  });
  const redemptionChain = makeChain({ count: opts.redemptionCount ?? 0 });

  return {
    semester_fee_config: feeConfigChain,
    tuition_rate_bands: rateBandChain,
    class_sessions: sessionChain,
    semester_discounts: discountChain,
    class_session_price_rows: priceRowsChain,
    registration_batches: batchCountChain,
    semester_coupons: couponChain,
    coupon_redemptions: redemptionChain,
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

    // Override class_sessions to return two dancers' session rows
    const dancer2Id = "dnc-0000-0000-0000-000000000002";
    routes.class_sessions = makeChain({ data: [MOCK_JUNIOR_SESSION_ROW] });

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
  it("fee-exempt disciplines (technique) → registrationFee === 0", async () => {
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
    });
    setupMock(routes);

    const quote = await computePricingQuote(makePricingInput());

    expect(quote.perDancer[0].registrationFee).toBe(0);
    expect(quote.registrationFeeTotal).toBe(0);
  });
});
