/**
 * Tests for POST /api/webhooks/epg
 *
 * These tests verify:
 *  - HTTP Basic auth validation
 *  - Notification parsing and event filtering
 *  - EPG transaction fetch (never trust the notification body)
 *  - Idempotency / replay protection (terminal-state fast-path)
 *  - Happy path: saleAuthorized → batch confirmed, installment paid, email sent
 *  - Declined path: payment state updated, batch NOT confirmed
 *  - Concurrent delivery: second webhook is a no-op once batch is confirmed
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock objects so vi.mock factories can reference them ────────────────
const { mockFrom, mockEmailSend, mockFetchEpgTransaction } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockEmailSend: vi.fn().mockResolvedValue({ data: { id: "email-001" }, error: null }),
  mockFetchEpgTransaction: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockEmailSend };
  },
}));

// Keep epgEventTypeToPaymentState real; mock only the network-bound function.
vi.mock("@/utils/payment/epg", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, fetchEpgTransaction: mockFetchEpgTransaction };
});

vi.mock("@/utils/prepareEmailHtml", () => ({
  prepareEmailHtml: (html: string) => html,
}));

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

// ── Import handler AFTER mocks are registered ─────────────────────────────────
import { POST } from "@/app/api/webhooks/epg/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_ID  = "batch-0000-0000-0000-000000000001";
const PAY_ID    = "pay-0000-0000-0000-000000000001";
const SEM_ID    = "sem-0000-0000-0000-000000000001";
const PARENT_ID = "user-0000-0000-0000-000000000001";
const TXN_ID    = "txn-0000-0000-0000-000000000001";

// Valid Basic auth header matching the env vars set in beforeEach.
const VALID_AUTH = "Basic " + Buffer.from("wh_user:wh_pass123").toString("base64");

// ── Fixture objects ───────────────────────────────────────────────────────────

const MOCK_TRANSACTION = {
  id: TXN_ID,
  href: `https://uat.epg.example.com/transactions/${TXN_ID}`,
  type: "sale",
  isAuthorized: true,
  state: "authorized",
  total: { amount: "100.00", currencyCode: "USD" },
  customReference: BATCH_ID,
  authorizationCode: "AUTH999",
  card: { maskedNumber: "411111******1111", last4: "1111", scheme: "visa" },
};

const MOCK_PAYMENT_ROW = {
  id: PAY_ID,
  state: "pending_authorization",
  registration_batch_id: BATCH_ID,
};

const MOCK_BATCH_ROW = {
  id: BATCH_ID,
  semester_id: SEM_ID,
  parent_id: PARENT_ID,
  grand_total: 100,
  payment_plan_type: "pay_in_full",
};

const MOCK_SEMESTER_ROW = {
  name: "Spring 2026",
  confirmation_email: {
    subject: "Registration Confirmed",
    fromEmail: "noreply@aydt.com",
    fromName: "AYDT",
    htmlBody: "<p>Hi {{parent_first_name}}, you are registered!</p>",
  },
};

const MOCK_PARENT_ROW = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
};

const MOCK_REGISTRATIONS = [
  {
    id: "reg-001",
    dancer_id: "dnc-001",
    dancers: { first_name: "Lily", last_name: "Doe" },
    class_sessions: { classes: { name: "Ballet 1A" } },
  },
];

// ── Chain builder ─────────────────────────────────────────────────────────────

/**
 * Universal Supabase query chain mock.
 *
 * All modifier methods (select, update, eq, …) return `this`, so they can be
 * chained freely. Terminal read methods (maybeSingle, single) resolve to the
 * configured value. Direct-await patterns (update().eq() without a terminal
 * method) use the `then` thennable.
 */
function makeChain(opts: {
  maybeSingleResult?: { data: unknown; error?: unknown };
  singleResult?: { data: unknown; error?: unknown };
  listResult?: { data: unknown[]; error?: unknown };
} = {}) {
  const maybeSingleVal = opts.maybeSingleResult ?? { data: null, error: null };
  const singleVal      = opts.singleResult      ?? { data: null, error: null };
  const listVal        = opts.listResult        ?? { data: [], error: null };

  const chain: Record<string, unknown> = {};

  for (const m of ["select", "update", "insert", "upsert", "eq", "neq", "in", "order", "limit"]) {
    chain[m] = vi.fn().mockReturnThis();
  }

  chain.maybeSingle = vi.fn().mockResolvedValue(maybeSingleVal);
  chain.single      = vi.fn().mockResolvedValue(singleVal);
  // Supports: `await supabase.from(t).update(…).eq(…)` (no terminal method)
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(listVal).then(resolve);

  return chain;
}

// ── Request factory ───────────────────────────────────────────────────────────

function makeRequest(opts: { authHeader?: string; body?: object } = {}) {
  return {
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "authorization" ? (opts.authHeader ?? null) : null,
    },
    json: () => Promise.resolve(opts.body ?? {}),
  };
}

