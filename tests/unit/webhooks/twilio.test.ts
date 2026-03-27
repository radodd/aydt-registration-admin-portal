/**
 * Tests for POST /api/webhooks/twilio
 *
 * Covers:
 *  - Missing TWILIO_WEBHOOK_AUTH_TOKEN → 500
 *  - Invalid Twilio signature → 401
 *  - Missing MessageSid → 200, no DB write
 *  - Known statuses (delivered, sent, undelivered, failed) → correct DB update
 *  - delivered status sets delivered_at timestamp
 *  - Unknown status passes through raw
 *  - DB error → still returns 200 to prevent Twilio retries
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock objects ────────────────────────────────────────────────────────
const { mockValidateRequest, mockUpdate } = vi.hoisted(() => ({
  mockValidateRequest: vi.fn(),
  mockUpdate: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("twilio", () => ({
  validateRequest: mockValidateRequest,
}));

// Supabase chain: update().eq() direct-await pattern
vi.mock("@/utils/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: () => ({
        update: mockUpdate,
      }),
    }),
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

// ── Import handler AFTER mocks ────────────────────────────────────────────────
import { POST } from "@/app/api/webhooks/twilio/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(opts: {
  signature?: string;
  body?: Record<string, string>;
} = {}) {
  const params = opts.body ?? {
    MessageSid: "SM_webhook_001",
    MessageStatus: "delivered",
  };
  const encoded = new URLSearchParams(params).toString();

  return {
    text: () => Promise.resolve(encoded),
    headers: {
      get: (key: string) =>
        key === "x-twilio-signature" ? (opts.signature ?? "valid-sig") : null,
    },
  };
}

// eq() chain — supports direct await via `then`
function makeEqChain(result = { error: null }) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn().mockReturnThis();
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  process.env.TWILIO_WEBHOOK_AUTH_TOKEN = "test_webhook_token";
  process.env.NEXT_PUBLIC_APP_URL       = "https://aydt.nyc";

  // Default: signature is valid
  mockValidateRequest.mockReturnValue(true);
  // Default: DB update succeeds
  mockUpdate.mockReturnValue(makeEqChain());
});

// =============================================================================
// Tests
// =============================================================================

describe("POST /api/webhooks/twilio", () => {

  // ── Configuration guard ────────────────────────────────────────────────────

  describe("configuration guard", () => {
    it("returns 500 when TWILIO_WEBHOOK_AUTH_TOKEN is not set", async () => {
      delete process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
      const res = await POST(makeRequest() as any);
      expect(res.status).toBe(500);
    });
  });

  // ── Signature validation ───────────────────────────────────────────────────

  describe("signature validation", () => {
    it("returns 401 when x-twilio-signature is invalid", async () => {
      mockValidateRequest.mockReturnValue(false);
      const res = await POST(makeRequest({ signature: "bad-sig" }) as any);
      expect(res.status).toBe(401);
    });

    it("passes when signature is valid", async () => {
      mockValidateRequest.mockReturnValue(true);
      const res = await POST(makeRequest() as any);
      expect(res.status).toBe(200);
    });

    it("calls validateRequest with the correct URL", async () => {
      await POST(makeRequest() as any);
      expect(mockValidateRequest).toHaveBeenCalledWith(
        "test_webhook_token",
        "valid-sig",
        "https://aydt.nyc/api/webhooks/twilio",
        expect.any(Object)
      );
    });
  });

  // ── MessageSid guard ───────────────────────────────────────────────────────

  describe("MessageSid guard", () => {
    it("returns 200 and skips DB when MessageSid is missing", async () => {
      const res = await POST(
        makeRequest({ body: { MessageStatus: "delivered" } }) as any
      );
      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ── Status mapping ─────────────────────────────────────────────────────────

  describe("status mapping", () => {
    it.each([
      ["sent",        "sent"],
      ["delivered",   "delivered"],
      ["undelivered", "undelivered"],
      ["failed",      "failed"],
    ])("maps Twilio status '%s' → db status '%s'", async (twilioStatus, dbStatus) => {
      await POST(
        makeRequest({ body: { MessageSid: "SM001", MessageStatus: twilioStatus } }) as any
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: dbStatus })
      );
    });

    it("passes unknown status through as-is", async () => {
      await POST(
        makeRequest({ body: { MessageSid: "SM001", MessageStatus: "queued" } }) as any
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "queued" })
      );
    });
  });

  // ── delivered_at ──────────────────────────────────────────────────────────

  describe("delivered_at timestamp", () => {
    it("sets delivered_at when status is 'delivered'", async () => {
      await POST(
        makeRequest({ body: { MessageSid: "SM001", MessageStatus: "delivered" } }) as any
      );
      const updateArg = (mockUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(updateArg.delivered_at).toBeDefined();
      expect(typeof updateArg.delivered_at).toBe("string");
    });

    it("does NOT set delivered_at for non-delivered statuses", async () => {
      await POST(
        makeRequest({ body: { MessageSid: "SM001", MessageStatus: "failed" } }) as any
      );
      const updateArg = (mockUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(updateArg.delivered_at).toBeUndefined();
    });
  });

  // ── DB error resilience ───────────────────────────────────────────────────

  describe("DB error resilience", () => {
    it("returns 200 even when the DB update fails (prevents Twilio retries)", async () => {
      mockUpdate.mockReturnValue(makeEqChain({ error: { message: "DB down" } }));
      const res = await POST(makeRequest() as any);
      expect(res.status).toBe(200);
      expect((res as any).body).toEqual({ ok: true });
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("updates sms_notifications by twilio_sid and returns { ok: true }", async () => {
      const eqChain = makeEqChain();
      mockUpdate.mockReturnValue(eqChain);

      const res = await POST(
        makeRequest({ body: { MessageSid: "SM_happy_001", MessageStatus: "delivered" } }) as any
      );

      expect(res.status).toBe(200);
      expect((res as any).body).toEqual({ ok: true });
      expect(eqChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        "twilio_sid", "SM_happy_001"
      );
    });
  });
});
