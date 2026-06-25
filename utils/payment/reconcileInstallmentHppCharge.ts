import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Meeting-plan #47 Part B — reconcile a NEW-CARD HPP charge of a single
 * installment back to its order_payment_installments row.
 *
 * A "Pay Now (new card)" action creates a one-off EPG Order + hosted Payment
 * Session whose customReference is `installment-retry-{installmentId}`. There is
 * deliberately NO payments row for these (payments.registration_batch_id is
 * UNIQUE per order, so the original checkout already owns the order's payments
 * row). Reconciliation therefore happens here, keyed off the transaction.
 *
 * Idempotent: only flips a not-yet-paid installment, and the `.neq("status",
 * "paid")` guard makes concurrent return-page + webhook calls safe. The field
 * set mirrors the stored-card path (chargeStoredPaymentInstallment) so a
 * row paid via HPP looks identical to one paid via the saved card.
 *
 * Pass the appropriate client: the webhook uses the service-role client, the
 * admin return page uses the cookie-scoped server client (super-admin RLS).
 */
export async function reconcileInstallmentHppCharge(
  supabase: SupabaseClient,
  installmentId: string,
  txn: { id: string; isAuthorized: boolean; state: string },
  opts?: { resolvedBy?: string | null; via?: string },
): Promise<{ marked: boolean; alreadyPaid: boolean }> {
  // Only an authorized transaction marks the installment paid. Declines are
  // logged by the caller (webhook step 8b / the action), not here.
  if (!txn.isAuthorized) {
    return { marked: false, alreadyPaid: false };
  }

  const { data: inst } = await supabase
    .from("order_payment_installments")
    .select("amount_due, status")
    .eq("id", installmentId)
    .single();

  if (!inst) return { marked: false, alreadyPaid: false };
  if (inst.status === "paid") return { marked: false, alreadyPaid: true };

  const nowIso = new Date().toISOString();
  const { data: updated } = await supabase
    .from("order_payment_installments")
    .update({
      status: "paid",
      paid_at: nowIso,
      paid_amount: Number(inst.amount_due),
      payment_reference_id: txn.id,
      transaction_id: txn.id,
      updated_at: nowIso,
    })
    .eq("id", installmentId)
    .neq("status", "paid")
    .select("id");

  // Lost the race to the other path (webhook vs. return page) — already paid.
  if (!updated || updated.length === 0) {
    return { marked: false, alreadyPaid: true };
  }

  // Charge cleared — resolve any open error-log row for this installment so the
  // Error Log reflects reality (mirrors retryInstallmentChargeFromError).
  await supabase
    .from("payment_error_logs")
    .update({
      status: "resolved",
      resolved_by: opts?.resolvedBy ?? null,
      resolved_at: nowIso,
      resolution_notes: `Resolved via ${opts?.via ?? "new-card charge"} — txn ${txn.id}.`,
    })
    .eq("installment_id", installmentId)
    .in("status", ["new", "acknowledged", "actioned"]);

  return { marked: true, alreadyPaid: false };
}
