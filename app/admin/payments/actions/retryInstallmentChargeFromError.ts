"use server";

import { createClient } from "@/utils/supabase/server";
import { chargeStoredPaymentInstallment } from "@/app/actions/chargeStoredPaymentInstallment";
import { logPaymentError } from "@/utils/payment/logPaymentError";

/**
 * Retry the charge behind a payment_error_logs row.
 *
 * Reruns the SAME idempotent stored-card path as the cron
 * (chargeStoredPaymentInstallment → createEpgTransaction, customReference =
 * installmentId) — see docs/PAYMENT_ERROR_LOGGING_PLAN.md §5. We do not fork a
 * parallel charge path.
 *
 *   success → auto-resolve the originating error (the charge went through).
 *   failure → write a NEW attempt row chained via retry_of, and mark the
 *             original 'actioned'. The original is never mutated into a lie.
 *
 * Super-admin only (mirrors chargeStoredPaymentInstallment). Manual retry is
 * always available, even past the cron's 3-attempt auto cap.
 */
export async function retryInstallmentChargeFromError(
  errorLogId: string,
): Promise<{ success: boolean; error?: string; transactionId?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userRecord?.role !== "super_admin") {
    return { success: false, error: "Retry requires super-admin." };
  }

  const { data: log } = await supabase
    .from("payment_error_logs")
    .select("id, installment_id, installment_number, order_id, retry_count")
    .eq("id", errorLogId)
    .single();

  if (!log?.installment_id) {
    return { success: false, error: "This error has no installment to retry." };
  }

  const result = await chargeStoredPaymentInstallment(log.installment_id);

  if (result.success) {
    await supabase
      .from("payment_error_logs")
      .update({
        status: "resolved",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: `Resolved via manual retry — txn ${result.transactionId ?? "n/a"}.`,
      })
      .eq("id", errorLogId);
    return { success: true, transactionId: result.transactionId };
  }

  // Failed retry → new attempt row chained to this one (history layer, plan §5).
  await logPaymentError({
    origin: "gateway",
    source: "manual_admin",
    installmentId: log.installment_id,
    installmentNumber: log.installment_number,
    orderId: log.order_id,
    errorMessage: result.error ?? "Retry failed.",
    retryOf: errorLogId,
    retryCount: (log.retry_count ?? 0) + 1,
  });

  await supabase
    .from("payment_error_logs")
    .update({ status: "actioned" })
    .eq("id", errorLogId);

  return { success: false, error: result.error ?? "Retry failed." };
}
