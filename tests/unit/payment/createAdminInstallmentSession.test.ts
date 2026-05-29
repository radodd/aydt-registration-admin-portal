/**
 * Tests for createAdminInstallmentSession (meeting-plan #7) — the admin analogue
 * of createEPGPaymentSession that mints a hosted card-entry session for a PENDING
 * installment order.
 *
 * Covers:
 *  - Auth + super_admin gate
 *  - Order validation (not found / confirmed / wrong status / not an installment plan)
 *  - Installment-1 amount validation (server vs client)
 *  - Idempotency: reuse an in-flight session
 *  - Happy path: Order + session created with doCapture:false; payments upserted
 *  - Non-fatal upsert failure still returns the URL
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCreateClient,
  mockCreateEpgOrder,
  mockCreateEpgPaymentSession,
  mockFetchEpgPaymentSession,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateEpgOrder: vi.fn(),
  mockCreateEpgPaymentSession: vi.fn(),
  mockFetchEpgPaymentSession: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "host" ? "localhost:3000" : null),
  }),
}));
vi.mock("@/utils/payment/epg", () => ({
  createEpgOrder: mockCreateEpgOrder,
  createEpgPaymentSession: mockCreateEpgPaymentSession,
  fetchEpgPaymentSession: mockFetchEpgPaymentSession,
}));

import { createAdminInstallmentSession } from "@/app/admin/register/actions/createAdminInstallmentSession";

const BATCH_ID = "batch-0000-0000-0000-000000000001";
const SEM_ID = "sem-0000-0000-0000-000000000001";
const USER_ID = "user-0000-0000-0000-000000000001";
const ORDER_ID = "ord-0000-0000-0000-000000000001";
const ORDER_HREF = `https://uat.epg.example.com/orders/${ORDER_ID}`;
const SESSION_ID = "ps-00000-0000-0000-000000000001";
const SESSION_URL = "https://uat.epg.example.com/hpp?session=abc123";

const VALID_INPUT = {
  batchId: BATCH_ID,
  amountDueNow: 200.0, // installment 1
  semesterId: SEM_ID,
  semesterName: "Fall 2026",
};

function makeChain(opts: {
  singleResult?: { data: unknown; error?: unknown };
  maybeSingleResult?: { data: unknown; error?: unknown };
  upsertResult?: { error: unknown };
} = {}) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "insert", "upsert", "eq", "neq", "in", "order", "limit"]) {
    chain[m] = vi.fn().mockReturnThis();
  }
  chain.single = vi.fn().mockResolvedValue(opts.singleResult ?? { data: null, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingleResult ?? { data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(opts.upsertResult ?? { data: null, error: null }).then(resolve);
  return chain;
}

function makeSupabaseMock(opts: {
  authenticated?: boolean;
  role?: string | null;
  batchStatus?: string | null;
  planType?: string;
  amountDueNow?: number;
  existingPayment?: { state: string; payment_session_id: string | null } | null;
  upsertError?: boolean;
} = {}) {
  const {
    authenticated = true,
    role = "super_admin",
    batchStatus = "pending",
    planType = "installments",
    amountDueNow = 200.0,
    existingPayment = null,
    upsertError = false,
  } = opts;

  const user = authenticated ? { id: USER_ID } : null;
  const userChain = makeChain({ singleResult: { data: role ? { role } : null, error: null } });

  const batchData =
    batchStatus === null
      ? null
      : { id: BATCH_ID, status: batchStatus, payment_plan_type: planType, amount_due_now: amountDueNow, grand_total: 1000 };
  const batchChain = makeChain({
    singleResult: { data: batchData, error: batchStatus === null ? { code: "PGRST116" } : null },
  });

  const paymentReadChain = makeChain({ maybeSingleResult: { data: existingPayment } });
  const upsertChain = makeChain({ upsertResult: { error: upsertError ? new Error("DB error") : null } });

  let paymentsCallIndex = 0;
  const from = vi.fn((table: string) => {
    if (table === "users") return userChain;
    if (table === "registration_orders") return batchChain;
    if (table === "payments") return paymentsCallIndex++ === 0 ? paymentReadChain : upsertChain;
    return makeChain();
  });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EPG_BASE_URL = "https://uat.epg.example.com";
});

describe("createAdminInstallmentSession (#7)", () => {
  it("rejects an unauthenticated caller", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ authenticated: false }));
    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("rejects a non-super-admin (regular admin)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ role: "admin" }));
    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.error).toMatch(/super-admin/i);
    expect(mockCreateEpgOrder).not.toHaveBeenCalled();
  });

  it("errors when the order is not found", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ batchStatus: null }));
    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.error).toMatch(/not found/i);
  });

  it("errors when the order is already confirmed", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ batchStatus: "confirmed" }));
    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.error).toMatch(/already been completed/i);
  });

  it("errors when the order is in a non-pending status", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ batchStatus: "failed" }));
    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.error).toMatch(/expired/i);
  });

  it("errors when the order is not an installment plan", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ planType: "pay_in_full" }));
    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.error).toMatch(/not set up for installments/i);
  });

  it("rejects a client amount that does not match the order's installment-1 amount", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ amountDueNow: 200 }));
    const result = await createAdminInstallmentSession({ ...VALID_INPUT, amountDueNow: 250 });
    expect(result.error).toMatch(/does not match/i);
    expect(mockCreateEpgOrder).not.toHaveBeenCalled();
  });

  it("reuses an in-flight session (idempotency) without creating a new order", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({
        existingPayment: { state: "pending_authorization", payment_session_id: SESSION_ID },
      }),
    );
    mockFetchEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    expect(mockCreateEpgOrder).not.toHaveBeenCalled();
  });

  it("happy path: creates Order + session with doCapture:false and returns the URL", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock());
    mockCreateEpgOrder.mockResolvedValue({ id: ORDER_ID, href: ORDER_HREF });
    mockCreateEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createAdminInstallmentSession(VALID_INPUT);

    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    expect(mockCreateEpgOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountDollars: 200, customReference: BATCH_ID }),
    );
    // doCapture:false is the load-bearing flag — it makes EPG return a hostedCard
    // token for storage instead of capturing a one-time charge.
    expect(mockCreateEpgPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({ orderHref: ORDER_HREF, doCapture: false, customReference: BATCH_ID }),
    );
  });

  it("still returns the URL when the payments upsert fails (non-fatal)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ upsertError: true }));
    mockCreateEpgOrder.mockResolvedValue({ id: ORDER_ID, href: ORDER_HREF });
    mockCreateEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createAdminInstallmentSession(VALID_INPUT);
    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    expect(result.error).toBeUndefined();
  });
});
