"use server";

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
 * Resolve-on-success (#48) lives inside chargeStoredPaymentInstallment itself —
 * any open payment_error_logs row for this installment is cleared there on a
 * successful charge, so this wrapper is now a thin, intent-named entry point
 * for the dashboard button.
 */
export async function reprocessInstallment(
  installmentId: string,
): Promise<{ success: boolean; error?: string; transactionId?: string }> {
  return chargeStoredPaymentInstallment(installmentId);
}
