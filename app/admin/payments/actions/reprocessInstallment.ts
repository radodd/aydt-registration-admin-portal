"use server";

import { createClient } from "@/utils/supabase/server";
import { chargeStoredPaymentInstallment } from "@/app/actions/chargeStoredPaymentInstallment";

/**
 * Meeting-plan #47 — "Reprocess" a failed/overdue installment from the
 * payments dashboard row using the family's SAVED encrypted card.
 *
 * This is the stored-card path. It does NOT fork a new charge: it reuses the
 * exact idempotent MIT (merchant-initiated) path the cron and the error-log
 * retry already use — chargeStoredPaymentInstallment → createEpgTransaction
 * with customReference = installmentId, and credentialOnFileType:"recurring" +
 * shopperInteraction:"merchantInitiated" hardcoded inside createEpgTransaction
 * (required on our 3DS-enforced account — see project_epg_mit_3ds_unblock).
 *
 * New-card charges (expired card, different card) are a separate path and go
 * through an HPP redirect — see createInstallmentHppSession (#47 Part B).
 *
 * Super-admin only (chargeStoredPaymentInstallment re-checks the same gate).
 *
 * On success we also auto-resolve any still-open payment_error_logs row tied
 * to this installment, so a charge driven from the payment row clears the
 * matching Error Log entry — mirrors retryInstallmentChargeFromError's resolve
 * shape, but keyed on installment_id instead of an error-log id.
 */
export async function reprocessInstallment(
  installmentId: string,
): Promise<{ success: boolean; error?: string; transactionId?: string }> {
  const result = await chargeStoredPaymentInstallment(installmentId);

  if (!result.success) {
    return result;
  }

  // Charge went through — resolve any open error-log row for this installment
  // so the Error Log reflects reality. Best-effort: a failure here must not
  // turn a successful charge into a reported failure.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase
      .from("payment_error_logs")
      .update({
        status: "resolved",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: `Resolved via Reprocess from payments dashboard — txn ${result.transactionId ?? "n/a"}.`,
      })
      .eq("installment_id", installmentId)
      .in("status", ["new", "acknowledged", "actioned"]);
  }

  return result;
}
