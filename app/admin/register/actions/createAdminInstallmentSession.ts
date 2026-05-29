"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  createEpgOrder,
  createEpgPaymentSession,
  fetchEpgPaymentSession,
} from "@/utils/payment/epg";

export interface CreateAdminInstallmentSessionInput {
  /** A PENDING registration_orders row with payment_plan_type = 'installments'. */
  batchId: string;
  /** Installment-1 amount — charged when the card is stored at the hosted page. */
  amountDueNow: number;
  semesterId: string;
  semesterName: string;
  /** Used only to build the admin return URL (link to the dancer afterward). */
  dancerId?: string | null;
}

export interface CreateAdminInstallmentSessionResult {
  paymentSessionUrl?: string;
  error?: string;
}

/**
 * Admin analogue of createEPGPaymentSession for meeting-plan #7. Mints a hosted
 * payment-page session (doCapture: false) so the family's card can be entered
 * on the spot and stored as a reusable token. The EXISTING EPG webhook
 * (storePaymentMethodAndCaptureInstallment) then stores the card, charges
 * installment 1, links stored_payment_method_id, and confirms the batch — and
 * the recurring cron auto-charges installments 2..N. No new EPG client code.
 *
 * Differs from the public createEPGPaymentSession only by:
 *   - super_admin gate (installment setup is a super-admin power)
 *   - admin return/cancel URLs (lands back in the admin surface, not /register)
 *
 * The order amount = installment-1 amount, validated against the batch's
 * amount_due_now (which createAdminRegistration set to the same value).
 */
export async function createAdminInstallmentSession(
  input: CreateAdminInstallmentSessionInput,
): Promise<CreateAdminInstallmentSessionResult> {
  const { batchId, amountDueNow, semesterId, semesterName, dancerId } = input;
  const supabase = await createClient();

  // 1. Auth + super_admin gate
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: adminUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((adminUser as { role?: string } | null)?.role !== "super_admin") {
    return { error: "Super-admin access required for installment setup." };
  }

  // 2. Verify the batch is a pending installment order
  const { data: batch, error: batchErr } = await supabase
    .from("registration_orders")
    .select("id, status, payment_plan_type, amount_due_now, grand_total")
    .eq("id", batchId)
    .single();

  if (batchErr || !batch) return { error: "Registration order not found." };
  if (batch.status === "confirmed")
    return { error: "This registration has already been completed." };
  if (batch.status !== "pending")
    return { error: "This registration session expired. Please start over." };
  if (batch.payment_plan_type !== "installments")
    return { error: "This order is not set up for installments." };

  // Server-side amount validation — never trust the client-provided amount.
  const serverAmount = batch.amount_due_now ?? batch.grand_total ?? 0;
  if (Math.abs(serverAmount - amountDueNow) > 0.01) {
    console.error("[createAdminInstallmentSession] Amount mismatch:", {
      client: amountDueNow,
      server: serverAmount,
      batchId,
    });
    return { error: "Installment amount does not match. Please start over." };
  }

  // 3. Idempotency — reuse an in-flight session for this batch if present
  const { data: existing } = await supabase
    .from("payments")
    .select("payment_session_id, state")
    .eq("custom_reference", batchId)
    .maybeSingle();

  if (existing) {
    if (["authorized", "captured", "settled"].includes(existing.state)) {
      return { error: "Payment already completed for this registration." };
    }
    if (existing.state === "pending_authorization" && existing.payment_session_id) {
      try {
        const session = await fetchEpgPaymentSession(
          `${process.env.EPG_BASE_URL}/payment-sessions/${existing.payment_session_id}`,
        );
        if (session.url) return { paymentSessionUrl: session.url };
      } catch {
        // Session expired — fall through and create a new one.
      }
    }
  }

  // 4. Admin callback URLs — land back in the admin surface, not the public flow.
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const siteUrl = process.env.SITE_URL ?? `${proto}://${host}`;
  const returnParams = new URLSearchParams({ batch: batchId, semester: semesterId });
  if (dancerId) returnParams.set("dancer", dancerId);
  const returnUrl = `${siteUrl}/admin/register/confirmation?${returnParams.toString()}`;
  const cancelUrl = `${siteUrl}/admin/register?semester=${semesterId}&payment_cancelled=1`;

  // 5. Create EPG Order for the installment-1 amount
  let order;
  try {
    order = await createEpgOrder({
      amountDollars: serverAmount,
      currencyCode: "USD",
      description: `${semesterName} Registration (installment plan)`,
      customReference: batchId,
    });
  } catch (err) {
    console.error("[createAdminInstallmentSession] createEpgOrder failed:", err);
    return { error: "Failed to create payment order. Please try again." };
  }

  // 6. Create the hosted session with doCapture: false so EPG returns a
  //    hostedCard token for storage (same contract the public installment flow
  //    and the webhook rely on). Ref: docs/elavon/api_stored_cards.md.
  let session;
  try {
    session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl,
      cancelUrl,
      customReference: batchId,
      doThreeDSecure: true,
      doCapture: false,
    });
  } catch (err) {
    console.error("[createAdminInstallmentSession] createEpgPaymentSession failed:", err);
    return { error: "Failed to create payment session. Please try again." };
  }

  // 7. Persist the payment record so the webhook can resolve the session.
  const { error: upsertErr } = await supabase.from("payments").upsert(
    {
      registration_batch_id: batchId,
      order_id: order.id,
      payment_session_id: session.id,
      custom_reference: batchId,
      amount: serverAmount,
      currency: "USD",
      state: "pending_authorization",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "custom_reference" },
  );
  if (upsertErr) {
    // Non-fatal: the webhook re-creates the record if needed. Still redirect.
    console.error("[createAdminInstallmentSession] payments upsert failed:", upsertErr);
  }

  return { paymentSessionUrl: session.url };
}
