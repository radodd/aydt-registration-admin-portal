import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeChain,
  makeSupabaseMock,
  MOCK_COUPON_ROW,
  SEM_ID,
  FAMILY_ID,
  SESSION_BALLET_ID,
  COUPON_ID,
} from "./fixtures/pricingFixtures";

// ── Mock Supabase server client ───────────────────────────────────────────────
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/utils/supabase/server";
import { validateCoupon } from "@/app/actions/validateCoupon";

const mockCreateClient = vi.mocked(createClient);

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  semesterId: SEM_ID,
  familyId: FAMILY_ID,
  couponCode: "DEVTEST10",
  sessionIds: [SESSION_BALLET_ID],
};

/**
 * `validateCoupon` makes two sequential Supabase calls:
 *  1. semester_coupons (list query)  → resolves with data array
 *  2. coupon_redemptions (count query) → resolves with { count: N }
 *
 * We build a single `from` mock that returns the right chain per table.
 */
function setupMock(opts: {
  couponData?: object[] | null;
  redemptionCount?: number;
} = {}) {
  const couponRow = { coupon: opts.couponData?.[0] ?? MOCK_COUPON_ROW };
  const couponChain = makeChain({
    data: opts.couponData !== undefined ? opts.couponData.map((c) => ({ coupon: c })) : [couponRow],
  });
  const redemptionChain = makeChain({ count: opts.redemptionCount ?? 0 });

  const mock = makeSupabaseMock({
    semester_coupons: couponChain as any,
    coupon_redemptions: redemptionChain as any,
  });
  mockCreateClient.mockResolvedValue(mock as any);
  return mock;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("validateCoupon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it("returns valid: true for a valid code-based coupon", async () => {
    setupMock({ couponData: [MOCK_COUPON_ROW] });

    const result = await validateCoupon(BASE_INPUT);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coupon.code).toBe("DEVTEST10");
      expect(result.coupon.value).toBe(10);
      expect(result.coupon.valueType).toBe("percent");
    }
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it("returns not_found when no coupon matches", async () => {
    setupMock({ couponData: [] });

    const result = await validateCoupon(BASE_INPUT);

    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it("returns inactive when is_active is false", async () => {
    setupMock({ couponData: [{ ...MOCK_COUPON_ROW, is_active: false }] });

    const result = await validateCoupon(BASE_INPUT);

    expect(result).toEqual({ valid: false, reason: "inactive" });
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it("returns expired when valid_until is in the past", async () => {
    setupMock({
      couponData: [{ ...MOCK_COUPON_ROW, valid_until: "2020-01-01T00:00:00Z" }],
    });

    const result = await validateCoupon(BASE_INPUT);

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it("returns not_yet_valid when valid_from is in the future", async () => {
    const futureDate = new Date(Date.now() + 86_400_000 * 365).toISOString();
    setupMock({
      couponData: [{ ...MOCK_COUPON_ROW, valid_from: futureDate }],
    });

    const result = await validateCoupon(BASE_INPUT);

    expect(result).toEqual({ valid: false, reason: "not_yet_valid" });
  });

  // ── Test 6 ────────────────────────────────────────────────────────────────
  it("returns cap_reached when uses_count >= max_total_uses", async () => {
    setupMock({
      couponData: [{ ...MOCK_COUPON_ROW, max_total_uses: 5, uses_count: 5 }],
    });

    const result = await validateCoupon(BASE_INPUT);

    expect(result).toEqual({ valid: false, reason: "cap_reached" });
  });

  // ── Test 7 ────────────────────────────────────────────────────────────────
  it("returns already_used when family has redeemed max_per_family times", async () => {
    setupMock({
      couponData: [{ ...MOCK_COUPON_ROW, max_per_family: 1 }],
      redemptionCount: 1, // family already used it once
    });

    const result = await validateCoupon(BASE_INPUT);

    expect(result).toEqual({ valid: false, reason: "already_used" });
  });

  // ── Test 8 ────────────────────────────────────────────────────────────────
  it("returns not_applicable when coupon is session-restricted and no enrolled session matches", async () => {
    const restrictedCoupon = {
      ...MOCK_COUPON_ROW,
      eligible_sessions_mode: "selected",
      coupon_session_restrictions: [{ session_id: "different-session-id" }],
    };
    setupMock({ couponData: [restrictedCoupon] });

    // Input has SESSION_BALLET_ID but coupon only covers "different-session-id"
    const result = await validateCoupon({
      ...BASE_INPUT,
      sessionIds: [SESSION_BALLET_ID],
    });

    expect(result).toEqual({ valid: false, reason: "not_applicable" });
  });

  // ── Test 9 ────────────────────────────────────────────────────────────────
  it("auto-apply coupon (code: null) — returns valid: true when no couponCode provided", async () => {
    const autoApplyCoupon = { ...MOCK_COUPON_ROW, code: null };
    setupMock({ couponData: [autoApplyCoupon] });

    // No couponCode in input → checks for auto-apply coupons
    const result = await validateCoupon({
      semesterId: SEM_ID,
      familyId: FAMILY_ID,
      sessionIds: [SESSION_BALLET_ID],
      // couponCode omitted
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coupon.code).toBeNull();
    }
  });
});
