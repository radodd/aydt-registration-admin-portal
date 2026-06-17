import { describe, it, expect } from "vitest";
import { classifyPaymentError } from "@/utils/payment/classifyPaymentError";

// Classifier contract — see docs/PAYMENT_ERROR_LOGGING_PLAN.md §2 & §5.
// The four axes returned: { category, ownerLane, severity, isRetryable }.

describe("classifyPaymentError — application origin", () => {
  it("routes every application error to the dev lane, never retryable", () => {
    const c = classifyPaymentError({
      origin: "application",
      source: "app_internal",
      category: "bad_state",
    });
    expect(c.ownerLane).toBe("dev");
    expect(c.isRetryable).toBe(false);
    expect(c.severity).toBe("critical");
    expect(c.category).toBe("bad_state");
  });

  it("treats validation as a warning, not critical", () => {
    const c = classifyPaymentError({
      origin: "application",
      source: "app_internal",
      category: "validation",
    });
    expect(c.severity).toBe("warning");
    expect(c.ownerLane).toBe("dev");
  });

  it("defaults to unknown category when none supplied", () => {
    const c = classifyPaymentError({ origin: "application", source: "app_internal" });
    expect(c.category).toBe("unknown");
    expect(c.isRetryable).toBe(false);
  });
});

describe("classifyPaymentError — gateway code map", () => {
  it("insufficient_funds is an admin-lane SOFT decline → retryable", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorCode: "insufficient_funds",
    });
    expect(c.category).toBe("insufficient_funds");
    expect(c.ownerLane).toBe("admin");
    expect(c.isRetryable).toBe(true);
    expect(c.severity).toBe("warning");
  });

  it("expired_card is an admin-lane HARD decline → never auto-retry", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorCode: "expired_card",
    });
    expect(c.category).toBe("card_expired");
    expect(c.ownerLane).toBe("admin");
    expect(c.isRetryable).toBe(false);
  });

  it("token_expired routes to admin (must re-add card), terminal", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "webhook",
      errorCode: "token_not_found",
    });
    expect(c.category).toBe("token_expired");
    expect(c.ownerLane).toBe("admin");
    expect(c.isRetryable).toBe(false);
  });

  it("matches codes case-insensitively with surrounding whitespace", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorCode: "  DO_NOT_HONOR  ",
    });
    expect(c.category).toBe("decline");
    expect(c.ownerLane).toBe("admin");
    expect(c.isRetryable).toBe(false);
  });
});

describe("classifyPaymentError — HTTP transport failures", () => {
  it("5xx → dev lane, network, retryable, critical", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      httpStatus: 503,
    });
    expect(c.category).toBe("network");
    expect(c.ownerLane).toBe("dev");
    expect(c.isRetryable).toBe(true);
    expect(c.severity).toBe("critical");
  });

  it("429 rate limit is treated as retryable transport", () => {
    const c = classifyPaymentError({ origin: "gateway", source: "cron", httpStatus: 429 });
    expect(c.isRetryable).toBe(true);
    expect(c.ownerLane).toBe("dev");
  });

  it("a known decline code wins over a 5xx status", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorCode: "stolen_card",
      httpStatus: 500,
    });
    expect(c.category).toBe("decline");
    expect(c.ownerLane).toBe("admin");
    expect(c.isRetryable).toBe(false);
  });
});

describe("classifyPaymentError — message heuristics", () => {
  it("infers a timeout from the message → network + retryable", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorMessage: "Connection timed out talking to EPG",
    });
    expect(c.category).toBe("network");
    expect(c.isRetryable).toBe(true);
  });

  it("infers insufficient funds from the message → admin + retryable", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "webhook",
      errorMessage: "Card declined: insufficient funds",
    });
    // "insufficient" is checked before "declined" in the heuristic order.
    expect(c.category).toBe("insufficient_funds");
    expect(c.ownerLane).toBe("admin");
    expect(c.isRetryable).toBe(true);
  });

  it("infers a 3DS/MIT problem → dev lane, not retryable", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorMessage: "3DS authentication required for MIT",
    });
    expect(c.category).toBe("3ds_mit");
    expect(c.ownerLane).toBe("dev");
    expect(c.isRetryable).toBe(false);
  });
});

describe("classifyPaymentError — conservative fallthrough", () => {
  it("an unknown gateway code with no hints stays unknown + NON-retryable", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "cron",
      errorCode: "SSL_RESULT_9999_NOT_YET_MAPPED",
    });
    expect(c.category).toBe("unknown");
    expect(c.isRetryable).toBe(false);
    expect(c.ownerLane).toBe("dev");
  });

  it("honors a caller-supplied category when nothing else matches", () => {
    const c = classifyPaymentError({
      origin: "gateway",
      source: "manual_admin",
      category: "idempotency",
    });
    expect(c.category).toBe("idempotency");
    expect(c.ownerLane).toBe("dev");
    expect(c.isRetryable).toBe(false);
  });
});
