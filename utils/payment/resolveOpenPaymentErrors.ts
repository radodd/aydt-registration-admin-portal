import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Meeting-plan #48 — resolve-on-success.
 *
 * When a balance is later collected, flip any still-open payment_error_logs
 * rows for that order/installment to 'resolved'. This is the second half of
 * the "action-required only" Error Log: a failure that gets cleared by a
 * subsequent successful charge should drop out of the actionable view (which
 * defaults to status='new') while remaining in history as a resolved row.
 *
 * "Open" = status in (new, acknowledged, actioned). Already-resolved /
 * won't-fix rows are left untouched. Filter by the most specific key available
 * (installment_id), else order_id — both columns are indexed.
 *
 * Best-effort and NEVER throws: a failure here must not turn a successful
 * charge into a reported failure (mirrors logPaymentError's contract). Pass the
 * service-role client from server/edge contexts (confirmBatch, webhook) or the
 * cookie-scoped super-admin client from actions — either satisfies RLS.
 *
 * Consolidates the resolve blocks previously inlined in
 * reconcileInstallmentHppCharge / reprocessInstallment (#47).
 */
export async function resolveOpenPaymentErrors(
  supabase: SupabaseClient,
  scope: { orderId?: string | null; installmentId?: string | null },
  opts?: { resolvedBy?: string | null; via?: string; transactionId?: string | null },
): Promise<void> {
  if (!scope.installmentId && !scope.orderId) return;

  let query = supabase
    .from("payment_error_logs")
    .update({
      status: "resolved",
      resolved_by: opts?.resolvedBy ?? null,
      resolved_at: new Date().toISOString(),
      resolution_notes:
        `Resolved on payment success via ${opts?.via ?? "charge"}` +
        (opts?.transactionId ? ` — txn ${opts.transactionId}.` : "."),
    })
    .in("status", ["new", "acknowledged", "actioned"]);

  // Most specific key wins; an installment row also carries order_id, so we
  // don't double-filter — installment scope is the tighter set.
  if (scope.installmentId) {
    query = query.eq("installment_id", scope.installmentId);
  } else if (scope.orderId) {
    query = query.eq("order_id", scope.orderId);
  }

  try {
    await query;
  } catch (err) {
    console.error("[resolveOpenPaymentErrors] failed:", err);
  }
}
