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
  /**
   * "BATCH_STALE" when the batch is no longer payable (failed/cancelled) and the
   * client should mint a fresh batchId and retry. Distinct from a confirmed
   * batch ("already paid"), which is NOT recoverable by retrying.
   */
  code?: "BATCH_STALE";
}

export async function createEPGPaymentSession(
  input: CreateEPGPaymentSessionInput,
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
    .select("id, status, payment_plan_type, amount_due_now, grand_total")
    .eq("id", batchId)
    .single();

  console.log(
    `[createEPGPaymentSession] ⚠️ TEMP - batchId=${batchId} status=${batch?.status ?? "(missing)"} paymentPlan=${batch?.payment_plan_type ?? "(missing)"} amountDueNow=${batch?.amount_due_now ?? "(missing)"} grandTotal=${batch?.grand_total ?? "(missing)"} errPresent=${!!batchErr}`,
  ); // TODO: DELETE
  if (batchErr || !batch) return { error: "Registration batch not found" };
  if (batch.status === "confirmed")
    return { error: "This registration has already been paid" };
  if (batch.status !== "pending")
    // Stale (failed/cancelled/expired) — recoverable: client mints a fresh
    // batchId and retries. Distinct from "confirmed" above, which is final.
    return {
      error: "This registration session expired. Restarting checkout…",
      code: "BATCH_STALE",
    };

  // Server-side amount validation — never trust client-provided amount
  const serverAmount = batch.amount_due_now ?? batch.grand_total ?? 0;
  if (Math.abs(serverAmount - amountDueNow) > 0.01) {
    console.error("[EPG] Amount mismatch:", { client: amountDueNow, server: serverAmount, batchId });
    return { error: "Payment amount does not match. Please refresh and try again." };
  }

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
          `${process.env.EPG_BASE_URL}/payment-sessions/${existing.payment_session_id}`,
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
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const siteUrl = process.env.SITE_URL ?? `${proto}://${host}`;

  const returnUrl = `${siteUrl}/register/confirmation?semester=${semesterId}&batch=${batchId}`;
  const cancelUrl = `${siteUrl}/register/payment?semester=${semesterId}&payment_cancelled=1`;

  // 5. Create EPG Order
  let order;
  try {
    order = await createEpgOrder({
      amountDollars: serverAmount,
      currencyCode: "USD",
      description: `${semesterName} Registration`,
      customReference: batchId,
    });
  } catch (err) {
    console.error("[EPG] createEpgOrder failed:", err);
    return { error: "Failed to create payment order. Please try again." };
  }

  // 6. Create EPG PaymentSession
  // doCapture: false for installment plans so EPG returns a hostedCard token
  // in the session result, enabling card storage for future installments.
  // Ref: docs/elavon/api_stored_cards.md § "How to Get a Hosted Card Token"
  const isInstallmentPlan = batch.payment_plan_type === "installments";
  let session;
  try {
    session = await epgCreateSession({
      orderHref: order.href,
      returnUrl,
      cancelUrl,
      customReference: batchId,
      doThreeDSecure: true,
      doCapture: !isInstallmentPlan,
    });
  } catch (err) {
    console.error("[EPG] createEpgPaymentSession failed:", {
      batchId,
      amountDueNow,
      semesterName,
      error: err,
    });
    if (err instanceof Error) {
      console.error(err.message);
      console.error(err.stack);
    }
    return { error: "Failed to create payment session. Please try again." };
  }

  // 7. Persist payment record (upsert in case we retried after an expired session)
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
    // Payment record persistence failed but EPG session was created.
    // Still redirect the user — the webhook will re-create the record if needed.
    console.error("[EPG] payments upsert failed:", upsertErr);
  }

  return { paymentSessionUrl: session.url };
}
