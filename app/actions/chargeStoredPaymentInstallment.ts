"use server";

import { createClient } from "@/utils/supabase/server";
import { createEpgTransaction } from "@/utils/payment/epg";

/**
 * Charges a single order_payment_installments row using the stored payment
 * method on the parent registration batch.
 *
 * Admin-only — used for manual retries from the payments dashboard.
 * The process-overdue-payments edge function handles automatic charging;
 * this action covers edge cases that require human review.
 *
 * Ref: docs/elavon/api_transactions.md
 *
 * IMPORTANT: EPG returns HTTP 201 even for declined transactions.
 * This function checks txn.isAuthorized — never relies on HTTP status alone.
 */

export interface ChargeInstallmentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export async function chargeStoredPaymentInstallment(
  installmentId: string,
): Promise<ChargeInstallmentResult> {
  try {
    const supabase = await createClient();

    // 1. Auth — super_admin only (matches markInstallmentPaid pattern)
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
      return { success: false, error: "Insufficient permissions." };
    }

    // 2. Fetch installment with batch → stored method → shopper
    const { data: installment, error: fetchErr } = await supabase
      .from("order_payment_installments")
      .select(
        `id, installment_number, amount_due, status, charge_attempt_count,
         registration_orders!inner(
           id, parent_id,
           stored_payment_method_id,
           stored_payment_methods(
             id, epg_stored_href, type,
             shoppers(epg_shopper_href)
           )
         )`,
      )
      .eq("id", installmentId)
      .single();

    if (fetchErr || !installment) {
      return { success: false, error: "Installment not found." };
    }

    // 3. Guard checks
    if (installment.status === "paid" || installment.status === "waived") {
      return { success: false, error: "Installment already paid or waived." };
    }

    const batch = Array.isArray(installment.registration_orders)
      ? installment.registration_orders[0]
      : installment.registration_orders;

    const storedMethod = Array.isArray((batch as any)?.stored_payment_methods)
      ? (batch as any).stored_payment_methods[0]
      : (batch as any)?.stored_payment_methods;

    if (!storedMethod) {
      return { success: false, error: "No stored payment method on file for this batch." };
    }

    const shopper = Array.isArray(storedMethod.shoppers)
      ? storedMethod.shoppers[0]
      : storedMethod.shoppers;

    if (!shopper?.epg_shopper_href) {
      return { success: false, error: "Shopper record missing — cannot charge." };
    }

    // 4. Charge via EPG server-to-server
    // customReference = installmentId for idempotency (safe to retry)
    const txn = await createEpgTransaction({
      storedCardHref: storedMethod.type === "card" ? storedMethod.epg_stored_href : undefined,
      storedAchPaymentHref: storedMethod.type === "ach" ? storedMethod.epg_stored_href : undefined,
      shopperHref: shopper.epg_shopper_href,
      amountDollars: Number(installment.amount_due),
      currencyCode: "USD",
      customReference: installmentId,
      description: `AYDT Installment ${installment.installment_number}`,
    });

    // 5. Success
    if (txn.isAuthorized) {
      await supabase
        .from("order_payment_installments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          paid_amount: Number(installment.amount_due),
          payment_reference_id: txn.id,
          transaction_id: txn.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", installmentId);

      return { success: true, transactionId: txn.id };
    }

    // 6. Decline — increment attempt count, cap at failed after 3
    const newCount = (installment.charge_attempt_count ?? 0) + 1;
    await supabase
      .from("order_payment_installments")
      .update({
        charge_attempt_count: newCount,
        last_charge_error: txn.state,
        status: newCount >= 3 ? "failed" : installment.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", installmentId);

    return {
      success: false,
      error: `Charge declined (${txn.state}). Attempt ${newCount} of 3.`,
    };
  } catch (err) {
    console.error("[chargeStoredPaymentInstallment] unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error during charge.",
    };
  }
}
