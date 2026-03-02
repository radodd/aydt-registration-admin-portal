"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  createEpgOrder,
  createEpgPaymentSession as epgCreateSession,
  fetchEpgPaymentSession,
} from "@/utils/payment/epg";

export interface CreateEPGPaymentSessionInput {
  batchId: string;
  amountDueNow: number;
  semesterId: string;
  semesterName: string;
}

export interface CreateEPGPaymentSessionResult {
  paymentSessionUrl?: string;
  error?: string;
}

export async function createEPGPaymentSession(
  input: CreateEPGPaymentSessionInput
): Promise<CreateEPGPaymentSessionResult> {
  const { batchId, amountDueNow, semesterId, semesterName } = input;

  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // 2. Verify batch exists and is still awaiting payment
  const { data: batch, error: batchErr } = await supabase
    .from("registration_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (batchErr || !batch) return { error: "Registration batch not found" };
  if (batch.status === "confirmed")
    return { error: "This registration has already been paid" };
  if (batch.status !== "pending_payment")
    return { error: "Registration batch is not in a payable state" };

  // 3. Idempotency check — return existing session if already initiated
  const { data: existing } = await supabase
    .from("payments")
    .select("payment_session_id, state")
    .eq("custom_reference", batchId)
    .maybeSingle();

  if (existing) {
    if (["authorized", "captured", "settled"].includes(existing.state)) {
      return { error: "Payment already completed for this registration" };
    }
    if (
      existing.state === "pending_authorization" &&
      existing.payment_session_id
    ) {
      // Re-fetch the existing session URL rather than creating a new EPG Order
      try {
        const session = await fetchEpgPaymentSession(
          `${process.env.EPG_BASE_URL}/payment-sessions/${existing.payment_session_id}`
        );
        if (session.url) return { paymentSessionUrl: session.url };
      } catch {
        // Session may have expired — fall through to create a new one
      }
    }
  }

  // 4. Construct callback URLs
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const proto =
    process.env.NODE_ENV === "production" ? "https" : "http";
  const siteUrl = process.env.SITE_URL ?? `${proto}://${host}`;

  const returnUrl = `${siteUrl}/register/confirmation?semester=${semesterId}&batch=${batchId}`;
  const cancelUrl = `${siteUrl}/register/payment?semester=${semesterId}&payment_cancelled=1`;

  // 5. Create EPG Order
  let order;
  try {
    order = await createEpgOrder({
      amountDollars: amountDueNow,
      currencyCode: "USD",
      description: `${semesterName} Registration`,
      customReference: batchId,
    });
  } catch (err) {
    console.error("[EPG] createEpgOrder failed:", err);
    return { error: "Failed to create payment order. Please try again." };
  }

  // 6. Create EPG PaymentSession
  let session;
  try {
    session = await epgCreateSession({
      orderHref: order.href,
      returnUrl,
      cancelUrl,
      customReference: batchId,
      doThreeDSecure: true,
    });
  } catch (err) {
    console.error("[EPG] createEpgPaymentSession failed:", err);
    return { error: "Failed to create payment session. Please try again." };
  }

  // 7. Persist payment record (upsert in case we retried after an expired session)
  const { error: upsertErr } = await supabase.from("payments").upsert(
    {
      registration_batch_id: batchId,
      order_id: order.id,
      payment_session_id: session.id,
      custom_reference: batchId,
      amount: amountDueNow,
      currency: "USD",
      state: "pending_authorization",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "custom_reference" }
  );

  if (upsertErr) {
    // Payment record persistence failed but EPG session was created.
    // Still redirect the user — the webhook will re-create the record if needed.
    console.error("[EPG] payments upsert failed:", upsertErr);
  }

  return { paymentSessionUrl: session.url };
}
