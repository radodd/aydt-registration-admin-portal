/**
 * Payment error classifier — see docs/PAYMENT_ERROR_LOGGING_PLAN.md §2 & §5.
 *
 * Maps a raw failure into the four normalized axes the error log stores:
 *   category    — what kind of failure
 *   ownerLane   — who can act (admin vs dev)
 *   severity    — info | warning | critical
 *   isRetryable — transient (safe to auto-retry) vs terminal (never auto-retry)
 *
 * ⚠️ The GATEWAY_CODE_MAP below is a STARTER, not the authoritative Elavon list.
 * The real decline/error code → lane mapping must be populated from docs/elavon/
 * (plan §12 open question) before we rely on auto-retry for production charging.
 * Until then, unknown gateway codes fall through to message/HTTP heuristics and
 * default to the conservative, NON-retryable side.
 */

import type {
  PaymentErrorCategory,
  PaymentErrorOrigin,
  PaymentErrorOwnerLane,
  PaymentErrorSeverity,
  PaymentErrorSource,
} from "@/types";

export interface ClassifyPaymentErrorInput {
  origin: PaymentErrorOrigin;
  source: PaymentErrorSource;
  /** EPG result/error code, or an app error code. */
  errorCode?: string | null;
  /** Human-readable message; used for keyword heuristics. */
  errorMessage?: string | null;
  /** HTTP status from the gateway call, if any. */
  httpStatus?: number | null;
  /**
   * Caller-supplied category. For application-origin errors the caller usually
   * knows the category (e.g. 'validation'); honored as-is when provided.
   */
  category?: PaymentErrorCategory | null;
}

export interface PaymentErrorClassification {
  category: PaymentErrorCategory;
  ownerLane: PaymentErrorOwnerLane;
  severity: PaymentErrorSeverity;
  isRetryable: boolean;
}

/**
 * Known gateway codes → classification. STARTER MAP — extend from docs/elavon/.
 * Keys are compared case-insensitively against the raw errorCode.
 *
 * Guiding rule: hard declines (account/card invalid, do-not-honor, fraud) are
 * TERMINAL and admin-lane (a human must fix the card). Soft/transient failures
 * are dev-or-retryable. When unsure, prefer NON-retryable.
 */
const GATEWAY_CODE_MAP: Record<
  string,
  Partial<PaymentErrorClassification> & { category: PaymentErrorCategory }
> = {
  // ── Soft declines — admin lane, retryable ──
  insufficient_funds: { category: "insufficient_funds", ownerLane: "admin", isRetryable: true },

  // ── Hard declines — admin lane, terminal (never auto-retry) ──
  expired_card: { category: "card_expired", ownerLane: "admin", isRetryable: false },
  pickup_card: { category: "decline", ownerLane: "admin", isRetryable: false },
  stolen_card: { category: "decline", ownerLane: "admin", isRetryable: false },
  invalid_account: { category: "decline", ownerLane: "admin", isRetryable: false },
  do_not_honor: { category: "decline", ownerLane: "admin", isRetryable: false },

  // ── AVS / CVV ──
  avs_mismatch: { category: "avs_cvv", ownerLane: "admin", isRetryable: false },
  cvv_mismatch: { category: "avs_cvv", ownerLane: "admin", isRetryable: false },

  // ── Stored credential problems — admin must re-add a card ──
  token_expired: { category: "token_expired", ownerLane: "admin", isRetryable: false },
  token_not_found: { category: "token_expired", ownerLane: "admin", isRetryable: false },
};

/** Lowercased substring → category, used when no code match is found. */
const MESSAGE_HEURISTICS: Array<[string, PaymentErrorCategory]> = [
  ["insufficient", "insufficient_funds"],
  ["expired", "card_expired"],
  ["declined", "decline"],
  ["do not honor", "decline"],
  ["avs", "avs_cvv"],
  ["cvv", "avs_cvv"],
  ["cvc", "avs_cvv"],
  ["token", "token_expired"],
  ["3ds", "3ds_mit"],
  ["three-d", "3ds_mit"],
  ["timeout", "network"],
  ["timed out", "network"],
  ["network", "network"],
  ["econnreset", "network"],
  ["duplicate", "idempotency"],
  ["idempot", "idempotency"],
];

const ADMIN_LANE_CATEGORIES = new Set<PaymentErrorCategory>([
  "decline",
  "insufficient_funds",
  "card_expired",
  "token_expired",
  "avs_cvv",
]);

/** Transient categories that are safe to auto-retry through the same charge path. */
const RETRYABLE_CATEGORIES = new Set<PaymentErrorCategory>([
  "network",
  "api_error",
  "insufficient_funds",
]);

export function classifyPaymentError(
  input: ClassifyPaymentErrorInput,
): PaymentErrorClassification {
  const { origin, errorCode, errorMessage, httpStatus } = input;

  // Application-origin errors are (almost always) the developer's to fix and are
  // never auto-charged through the gateway, so they are never auto-retryable.
  if (origin === "application") {
    const category = input.category ?? "unknown";
    return {
      category,
      ownerLane: "dev",
      severity: category === "validation" ? "warning" : "critical",
      isRetryable: false,
    };
  }

  // ── Gateway origin ──
  // 1. Exact known-code match wins.
  const codeKey = errorCode?.trim().toLowerCase();
  const mapped = codeKey ? GATEWAY_CODE_MAP[codeKey] : undefined;
  if (mapped) {
    return finalize(mapped.category, mapped, httpStatus);
  }

  // 2. HTTP-level transport failures → dev lane, retryable.
  if (httpStatus != null && (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429)) {
    return finalize("network", { ownerLane: "dev", isRetryable: true }, httpStatus);
  }

  // 3. Message keyword heuristics.
  const msg = errorMessage?.toLowerCase() ?? "";
  const hit = MESSAGE_HEURISTICS.find(([needle]) => msg.includes(needle));
  if (hit) {
    return finalize(hit[1], {}, httpStatus);
  }

  // 4. Caller-provided category, else unknown. Conservative: non-retryable.
  return finalize(input.category ?? "unknown", {}, httpStatus);
}

/** Fill in lane/severity/retry defaults from the category, honoring overrides. */
function finalize(
  category: PaymentErrorCategory,
  overrides: Partial<PaymentErrorClassification>,
  httpStatus?: number | null,
): PaymentErrorClassification {
  const ownerLane =
    overrides.ownerLane ?? (ADMIN_LANE_CATEGORIES.has(category) ? "admin" : "dev");

  const isRetryable = overrides.isRetryable ?? RETRYABLE_CATEGORIES.has(category);

  // Critical when the developer must intervene (api/network/state/db/idempotency
  // or a 5xx); otherwise an admin-actionable card problem is a warning.
  const severity: PaymentErrorSeverity =
    overrides.severity ??
    (ownerLane === "dev" || (httpStatus != null && httpStatus >= 500)
      ? "critical"
      : "warning");

  return { category, ownerLane, severity, isRetryable };
}
