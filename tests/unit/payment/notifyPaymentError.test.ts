import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotifiableErrorRow } from "@/utils/payment/notifyPaymentError";

// Phase-7 notification decision logic: throttled critical-dev alert +
// per-entity threshold escalation. Resend is mocked — no real email is sent.

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async () => ({ data: { id: "e" }, error: null })),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

/** Fake supabase whose count queries all resolve to `countResult`. */
function fakeSupabase(countResult: number) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    gte: () => Promise.resolve({ count: countResult, error: null }),
  };
  return { from: () => builder } as never;
}

const CRITICAL_DEV: NotifiableErrorRow = {
  id: "1",
  origin: "gateway",
  source: "webhook",
  category: "api_error",
  owner_lane: "dev",
  severity: "critical",
  order_id: null,
  installment_id: null,
  family_id: null,
  error_code: null,
  error_message: "EPG unreachable",
};

const ADMIN_ENTITY: NotifiableErrorRow = {
  ...CRITICAL_DEV,
  id: "2",
  category: "decline",
  owner_lane: "admin",
  severity: "warning",
  installment_id: "inst-1",
  error_message: "declined",
};

async function loadNotify() {
  return (await import("@/utils/payment/notifyPaymentError")).notifyPaymentError;
}

beforeEach(() => {
  sendMock.mockClear();
  vi.resetModules();
  vi.stubEnv("DEVELOPER_NOTIFICATION_EMAIL", "dev@test.local");
  vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "admin@test.local");
});

describe("notifyPaymentError — critical dev-lane throttle", () => {
  it("alerts when under the recent-critical cap", async () => {
    const notify = await loadNotify();
    await notify(fakeSupabase(2), CRITICAL_DEV);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("goes quiet once too many critical errors are logged in the window", async () => {
    const notify = await loadNotify();
    await notify(fakeSupabase(9), CRITICAL_DEV);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("notifyPaymentError — per-entity threshold escalation", () => {
  it("escalates on the threshold crossing (count === 3)", async () => {
    const notify = await loadNotify();
    await notify(fakeSupabase(3), ADMIN_ENTITY);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("does not escalate before the threshold", async () => {
    const notify = await loadNotify();
    await notify(fakeSupabase(2), ADMIN_ENTITY);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not escalate after the crossing (count > 3)", async () => {
    const notify = await loadNotify();
    await notify(fakeSupabase(4), ADMIN_ENTITY);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("notifyPaymentError — no recipient configured", () => {
  it("no-ops when neither developer nor admin email is set", async () => {
    vi.stubEnv("DEVELOPER_NOTIFICATION_EMAIL", "");
    vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "");
    vi.resetModules();
    const notify = await loadNotify();
    await notify(fakeSupabase(3), CRITICAL_DEV);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