function makeNotification(overrides: object = {}) {
  return {
    id: "notif-001",
    eventType: "saleAuthorized",
    resourceType: "transaction",
    resource: `https://uat.epg.example.com/transactions/${TXN_ID}`,
    customReference: BATCH_ID,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  process.env.EPG_WEBHOOK_USERNAME    = "wh_user";
  process.env.EPG_WEBHOOK_PASSWORD    = "wh_pass123";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.RESEND_API_KEY           = "test-resend-key";

  // Default: EPG fetch returns the mock transaction
  mockFetchEpgTransaction.mockResolvedValue(MOCK_TRANSACTION);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wire up the supabase mock for a saleAuthorized happy-path scenario. */
function setupHappyPathMock(opts: { batchResult?: unknown } = {}) {
  // Explicit undefined check so callers can pass null to simulate "already confirmed"
  const batchData = opts.batchResult !== undefined ? opts.batchResult : MOCK_BATCH_ROW;
  const paymentsChain       = makeChain({ maybeSingleResult: { data: MOCK_PAYMENT_ROW } });
  const batchChain          = makeChain({ maybeSingleResult: { data: batchData } });
  const registrationsChain  = makeChain({ listResult: MOCK_REGISTRATIONS });
  const semesterChain       = makeChain({ singleResult: { data: MOCK_SEMESTER_ROW } });
  const usersChain          = makeChain({ singleResult: { data: MOCK_PARENT_ROW } });
  const installmentsChain   = makeChain();

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case "payments":              return paymentsChain;
      case "registration_batches":  return batchChain;
      case "registrations":         return registrationsChain;
      case "batch_payment_installments": return installmentsChain;
      case "semesters":             return semesterChain;
      case "users":                 return usersChain;
      default:                      return makeChain();
    }
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("POST /api/webhooks/epg", () => {

  // ── Auth ──────────────────────────────────────────────────────────────────

  describe("HTTP Basic auth", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = makeRequest({ body: makeNotification() });
      const res = await POST(req as any);
      expect(res.status).toBe(401);
    });

    it("returns 401 when credentials are wrong", async () => {
      const badAuth = "Basic " + Buffer.from("wh_user:WRONG_PASS").toString("base64");
      const req = makeRequest({ authHeader: badAuth, body: makeNotification() });
      const res = await POST(req as any);
      expect(res.status).toBe(401);
    });

    it("proceeds past auth with correct credentials", async () => {
      // Provide correct auth but an untracked event so we stop early without DB calls.
      const req = makeRequest({
        authHeader: VALID_AUTH,
        body: makeNotification({ eventType: "unknownEvent" }),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ── Notification filtering ────────────────────────────────────────────────

  describe("notification filtering", () => {
    it("returns 200 and skips processing for non-transaction resourceType", async () => {
      const req = makeRequest({
        authHeader: VALID_AUTH,
        body: makeNotification({ resourceType: "order", eventType: "orderCreated" }),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      expect(mockFetchEpgTransaction).not.toHaveBeenCalled();
    });

    it("returns 200 for untracked eventType", async () => {
      const req = makeRequest({
        authHeader: VALID_AUTH,
        body: makeNotification({ eventType: "someFutureEvent" }),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      expect(mockFetchEpgTransaction).not.toHaveBeenCalled();
    });

    it("returns 200 when resource URL is missing", async () => {
      const req = makeRequest({
        authHeader: VALID_AUTH,
        body: makeNotification({ resource: undefined }),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      expect(mockFetchEpgTransaction).not.toHaveBeenCalled();
    });

    it("returns 200 for malformed JSON body without retrying", async () => {
      const req = {
        headers: { get: (k: string) => k === "authorization" ? VALID_AUTH : null },
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      };
      const res = await POST(req as any);
      expect(res.status).toBe(200);
    });
  });

  // ── EPG transaction fetch ──────────────────────────────────────────────────

  describe("EPG transaction fetch", () => {
    it("returns 500 when the EPG API is unreachable so EPG will retry", async () => {
      mockFetchEpgTransaction.mockRejectedValue(new Error("Connection refused"));
      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      const res = await POST(req as any);
      expect(res.status).toBe(500);
    });

    it("returns 200 when transaction has no customReference", async () => {
      mockFetchEpgTransaction.mockResolvedValue({
        ...MOCK_TRANSACTION,
        customReference: null,
      });
      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ── Payment record lookup ─────────────────────────────────────────────────

  describe("payment record lookup", () => {
    it("returns 200 silently when no payment row matches the customReference", async () => {
      // No payment record → unknown batch, ignore gracefully
      mockFrom.mockReturnValue(makeChain({ maybeSingleResult: { data: null } }));
      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
    });
  });

  // ── Idempotency / replay protection ───────────────────────────────────────

  describe("replay protection (terminal-state fast-path)", () => {
    it.each(["authorized", "captured", "settled", "declined", "voided", "refunded"])(
      "skips all DB writes when payment is already in terminal state: %s",
      async (terminalState) => {
        const paymentsChain = makeChain({
          maybeSingleResult: { data: { ...MOCK_PAYMENT_ROW, state: terminalState } },
        });
        mockFrom.mockReturnValue(paymentsChain);

        const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
        const res = await POST(req as any);

        expect(res.status).toBe(200);
        // from() was called once (payments lookup) — no further tables written
        expect(mockFrom).toHaveBeenCalledTimes(1);
        expect(mockEmailSend).not.toHaveBeenCalled();
      },
    );
  });

  // ── Declined payment ──────────────────────────────────────────────────────

  describe("saleDeclined", () => {
    it("updates payment state to declined and does NOT confirm the batch", async () => {
      const paymentsChain = makeChain({
        maybeSingleResult: { data: MOCK_PAYMENT_ROW },
      });
      const batchChain = makeChain({ maybeSingleResult: { data: null } }); // never reached

      mockFrom.mockImplementation((table: string) => {
        if (table === "payments") return paymentsChain;
        if (table === "registration_batches") return batchChain;
        return makeChain();
      });

      mockFetchEpgTransaction.mockResolvedValue({
        ...MOCK_TRANSACTION,
        isAuthorized: false,
        state: "declined",
      });

      const req = makeRequest({
        authHeader: VALID_AUTH,
        body: makeNotification({ eventType: "saleDeclined" }),
      });
      const res = await POST(req as any);

      expect(res.status).toBe(200);
      // registration_batches should never be touched for a declined payment
      expect(mockFrom).not.toHaveBeenCalledWith("registration_batches");
      expect(mockEmailSend).not.toHaveBeenCalled();
    });
  });

  // ── Happy path: saleAuthorized ────────────────────────────────────────────

  describe("saleAuthorized (happy path)", () => {
    it("confirms batch, marks installment paid, confirms registrations, sends email", async () => {
      setupHappyPathMock();

      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      const res = await POST(req as any);

      expect(res.status).toBe(200);
      expect((res as any).body).toEqual({ ok: true });

      // Confirmation email sent
      expect(mockEmailSend).toHaveBeenCalledOnce();
      const emailCall = mockEmailSend.mock.calls[0][0];
      expect(emailCall.to).toBe("jane@example.com");
      expect(emailCall.subject).toBe("Registration Confirmed");
      // Template variable replaced
      expect(emailCall.html).toContain("Jane");
    });

    it("batch uses status='pending' for the conditional update (validates the bug fix)", async () => {
      setupHappyPathMock();

      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      await POST(req as any);

      // Find the registration_batches chain and inspect the eq() calls
      const batchChainCalls = mockFrom.mock.calls
        .map((args, i) => ({ table: args[0], chain: mockFrom.mock.results[i].value }))
        .filter(({ table }) => table === "registration_batches");

      expect(batchChainCalls).toHaveLength(1);
      const batchChain = batchChainCalls[0].chain;
      // The second .eq() call should be .eq("status", "pending") — not "pending_payment"
      const eqCalls = (batchChain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const statusEqCall = eqCalls.find(
        ([col]: [string]) => col === "status",
      );
      expect(statusEqCall).toBeDefined();
      expect(statusEqCall![1]).toBe("pending");
    });

    it("does NOT send email when semester has no confirmation_email configured", async () => {
      const paymentsChain      = makeChain({ maybeSingleResult: { data: MOCK_PAYMENT_ROW } });
      const batchChain         = makeChain({ maybeSingleResult: { data: MOCK_BATCH_ROW } });
      const registrationsChain = makeChain({ listResult: MOCK_REGISTRATIONS });
      const semesterChain      = makeChain({ singleResult: { data: { name: "Spring 2026", confirmation_email: null } } });
      const installmentsChain  = makeChain();
      const usersChain         = makeChain({ singleResult: { data: MOCK_PARENT_ROW } });

      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case "payments":              return paymentsChain;
          case "registration_batches":  return batchChain;
          case "registrations":         return registrationsChain;
          case "batch_payment_installments": return installmentsChain;
          case "semesters":             return semesterChain;
          case "users":                 return usersChain;
          default:                      return makeChain();
        }
      });

      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      const res = await POST(req as any);

      expect(res.status).toBe(200);
      expect(mockEmailSend).not.toHaveBeenCalled();
    });
  });

  // ── Concurrent delivery (second webhook arrives after batch already confirmed) ──

  describe("concurrent delivery", () => {
    it("returns 200 and does NOT send a second email when batch is already confirmed", async () => {
      // Batch update returns null because .eq("status", "pending") matched 0 rows
      // (batch is already "confirmed" from the first delivery)
      setupHappyPathMock({ batchResult: null });

      const req = makeRequest({ authHeader: VALID_AUTH, body: makeNotification() });
      const res = await POST(req as any);

      expect(res.status).toBe(200);
      expect(mockEmailSend).not.toHaveBeenCalled();
    });
  });

});
