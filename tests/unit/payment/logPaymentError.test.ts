import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration of the REAL writer with mocked I/O (no DB, no email):
// proves classification flows into the inserted row and that Phase-7
// notification is invoked with the persisted row.

const { inserted, singleMock, notifySpy } = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  singleMock: vi.fn(async () => ({ data: { id: "log-1" }, error: null })),
  notifySpy: vi.fn(async () => {}),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: singleMock }) };
      },
    }),
  }),
}));

vi.mock("@/utils/payment/notifyPaymentError", () => ({ notifyPaymentError: notifySpy }));

import { logPaymentError } from "@/utils/payment/logPaymentError";

beforeEach(() => {
  inserted.length = 0;
  notifySpy.mockClear();
  singleMock.mockClear();
});

describe("logPaymentError — classification → persisted row", () => {
  it("hard decline → admin lane, terminal, status new", async () => {
    const id = await logPaymentError({ origin: "gateway", source: "cron", errorCode: "expired_card" });
    expect(id).toBe("log-1");
    expect(inserted[0]).toMatchObject({
      origin: "gateway",
      source: "cron",
      category: "card_expired",
      owner_lane: "admin",
      is_retryable: false,
      status: "new",
    });
  });

  it("application origin → dev lane, non-retryable", async () => {
    await logPaymentError({
      origin: "application",
      source: "app_internal",
      category: "bad_state",
      errorMessage: "missing pricing",
    });
    expect(inserted[0]).toMatchObject({
      origin: "application",
      owner_lane: "dev",
      is_retryable: false,
      category: "bad_state",
    });
  });

  it("serializes an Error rawPayload safely", async () => {
    await logPaymentError({ origin: "application", source: "app_internal", rawPayload: new Error("boom") });
    expect(inserted[0].raw_payload).toMatchObject({ name: "Error", message: "boom" });
  });

  it("honors explicit overrides for lane/severity/retryable", async () => {
    await logPaymentError({
      origin: "gateway",
      source: "webhook",
      category: "unknown",
      ownerLane: "admin",
      severity: "info",
      isRetryable: true,
    });
    expect(inserted[0]).toMatchObject({ owner_lane: "admin", severity: "info", is_retryable: true });
  });

  it("fires Phase-7 notification with the persisted row", async () => {
    await logPaymentError({ origin: "gateway", source: "cron", errorCode: "expired_card" });
    expect(notifySpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "log-1", category: "card_expired", owner_lane: "admin" }),
    );
  });
});
