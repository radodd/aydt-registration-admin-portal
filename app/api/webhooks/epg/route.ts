import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchEpgTransaction,
  epgEventTypeToPaymentState,
} from "@/utils/payment/epg";
import {
  confirmBatch,
  ensureStoredCardAndChargeInstallment1,
} from "@/utils/payment/installmentConfirmation";

// Node runtime required — never edge for payment webhooks.
// Edge runtimes lack crypto.timingSafeEqual and may strip env vars.
export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/webhooks/epg
 *
 * EPG asynchronous notification handler.
 *
 * EPG sends a POST with HTTP Basic auth (credentials configured in merchant portal)
 * whenever a transaction event occurs. The payload contains only metadata —
 * we NEVER trust it directly. Instead, we GET the transaction resource from EPG
 * using our secret key to obtain the authoritative state.
 *
 * Always returns 201. EPG retries on non-2xx, but we handle idempotency
 * internally so retries are safe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // Step 1: Validate HTTP Basic auth (constant-time to prevent timing oracle)
  // -------------------------------------------------------------------------
  const authHeader = request.headers.get("authorization") ?? "";
  const expectedRaw = `${process.env.EPG_WEBHOOK_USERNAME}:${process.env.EPG_WEBHOOK_PASSWORD}`;
  const expected = "Basic " + Buffer.from(expectedRaw).toString("base64");

  console.log("[EPG WEBHOOK] received");
  console.log("[EPG WEBHOOK] ⚠️ TEMP - DELETE ME - auth header received:", request.headers.get("authorization")); // TODO: DELETE before production

  let authValid = false;
  try {
    const expectedBuf = Buffer.from(expected);
    // Pad to same length before comparing to avoid length-based timing leak
    const actualBuf = Buffer.from(
      authHeader.padEnd(expected.length, "\0").slice(0, expected.length),
    );
    authValid =
      expectedBuf.length === Buffer.from(authHeader).length &&
      crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    authValid = false;
  }

  if (!authValid) {
    console.warn("[epg-webhook] Invalid Basic auth credentials");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Step 2: Parse notification body
  // -------------------------------------------------------------------------
  let notification: {
    id?: string;
    eventType?: string;
    resourceType?: string;
    resource?: string;
    customReference?: string;
    createdAt?: string;
  };

  try {
    notification = await request.json();
  } catch {
    console.error("[epg-webhook] Failed to parse notification JSON");
    return NextResponse.json({ ok: true }, { status: 200 }); // 200 ack — malformed, don't trigger EPG retry
  }

  const { eventType, resourceType, resource } = notification;

  console.log(
    `[epg-webhook] notification id=${notification.id} eventType=${eventType} resourceType=${resourceType}`,
  );
  console.log("[epg-webhook] ⚠️ TEMP full notification body:", JSON.stringify(notification)); // TODO: DELETE

  // -------------------------------------------------------------------------
  // Step 3: Ignore non-transaction or non-sale events
  // -------------------------------------------------------------------------
  const trackedEvents = [
    "saleAuthorized",
    "saleDeclined",
    "saleHeldForReview",
    "saleCaptured",
    "saleSettled",
    "voidAuthorized",
    "refundAuthorized",
  ];

  if (
    resourceType !== "transaction" ||
    !eventType ||
    !trackedEvents.includes(eventType)
  ) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!resource) {
    console.error("[epg-webhook] Notification missing resource URL");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // -------------------------------------------------------------------------
  // Step 4: Fetch full transaction from EPG — never trust the notification body
  // -------------------------------------------------------------------------
  let transaction;
  try {
    transaction = await fetchEpgTransaction(resource);
  } catch (err) {
    // EPG API down or credential issue — return 500 so EPG retries
    console.error("[epg-webhook] Failed to fetch transaction from EPG:", err);
    return NextResponse.json(
      { error: "Failed to fetch transaction" },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  console.log("[epg-webhook] ⚠️ TEMP full transaction object:", JSON.stringify(transaction)); // TODO: DELETE
  // Step 5: Resolve batchId from transaction.customReference
  // EPG does not propagate customReference to the transaction object in UAT —
  // it appears on transaction.orderReference instead. Fall back through all
  // known locations before giving up.
  // -------------------------------------------------------------------------
  const batchId = transaction.customReference ?? transaction.orderReference ?? notification.customReference;
  if (!batchId) {
    console.warn("[epg-webhook] Transaction has no customReference — ignoring");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // -------------------------------------------------------------------------
  // Step 6: Look up our payment record (idempotency guard)
  // -------------------------------------------------------------------------
  const { data: payment } = await supabase
    .from("payments")
    .select("id, state, registration_batch_id, payment_session_id")
    .eq("custom_reference", batchId)
    .maybeSingle();

  if (!payment) {
    console.warn(
      `[epg-webhook] No payment record for customReference=${batchId} — ignoring`,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // -------------------------------------------------------------------------
  // Step 7: Map EPG event type to our internal state
  // -------------------------------------------------------------------------
  const newState = epgEventTypeToPaymentState(eventType);
  if (!newState) {
    console.warn(
      `[epg-webhook] Unrecognised eventType=${eventType} — skipping state update`,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // -------------------------------------------------------------------------
  // Step 7b: Replay / ordering guard.
  //
  // EPG delivers saleAuthorized → saleCaptured → saleSettled as separate
  // notifications, often out of order and with retries. We must advance
  // payments.state forward through the lifecycle while ignoring exact replays
  // and stale (backward) events, and never move off a final state.
  // confirmBatch has its own idempotency guard (status='pending'), so
  // enrollments + email still fire exactly once no matter how many confirming
  // events arrive — only payments.state advances here.
  // -------------------------------------------------------------------------
  const FINAL_STATES = ["declined", "voided", "refunded"];
  // Forward-progression ranks. States not listed (e.g. held_for_review, and
  // the final states) are rank -1 and never participate in the backward check.
  const STATE_RANK: Record<string, number> = {
    initiated: 0,
    pending_authorization: 1,
    authorized: 2,
    captured: 3,
    settled: 4,
  };

  if (FINAL_STATES.includes(payment.state)) {
    console.log(
      `[epg-webhook] Payment for batch ${batchId} already in final state ${payment.state} — skipping`,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (payment.state === newState) {
    console.log(
      `[epg-webhook] Payment for batch ${batchId} already in state ${newState} — skipping replay`,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Ignore backward progression (e.g. a stale saleAuthorized after settled).
  // Only applies when BOTH states are ranked progression states; transitions
  // to declined/voided/refunded (rank -1) always pass through.
  const currentRank = STATE_RANK[payment.state] ?? -1;
  const newRank = STATE_RANK[newState] ?? -1;
  if (currentRank >= 0 && newRank >= 0 && newRank < currentRank) {
    console.log(
      `[epg-webhook] Payment for batch ${batchId} ignoring backward transition ${payment.state} → ${newState}`,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // -------------------------------------------------------------------------
  // Step 8: Update payments table
  // -------------------------------------------------------------------------
  await supabase
    .from("payments")
    .update({
      transaction_id: transaction.id,
      state: newState,
      event_type: eventType,
      raw_notification: notification,
      raw_transaction: transaction,
      updated_at: new Date().toISOString(),
    })
    .eq("custom_reference", batchId);

  // -------------------------------------------------------------------------
  // Step 9: If authorized/captured/settled — confirm the registration
  // -------------------------------------------------------------------------
  const confirmingStates = ["authorized", "captured", "settled"];
  if (confirmingStates.includes(newState)) {
    // 9a. Fetch batch (needed for payment_plan_type routing)
    const { data: batchCheck } = await supabase
      .from("registration_orders")
      .select("id, status, payment_plan_type, stored_payment_method_id")
      .eq("id", batchId)
      .maybeSingle();

    if (!batchCheck || batchCheck.status !== "pending") {
      // Already confirmed (duplicate webhook) — safe to return
      console.log(
        `[epg-webhook] Batch ${batchId} already confirmed — skipping`,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (batchCheck.payment_plan_type === "installments") {
      // Installment path: store card first, then capture installment 1, then
      // confirm. The helper handles confirmation internally and is idempotent —
      // the returnUrl handoff and the reconciliation cron call the same logic.
      // With doCreateTransaction:false (tokenize-only) sessions this webhook
      // branch is a BACKUP trigger; it only fires if EPG emits a transaction
      // event for the session. The returnUrl handoff is the primary path.
      await ensureStoredCardAndChargeInstallment1({
        batchId,
        paymentSessionId: payment.payment_session_id,
      });
    } else {
      // Full-pay path: confirm immediately.
      await confirmBatch({ transaction, batchId, transactionId: transaction.id });
    }

    console.log(
      `[epg-webhook] Batch ${batchId} processed (eventType=${eventType} txnId=${transaction.id})`,
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

