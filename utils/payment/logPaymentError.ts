/**
 * logPaymentError — the SINGLE writer for payment_error_logs.
 * See docs/PAYMENT_ERROR_LOGGING_PLAN.md §4.
 *
 * Every capture point (recurring cron, EPG webhook, manual admin charge, HPP,
 * and application-internal detectors) records failures through this one helper so
 * classification and row shape stay consistent. Runs via the service-role client
 * (trusted server/edge contexts only — bypasses RLS, see the table's
 * payment_error_logs_service_role policy).
 *
 * ⚠️ This helper NEVER throws. Logging an error must not itself break the payment
 * flow that is already failing — on any insert problem it console.errors and
 * returns null.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import {
  classifyPaymentError,
  type ClassifyPaymentErrorInput,
} from "@/utils/payment/classifyPaymentError";
import { notifyPaymentError } from "@/utils/payment/notifyPaymentError";
import type {
  PaymentErrorCategory,
  PaymentErrorOrigin,
  PaymentErrorOwnerLane,
  PaymentErrorSeverity,
  PaymentErrorSource,
} from "@/types";

export interface LogPaymentErrorInput {
  origin: PaymentErrorOrigin;
  source: PaymentErrorSource;

  // Linkage (all optional) --------------------------------------------------
  orderId?: string | null;
  installmentId?: string | null;
  installmentNumber?: number | null;
  familyId?: string | null;
  dancerId?: string | null;

  // Gateway identifiers -----------------------------------------------------
  transactionId?: string | null;
  paymentSessionId?: string | null;

  // Raw detail --------------------------------------------------------------
  errorCode?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  rawPayload?: unknown;

  // Retry chain (plan §5) ---------------------------------------------------
  retryOf?: string | null;
  retryCount?: number;

  // Classification --------------------------------------------------------
  /** Hint/override category (esp. for application-origin errors). */
  category?: PaymentErrorCategory | null;
  /** Override the classifier's lane/severity/retryable verdicts if the caller knows better. */
  ownerLane?: PaymentErrorOwnerLane;
  severity?: PaymentErrorSeverity;
  isRetryable?: boolean;
}

/**
 * Insert one error-log row. Returns the new row id, or null if the write failed
 * (logging is best-effort and must never disrupt the caller).
 */
export async function logPaymentError(
  input: LogPaymentErrorInput,
): Promise<string | null> {
  try {
    const classifyInput: ClassifyPaymentErrorInput = {
      origin: input.origin,
      source: input.source,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      httpStatus: input.httpStatus,
      category: input.category,
    };
    const c = classifyPaymentError(classifyInput);

    const row = {
      origin: input.origin,
      source: input.source,
      category: input.category ?? c.category,
      owner_lane: input.ownerLane ?? c.ownerLane,
      severity: input.severity ?? c.severity,

      order_id: input.orderId ?? null,
      installment_id: input.installmentId ?? null,
      installment_number: input.installmentNumber ?? null,
      family_id: input.familyId ?? null,
      dancer_id: input.dancerId ?? null,

      transaction_id: input.transactionId ?? null,
      payment_session_id: input.paymentSessionId ?? null,

      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      http_status: input.httpStatus ?? null,
      raw_payload: serializePayload(input.rawPayload),

      retry_of: input.retryOf ?? null,
      retry_count: input.retryCount ?? 0,
      is_retryable: input.isRetryable ?? c.isRetryable,

      status: "new" as const,
    };

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("payment_error_logs")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("[logPaymentError] insert failed:", error.message, {
        source: row.source,
        category: row.category,
      });
      return null;
    }

    // Phase 7: fire automatic notifications (critical dev-lane + threshold
    // escalation), throttled inside notifyPaymentError. Best-effort.
    if (data?.id) {
      await notifyPaymentError(supabase, { ...row, id: data.id });
    }

    return data?.id ?? null;
  } catch (err) {
    console.error("[logPaymentError] unexpected failure:", err);
    return null;
  }
}

/** Coerce arbitrary payloads into something jsonb-safe; never throw. */
function serializePayload(payload: unknown): unknown {
  if (payload == null) return null;
  if (payload instanceof Error) {
    return { name: payload.name, message: payload.message, stack: payload.stack };
  }
  try {
    // Round-trip to strip non-serializable values (functions, circular refs).
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { unserializable: String(payload) };
  }
}
