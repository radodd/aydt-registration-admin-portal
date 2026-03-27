/**
 * Tests for utils/sendSms.ts
 *
 * Covers:
 *  - E.164 phone number normalization
 *  - "AYDT: " prefix injection and 160-char body cap
 *  - Twilio messages.create called with correct params
 *  - sms_notifications row inserted on every attempt (success and failure)
 *  - Status and twilio_sid reflect the Twilio response
 *  - Error path: Twilio throws → status="failed", error_message set, never rethrows
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock objects ────────────────────────────────────────────────────────
const { mockMessagesCreate, mockInsert } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockInsert: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

// server-only throws in non-server test environments
vi.mock("server-only", () => ({}));

vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

// Supabase — only sms_notifications.insert is exercised in sendSms
vi.mock("@/utils/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: () => ({
        insert: mockInsert,
      }),
    }),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import { sendSms } from "@/utils/sendSms";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID    = "AC_test_sid";
  process.env.TWILIO_AUTH_TOKEN     = "test_auth_token";
  process.env.TWILIO_PHONE_NUMBER   = "+10005550000";

  // Default: successful send
  mockMessagesCreate.mockResolvedValue({ sid: "SM_test_sid_001" });
  // Default: insert succeeds (no throw needed — sendSms swallows errors)
  mockInsert.mockResolvedValue({ error: null });
});

// =============================================================================
// Tests
// =============================================================================

describe("sendSms — E.164 normalization", () => {
  it("converts 10-digit number to +1XXXXXXXXXX", async () => {
    await sendSms("8087285029", "Test message");
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+18087285029" })
    );
  });

  it("converts 11-digit number starting with 1 to +1XXXXXXXXXX", async () => {
    await sendSms("18087285029", "Test message");
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+18087285029" })
    );
  });

  it("passes through an already-E.164 number unchanged", async () => {
    await sendSms("+18087285029", "Test message");
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+18087285029" })
    );
  });

  it("strips non-digit characters before normalizing", async () => {
    await sendSms("(808) 728-5029", "Test message");
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+18087285029" })
    );
  });
});

describe("sendSms — message body", () => {
  it("prepends 'AYDT: ' to every message", async () => {
    await sendSms("+18087285029", "Class is canceled");
    const { body } = mockMessagesCreate.mock.calls[0][0];
    expect(body).toBe("AYDT: Class is canceled");
  });

  it("caps total body at 160 characters", async () => {
    const longMessage = "A".repeat(200);
    await sendSms("+18087285029", longMessage);
    const { body } = mockMessagesCreate.mock.calls[0][0];
    expect(body.length).toBe(160);
    expect(body.startsWith("AYDT: ")).toBe(true);
  });

  it("does not truncate messages under 160 chars", async () => {
    const short = "Ballet canceled";
    await sendSms("+18087285029", short);
    const { body } = mockMessagesCreate.mock.calls[0][0];
    expect(body).toBe("AYDT: Ballet canceled");
    expect(body.length).toBeLessThan(160);
  });

  it("sends from the configured TWILIO_PHONE_NUMBER", async () => {
    await sendSms("+18087285029", "Test");
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "+10005550000" })
    );
  });
});

describe("sendSms — DB logging", () => {
  it("inserts a row with status='sent' and twilio_sid on success", async () => {
    await sendSms("+18087285029", "Waitlist spot opened");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        twilio_sid: "SM_test_sid_001",
        error_message: null,
        to_phone: "+18087285029",
      })
    );
  });

  it("includes userId when provided", async () => {
    await sendSms("+18087285029", "Payment overdue", "user-uuid-001");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-uuid-001" })
    );
  });

  it("sets user_id to null when not provided", async () => {
    await sendSms("+18087285029", "Payment overdue");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null })
    );
  });
});

describe("sendSms — error path", () => {
  it("inserts with status='failed' and error_message when Twilio throws", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("30034 — carrier rejected"));
    await sendSms("+18087285029", "Test");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        twilio_sid: null,
        error_message: "30034 — carrier rejected",
      })
    );
  });

  it("never rethrows — sendSms is always best-effort", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Network failure"));
    await expect(sendSms("+18087285029", "Test")).resolves.toBeUndefined();
  });

  it("still logs when Twilio fails with a non-Error rejection", async () => {
    mockMessagesCreate.mockRejectedValue("string error");
    await sendSms("+18087285029", "Test");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_message: "string error",
      })
    );
  });
});
