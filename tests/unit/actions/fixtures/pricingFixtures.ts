/**
 * Shared mock factories and fixture constants for server action unit tests.
 * Used by computePricingQuote.test.ts and validateCoupon.test.ts.
 */
import { vi } from "vitest";

// ── Fixture UUIDs ─────────────────────────────────────────────────────────────
export const SEM_ID = "sem-0000-0000-0000-000000000001";
export const FAMILY_ID = "fam-0000-0000-0000-000000000001";
export const DANCER_ID = "dnc-0000-0000-0000-000000000001";
export const SESSION_BALLET_ID = "ses-0000-0000-0000-ballet00000001";
export const SESSION_CONTEMP_ID = "ses-0000-0000-0000-contemp0000001";
export const COUPON_ID = "cpn-0000-0000-0000-000000000001";

// ── DB Row Fixtures ───────────────────────────────────────────────────────────

export const MOCK_FEE_CONFIG_ROW = {
  semester_id: SEM_ID,
  registration_fee_per_child: 40,
  family_discount_amount: 50,
  auto_pay_admin_fee_monthly: 5,
  auto_pay_installment_count: 5,
  senior_video_fee_per_registrant: 15,
  senior_costume_fee_per_class: 65,
  junior_costume_fee_per_class: 55,
};

export const MOCK_JUNIOR_RATE_BAND_ROW = {
  semester_id: SEM_ID,
  division: "junior",
  weekly_class_count: 1,
  base_tuition: 775.93,
};

export const MOCK_SENIOR_RATE_BAND_ROW = {
  semester_id: SEM_ID,
  division: "senior",
  weekly_class_count: 1,
  base_tuition: 796.43,
};

export const MOCK_JUNIOR_SESSION_ROW = {
  id: SESSION_BALLET_ID,
  schedule_date: null,
  day_of_week: "wednesday",
  classes: {
    id: "cls-ballet-000000001",
    name: "Ballet 1A",
    division: "junior",
    discipline: "ballet",
    is_competition_track: false,
  },
};

export const MOCK_SENIOR_SESSION_ROW = {
  id: SESSION_CONTEMP_ID,
  schedule_date: null,
  day_of_week: "monday",
  classes: {
    id: "cls-contemp-00000001",
    name: "Contemporary 1",
    division: "senior",
    discipline: "contemporary",
    is_competition_track: false,
  },
};

export const MOCK_COUPON_ROW = {
  id: COUPON_ID,
  name: "Dev Test 10% Off",
  code: "DEVTEST10",
  value: 10,
  value_type: "percent",
  valid_from: null,
  valid_until: null,
  max_total_uses: null,
  uses_count: 0,
  max_per_family: 99,
  stackable: true,
  eligible_sessions_mode: "all",
  is_active: true,
  coupon_session_restrictions: [],
};

// ── Query Chain Builder ───────────────────────────────────────────────────────

/**
 * Builds a mock Supabase query chain. Each terminal method (maybeSingle, single,
 * plain await) resolves to the provided value.
 *
 * Call `withResult(data)` or `withCount(n)` to set what the chain returns.
 */
export function makeChain(
  result: { data?: unknown; error?: unknown; count?: number } = { data: null },
) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };

  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    // Awaiting the chain directly (e.g. for list queries)
    then: (resolve: (v: typeof resolved) => void) => resolve(resolved),
  };

  return chain;
}

/**
 * Builds a full Supabase client mock whose `.from(table)` call routes to a
 * per-table chain. Tables not listed in `routes` fall back to an empty chain.
 *
 * @param routes  Record<tableName, chain> — returned by makeChain()
 */
export function makeSupabaseMock(
  routes: Record<string, Record<string, unknown>> = {},
) {
  const fallbackChain = makeChain({ data: null });
  const fromMock = vi.fn().mockImplementation((table: string) => {
    return routes[table] ?? fallbackChain;
  });

  return {
    from: fromMock,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  };
}

// ── Minimal PricingInput helpers ──────────────────────────────────────────────

export function makePricingInput(overrides: {
  sessionIds?: string[];
  familyId?: string;
  dancerName?: string;
  couponCode?: string;
  paymentPlanType?: string;
} = {}) {
  return {
    semesterId: SEM_ID,
    familyId: overrides.familyId ?? FAMILY_ID,
    paymentPlanType: overrides.paymentPlanType ?? "pay_in_full",
    couponCode: overrides.couponCode,
    enrollments: [
      {
        dancerId: DANCER_ID,
        dancerName: overrides.dancerName ?? "Test Dancer",
        sessionIds: overrides.sessionIds ?? [SESSION_BALLET_ID],
      },
    ],
  };
}
