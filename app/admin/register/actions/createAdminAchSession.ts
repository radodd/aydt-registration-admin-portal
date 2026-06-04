"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  createEpgOrder,
  createEpgPaymentSession,
  fetchEpgPaymentSession,
} from "@/utils/payment/epg";

export interface CreateAdminAchSessionInput {
  /** A PENDING registration_orders row with payment_plan_type = 'pay_in_full'. */
  batchId: string;
  /** Full order total — charged via ACH on the hosted bank-entry page. */
  amount: number;
  semesterId: string;
  semesterName: string;
  /** Used only to build the admin return URL (link to the dancer afterward). */
  dancerId?: string | null;
}

export interface CreateAdminAchSessionResult {
  paymentSessionUrl?: string;
  error?: string;
}

/**
 * Meeting-plan #18 — admin one-time ACH debit. Mints a hosted payment session
 * configured for ACH so the family's bank account can be entered on Elavon's
 * page and debited for the full order total in a single sale. Mirrors
 * createAdminInstallmentSession, differing only by:
 *   - the session runs the sale inline (doCreateTransaction:true, doCapture:true)
 *     rather than tokenizing — a one-time debit stores nothing
 *   - no 3-D Secure (ACH is bank-account, not card)
 *   - enableAch flags the session to present the bank-account form
 *   - the batch must be pay_in_full (not installments)
 *
 * The EPG webhook's pay-in-full branch (confirmBatch) flips the PENDING order +
 * enrollments to confirmed and marks installment 1 paid once the debit captures.
 *
 * ⚠️ NOT LIVE until Elavon confirms the ACH-enable session field — see
 * createEpgPaymentSession's `enableAch` docs. Until then the hosted page renders
 * the card form, so this path should not be exposed to non-test admins in prod.
 */
export async function createAdminAchSession(
  input: CreateAdminAchSessionInput,
): Promise<CreateAdminAchSessionResult> {
  const { batchId, amount, semesterId, semesterName, dancerId } = input;
  const supabase = await createClient();

  // 1. Auth + admin gate (ACH is a payment method available to any admin, not a
  //    super-admin-only power like installment setup).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: adminUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (adminUser as { role?: string } | null)?.role;
  if (!role || !["admin", "super_admin"].includes(role)) {
    return { error: "Admin access required." };
  }

  // 2. Verify the batch is a pending pay-in-full order.
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
  if (batch.payment_plan_type === "installments")
    return { error: "This order is set up for installments, not a one-time ACH debit." };

  // Server-side amount validation — never trust the client-provided amount.
  const serverAmount = batch.amount_due_now ?? batch.grand_total ?? 0;
  if (Math.abs(serverAmount - amount) > 0.01) {
    console.error("[createAdminAchSession] Amount mismatch:", {
      client: amount,
      server: serverAmount,
      batchId,
    });
    return { error: "ACH amount does not match. Please start over." };
  }

  // 3. Idempotency — reuse an in-flight session for this batch if present.
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

  // 5. Create EPG Order for the full amount.
  let order;
  try {
    order = await createEpgOrder({
      amountDollars: serverAmount,
      currencyCode: "USD",
      description: `${semesterName} Registration (ACH)`,
      customReference: batchId,
    });
  } catch (err) {
    console.error("[createAdminAchSession] createEpgOrder failed:", err);
    return { error: "Failed to create payment order. Please try again." };
  }

  // 6. Create an ACH-enabled hosted session that runs the debit inline. ACH has
  //    no 3-D Secure. The webhook's pay-in-full branch confirms the batch.
  let session;
  try {
    session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl,
      cancelUrl,
      customReference: batchId,
      doThreeDSecure: false,
      doCreateTransaction: true,
      doCapture: true,
      enableAch: true,
    });
  } catch (err) {
    console.error("[createAdminAchSession] createEpgPaymentSession failed:", err);
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
    console.error("[createAdminAchSession] payments upsert failed:", upsertErr);
  }

  return { paymentSessionUrl: session.url };
}
