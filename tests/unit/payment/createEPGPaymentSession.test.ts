/**
 * Tests for createEPGPaymentSession server action.
 *
 * Covers:
 *  - Auth guard (unauthenticated caller)
 *  - Batch validation (not found, already confirmed, wrong status)
 *  - Idempotency: re-use existing pending_authorization session if still valid
 *  - Happy path: creates Order + PaymentSession, upserts payments row
 *  - Non-fatal upsert failure: still returns the session URL
 *  - EPG API errors: returns descriptive error to caller
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock objects ────────────────────────────────────────────────────────
const {
  mockCreateClient,
  mockCreateEpgOrder,
  mockCreateEpgPaymentSession,
  mockFetchEpgPaymentSession,
} = vi.hoisted(() => ({
  mockCreateClient:           vi.fn(),
  mockCreateEpgOrder:         vi.fn(),
  mockCreateEpgPaymentSession: vi.fn(),
  mockFetchEpgPaymentSession:  vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/utils/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "host" ? "localhost:3000" : null),
  }),
}));

vi.mock("@/utils/payment/epg", () => ({
  createEpgOrder:          mockCreateEpgOrder,
  createEpgPaymentSession: mockCreateEpgPaymentSession,
  fetchEpgPaymentSession:  mockFetchEpgPaymentSession,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import { createEPGPaymentSession } from "@/app/actions/createEPGPaymentSession";

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_ID    = "batch-0000-0000-0000-000000000001";
const SEM_ID      = "sem-0000-0000-0000-000000000001";
const USER_ID     = "user-0000-0000-0000-000000000001";
const ORDER_ID    = "ord-0000-0000-0000-000000000001";
const ORDER_HREF  = `https://uat.epg.example.com/orders/${ORDER_ID}`;
const SESSION_ID  = "ps-00000-0000-0000-000000000001";
const SESSION_URL = "https://uat.epg.example.com/hpp?session=abc123";

const VALID_INPUT = {
  batchId:       BATCH_ID,
  amountDueNow:  100.0,
  semesterId:    SEM_ID,
  semesterName:  "Spring 2026",
};

// ── Chain builder ─────────────────────────────────────────────────────────────

function makeChain(opts: {
  maybeSingleResult?: { data: unknown; error?: unknown };
  singleResult?:      { data: unknown; error?: unknown };
  upsertResult?:      { error: unknown };
} = {}) {
  const chain: Record<string, unknown> = {};

  for (const m of ["select", "update", "insert", "upsert", "eq", "neq", "in", "order", "limit"]) {
    chain[m] = vi.fn().mockReturnThis();
  }

  chain.maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingleResult ?? { data: null, error: null });
  chain.single      = vi.fn().mockResolvedValue(opts.singleResult      ?? { data: null, error: null });
  chain.then        = (resolve: (v: unknown) => void) =>
    Promise.resolve(opts.upsertResult ?? { data: null, error: null }).then(resolve);

  return chain;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  process.env.EPG_BASE_URL = "https://uat.epg.example.com";
  process.env.NODE_ENV     = "test";
});

/** Build a supabase mock where the user is authenticated and the batch is in the given status. */
function makeSupabaseMock(opts: {
  authenticated?: boolean;
  batchStatus?:   string | null;    // null = batch not found
  existingPayment?: { state: string; payment_session_id: string | null } | null;
  upsertError?: boolean;
} = {}) {
  const {
    authenticated   = true,
    batchStatus     = "pending",
    existingPayment = null,
    upsertError     = false,
  } = opts;

  const user = authenticated ? { id: USER_ID } : null;

  const batchData   = batchStatus === null ? null : { id: BATCH_ID, status: batchStatus };
  const batchChain  = makeChain({ singleResult: { data: batchData, error: batchStatus === null ? { code: "PGRST116" } : null } });

  const paymentChain = makeChain({ maybeSingleResult: { data: existingPayment } });

  const upsertChain = makeChain({ upsertResult: { error: upsertError ? new Error("DB error") : null } });

  const fromMock = vi.fn().mockImplementation((table: string) => {
    switch (table) {
      case "registration_batches": return batchChain;
      case "payments":             return paymentChain;
      default:                     return makeChain();
    }
  });

  // Override payments to handle both read (maybeSingle) and write (upsert / then)
  let paymentsCallIndex = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "payments") {
      // First call: read existing payment. Subsequent calls: upsert.
      return paymentsCallIndex++ === 0 ? paymentChain : upsertChain;
    }
    if (table === "registration_batches") return batchChain;
    return makeChain();
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: fromMock,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("createEPGPaymentSession", () => {

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it("returns error when caller is not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ authenticated: false }));
    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toMatch(/not authenticated/i);
    expect(result.paymentSessionUrl).toBeUndefined();
  });

  // ── Batch validation ───────────────────────────────────────────────────────

  it("returns error when the batch is not found", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ batchStatus: null }));
    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toBeTruthy();
  });

  it("returns error when batch is already confirmed", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ batchStatus: "confirmed" }));
    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toMatch(/already been paid/i);
  });

  it("returns error when batch is in an unexpected status (e.g. failed)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ batchStatus: "failed" }));
    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toMatch(/not in a payable state/i);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("re-fetches and returns existing session URL for a pending_authorization payment", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({
        existingPayment: { state: "pending_authorization", payment_session_id: SESSION_ID },
      }),
    );

    mockFetchEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createEPGPaymentSession(VALID_INPUT);

    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    // Should NOT have created a new order
    expect(mockCreateEpgOrder).not.toHaveBeenCalled();
  });

  it("falls through to create a new session when the existing session URL is gone", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({
        existingPayment: { state: "pending_authorization", payment_session_id: SESSION_ID },
      }),
    );

    // Simulate expired / missing session
    mockFetchEpgPaymentSession.mockRejectedValue(new Error("404 Not Found"));
    mockCreateEpgOrder.mockResolvedValue({ id: ORDER_ID, href: ORDER_HREF });
    mockCreateEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createEPGPaymentSession(VALID_INPUT);

    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    expect(mockCreateEpgOrder).toHaveBeenCalledOnce();
  });

  it("returns error when the existing payment is already in a terminal state (authorized)", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({
        existingPayment: { state: "authorized", payment_session_id: SESSION_ID },
      }),
    );

    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toMatch(/already completed/i);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("creates EPG Order + PaymentSession and returns the HPP redirect URL", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock());

    mockCreateEpgOrder.mockResolvedValue({ id: ORDER_ID, href: ORDER_HREF });
    mockCreateEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createEPGPaymentSession(VALID_INPUT);

    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    expect(result.error).toBeUndefined();

    // Order was created with the correct amount and reference
    expect(mockCreateEpgOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amountDollars:   VALID_INPUT.amountDueNow,
        currencyCode:    "USD",
        customReference: BATCH_ID,
      }),
    );

    // Session was created with fullPageRedirect and 3DS enabled
    expect(mockCreateEpgPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orderHref:        ORDER_HREF,
        doThreeDSecure:   true,
        customReference:  BATCH_ID,
      }),
    );
  });

  // ── EPG API errors ─────────────────────────────────────────────────────────

  it("returns error when EPG order creation fails", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock());
    mockCreateEpgOrder.mockRejectedValue(new Error("[CARD_PROCESSING_UNAVAILABLE] Service down"));

    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toMatch(/failed to create payment order/i);
    expect(result.paymentSessionUrl).toBeUndefined();
  });

  it("returns error when EPG session creation fails", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock());
    mockCreateEpgOrder.mockResolvedValue({ id: ORDER_ID, href: ORDER_HREF });
    mockCreateEpgPaymentSession.mockRejectedValue(new Error("[INVALID_MERCHANT] Unknown alias"));

    const result = await createEPGPaymentSession(VALID_INPUT);
    expect(result.error).toMatch(/failed to create payment session/i);
    expect(result.paymentSessionUrl).toBeUndefined();
  });

  it("still returns the session URL even when the payments upsert fails (non-fatal)", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ upsertError: true }));
    mockCreateEpgOrder.mockResolvedValue({ id: ORDER_ID, href: ORDER_HREF });
    mockCreateEpgPaymentSession.mockResolvedValue({ id: SESSION_ID, url: SESSION_URL });

    const result = await createEPGPaymentSession(VALID_INPUT);

    // User still gets redirected — the webhook will handle confirming later
    expect(result.paymentSessionUrl).toBe(SESSION_URL);
    expect(result.error).toBeUndefined();
  });

});
