import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  fetchEpgTransaction,
  fetchEpgPaymentSession,
  epgEventTypeToPaymentState,
  createEpgShopper,
  fetchEpgShopperByReference,
  createEpgStoredCard,
  createEpgStoredAchPayment,
  createEpgTransaction,
} from "@/utils/payment/epg";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";

// Node runtime required — never edge for payment webhooks.
// Edge runtimes lack crypto.timingSafeEqual and may strip env vars.
export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);

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
 * Always returns 200. EPG retries on non-2xx, but we handle idempotency
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
    return NextResponse.json({ ok: true }); // return 200 — malformed, don't retry
  }

  const { eventType, resourceType, resource } = notification;

  console.log(
    `[epg-webhook] notification id=${notification.id} eventType=${eventType} resourceType=${resourceType}`,
  );

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
    return NextResponse.json({ ok: true });
  }

  if (!resource) {
    console.error("[epg-webhook] Notification missing resource URL");
    return NextResponse.json({ ok: true });
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
  // Step 5: Resolve batchId from transaction.customReference
  // -------------------------------------------------------------------------
  const batchId = transaction.customReference;
  if (!batchId) {
    console.warn("[epg-webhook] Transaction has no customReference — ignoring");
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ ok: true });
  }

  // Skip if already in a terminal state (replay protection)
  const terminalStates = [
    "authorized",
    "captured",
    "settled",
    "declined",
    "voided",
    "refunded",
  ];
  if (terminalStates.includes(payment.state)) {
    console.log(
      `[epg-webhook] Payment for batch ${batchId} already in terminal state ${payment.state} — skipping`,
    );
    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // Step 7: Map EPG event type to our internal state
  // -------------------------------------------------------------------------
  const newState = epgEventTypeToPaymentState(eventType);
  if (!newState) {
    console.warn(
      `[epg-webhook] Unrecognised eventType=${eventType} — skipping state update`,
    );
    return NextResponse.json({ ok: true });
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
      .from("registration_batches")
      .select("id, status, payment_plan_type, stored_payment_method_id")
      .eq("id", batchId)
      .maybeSingle();

    if (!batchCheck || batchCheck.status !== "pending") {
      // Already confirmed (duplicate webhook) — safe to return
      console.log(
        `[epg-webhook] Batch ${batchId} already confirmed — skipping`,
      );
      return NextResponse.json({ ok: true });
    }

    if (batchCheck.payment_plan_type === "installments") {
      // Installment path: store card first, then capture installment 1,
      // then confirm. The helper handles confirmation internally.
      await storePaymentMethodAndCaptureInstallment({
        transaction,
        batchId,
        paymentSessionId: payment.payment_session_id,
        parentId: null, // fetched inside helper
      });
    } else {
      // Full-pay path: confirm immediately.
      await confirmBatch({ transaction, batchId, transactionId: transaction.id });
    }

    console.log(
      `[epg-webhook] Batch ${batchId} processed (eventType=${eventType} txnId=${transaction.id})`,
    );
  }

  return NextResponse.json({ ok: true });
}

/* -------------------------------------------------------------------------- */
/* confirmBatch — shared confirmation steps (9a–9d)                           */
/* -------------------------------------------------------------------------- */

async function confirmBatch(params: {
  transaction: { id: string; total: { amount: string; currencyCode: string } };
  batchId: string;
  /** The transaction ID to record on installment 1 (HPP txn for full-pay, S2S txn for installments). */
  transactionId: string;
}): Promise<void> {
  const { transaction, batchId, transactionId } = params;

  // 9a. Confirm batch (idempotency: only if still pending)
  const { data: batch } = await supabase
    .from("registration_batches")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      payment_reference_id: transactionId,
    })
    .eq("id", batchId)
    .eq("status", "pending")
    .select("id, semester_id, parent_id, grand_total, payment_plan_type")
    .maybeSingle();

  if (!batch) {
    console.log(`[epg-webhook] Batch ${batchId} already confirmed — skipping`);
    return;
  }

  // 9b. Mark installment 1 as paid
  await supabase
    .from("batch_payment_installments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount: parseFloat(transaction.total.amount) || null,
      payment_reference_id: transactionId,
    })
    .eq("batch_id", batchId)
    .eq("installment_number", 1)
    .eq("status", "scheduled");

  // 9c. Confirm individual registration rows
  await supabase
    .from("registrations")
    .update({ status: "confirmed" })
    .eq("registration_batch_id", batchId);

  // 9d. Send confirmation email (non-fatal)
  await sendConfirmationEmail(batchId, batch.semester_id, batch.parent_id);
}

/* -------------------------------------------------------------------------- */
/* storePaymentMethodAndCaptureInstallment — installment-only path            */
/*                                                                            */
/* Called on saleAuthorized for installment batches (doCapture: false HPP).   */
/* 1. Fetch the payment session to get the hostedCard/hostedAchPayment token  */
/* 2. Create EPG Shopper (or find existing by user_id)                        */
/* 3. Create Stored Card or Stored ACH from the one-time token                */
/* 4. Charge installment 1 via POST /transactions (server-to-server)          */
/* 5. On success: confirm batch, mark installment 1 paid, send email          */
/* 6. On decline or error: log + alert admin, leave batch unconfirmed          */
/*                                                                            */
/* Ref: docs/elavon/api_stored_cards.md, api_shoppers.md, api_transactions.md */
/* -------------------------------------------------------------------------- */

async function storePaymentMethodAndCaptureInstallment(params: {
  transaction: { id: string; total: { amount: string; currencyCode: string }; customReference: string | null };
  batchId: string;
  paymentSessionId: string | null;
  parentId: string | null;
}): Promise<void> {
  const { transaction, batchId, paymentSessionId } = params;

  try {
    // Idempotency guard: if stored_payment_method_id already set, replay safe to skip
    const { data: existingBatch } = await supabase
      .from("registration_batches")
      .select("stored_payment_method_id, parent_id")
      .eq("id", batchId)
      .single();

    if (existingBatch?.stored_payment_method_id) {
      console.log(`[epg-webhook] Stored method already exists for batch ${batchId} — skipping`);
      return;
    }

    const parentId = existingBatch?.parent_id ?? null;
    if (!parentId) {
      console.error(`[epg-webhook] No parent_id on batch ${batchId} — cannot create EPG Shopper`);
      return;
    }

    // 1. Fetch payment session to get hostedCard / hostedAchPayment token
    if (!paymentSessionId) {
      console.error(`[epg-webhook] No payment_session_id for batch ${batchId} — cannot retrieve hostedCard`);
      return;
    }
    const sessionHref = `${process.env.EPG_BASE_URL}/payment-sessions/${paymentSessionId}`;
    const session = await fetchEpgPaymentSession(sessionHref);

    const hostedCardHref = session.hostedCard?.href ?? null;
    const hostedAchHref = session.hostedAchPayment?.href ?? null;

    if (!hostedCardHref && !hostedAchHref) {
      console.error(
        `[epg-webhook] Session ${paymentSessionId} has no hostedCard or hostedAchPayment — ` +
        `verify that doCapture: false was set on the payment session for batch ${batchId}`
      );
      return;
    }

    // 2. Find or create EPG Shopper for this user
    let epgShopper = await fetchEpgShopperByReference(parentId).catch(() => null);

    if (!epgShopper) {
      const { data: user } = await supabase
        .from("users")
        .select("first_name, last_name, email")
        .eq("id", parentId)
        .single();

      epgShopper = await createEpgShopper({
        customReference: parentId,
        fullName: user ? `${user.first_name} ${user.last_name}`.trim() : undefined,
        email: user?.email ?? undefined,
      });
    }

    // Upsert shopper into DB (idempotent via epg_shopper_id conflict)
    const { data: dbShopper } = await supabase
      .from("shoppers")
      .upsert(
        {
          user_id: parentId,
          epg_shopper_id: epgShopper.id,
          epg_shopper_href: epgShopper.href,
          full_name: epgShopper.fullName ?? null,
          email: epgShopper.email ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "epg_shopper_id" }
      )
      .select("id")
      .single();

    if (!dbShopper) {
      console.error(`[epg-webhook] Failed to upsert shopper for batch ${batchId}`);
      return;
    }

    // 3. Create Stored Card or Stored ACH
    let storedMethodId: string | null = null;
    let storedMethodHref: string | null = null;

    if (hostedCardHref) {
      const storedCard = await createEpgStoredCard({
        shopperHref: epgShopper.href,
        hostedCardHref,
        customReference: batchId,
      });

      const { data: dbStoredCard } = await supabase
        .from("stored_payment_methods")
        .insert({
          shopper_id: dbShopper.id,
          type: "card",
          epg_stored_id: storedCard.id,
          epg_stored_href: storedCard.href,
          masked_number: storedCard.card?.maskedNumber ?? null,
          card_scheme: storedCard.card?.scheme ?? null,
          card_last4: storedCard.card?.last4 ?? null,
          expiration_month: storedCard.card?.expirationMonth ?? null,
          expiration_year: storedCard.card?.expirationYear ?? null,
        })
        .select("id")
        .single();

      storedMethodId = dbStoredCard?.id ?? null;
      storedMethodHref = storedCard.href;
    } else if (hostedAchHref) {
      const storedAch = await createEpgStoredAchPayment({
        shopperHref: epgShopper.href,
        hostedAchPaymentHref: hostedAchHref,
        customReference: batchId,
      });

      const { data: dbStoredAch } = await supabase
        .from("stored_payment_methods")
        .insert({
          shopper_id: dbShopper.id,
          type: "ach",
          epg_stored_id: storedAch.id,
          epg_stored_href: storedAch.href,
          ach_account_type: storedAch.achAccountType ?? null,
          ach_last4: storedAch.last4 ?? null,
          account_name: storedAch.accountName ?? null,
        })
        .select("id")
        .single();

      storedMethodId = dbStoredAch?.id ?? null;
      storedMethodHref = storedAch.href;
    }

    if (!storedMethodId || !storedMethodHref) {
      console.error(`[epg-webhook] Failed to persist stored payment method for batch ${batchId}`);
      return;
    }

    // 4. Charge installment 1 via server-to-server transaction
    const installment1Txn = await createEpgTransaction({
      ...(hostedCardHref ? { storedCardHref: storedMethodHref } : { storedAchPaymentHref: storedMethodHref }),
      shopperHref: epgShopper.href,
      amountDollars: parseFloat(transaction.total.amount),
      currencyCode: transaction.total.currencyCode,
      customReference: `installment1-${batchId}`,
      doCapture: true,
    });

    if (!installment1Txn.isAuthorized) {
      // Card declined on server-to-server charge — admin must intervene
      console.error(
        `[epg-webhook] Installment 1 server-to-server charge DECLINED for batch ${batchId} ` +
        `(state=${installment1Txn.state}). Stored method ${storedMethodId} created but batch NOT confirmed.`
      );
      // Still link the stored method so admin can retry manually
      await supabase
        .from("registration_batches")
        .update({ stored_payment_method_id: storedMethodId })
        .eq("id", batchId);
      return;
    }

    // 5. Link stored method to batch
    await supabase
      .from("registration_batches")
      .update({ stored_payment_method_id: storedMethodId })
      .eq("id", batchId);

    console.log(`[epg-webhook] Stored payment method ${storedMethodId} linked to batch ${batchId}`);

    // 6. Confirm batch using the server-to-server transaction ID
    await confirmBatch({
      transaction: installment1Txn,
      batchId,
      transactionId: installment1Txn.id,
    });

  } catch (err) {
    // Semi-fatal: card storage or charge failed. Batch is NOT confirmed.
    // Admin must investigate and manually confirm if payment was collected.
    console.error(
      `[epg-webhook] storePaymentMethodAndCaptureInstallment FAILED for batch ${batchId}:`,
      err
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Confirmation email — identical logic to old Converge webhook handler       */
/* -------------------------------------------------------------------------- */

async function sendConfirmationEmail(
  batchId: string,
  semesterId: string,
  parentId: string | null,
): Promise<void> {
  try {
    const { data: semester } = await supabase
      .from("semesters")
      .select("name, confirmation_email")
      .eq("id", semesterId)
      .single();

    if (!semester?.confirmation_email) {
      console.warn(
        `[epg-webhook] No confirmation_email configured for semester ${semesterId}`,
      );
      return;
    }

    const emailTemplate = semester.confirmation_email as {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      htmlBody?: string;
    };

    if (!emailTemplate.subject || !emailTemplate.htmlBody) {
      console.warn(
        `[epg-webhook] confirmation_email template incomplete for semester ${semesterId}`,
      );
      return;
    }

    if (!parentId) return;
    const { data: parent } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", parentId)
      .single();

    if (!parent?.email) {
      console.warn(`[epg-webhook] No email for parent ${parentId}`);
      return;
    }

    const { data: registrations } = await supabase
      .from("registrations")
      .select(
        "id, dancer_id, dancers(first_name, last_name), class_sessions(classes(name))",
      )
      .eq("registration_batch_id", batchId);

    const dancerNames = [
      ...new Set(
        (registrations ?? []).map((r: any) => {
          const dancer = Array.isArray(r.dancers) ? r.dancers[0] : r.dancers;
          return dancer ? `${dancer.first_name} ${dancer.last_name}` : "Dancer";
        }),
      ),
    ].join(", ");

    const classNames = [
      ...new Set(
        (registrations ?? []).map((r: any) => {
          const session = Array.isArray(r.class_sessions)
            ? r.class_sessions[0]
            : r.class_sessions;
          const cls = session
            ? Array.isArray(session.classes)
              ? session.classes[0]
              : session.classes
            : null;
          return cls?.name ?? "Class";
        }),
      ),
    ].join(", ");

    const tokens: Record<string, string> = {
      "{{parent_first_name}}": parent.first_name,
      "{{parent_name}}": `${parent.first_name} ${parent.last_name}`,
      "{{semester_name}}": semester.name,
      "{{dancer_name}}": dancerNames,
      "{{dancer_list}}": dancerNames,
      "{{class_list}}": classNames,
      "{{session_list}}": classNames,
    };

    let htmlBody = emailTemplate.htmlBody;
    for (const [token, value] of Object.entries(tokens)) {
      htmlBody = htmlBody.replaceAll(token, value);
    }
    htmlBody = prepareEmailHtml(htmlBody);

    const fromEmail =
      emailTemplate.fromEmail ??
      process.env.RESEND_FROM_EMAIL ??
      "noreply@aydt.com";
    const fromName = emailTemplate.fromName ?? "AYDT";

    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: parent.email,
      subject: emailTemplate.subject,
      html: htmlBody,
    });

    console.log(
      `[epg-webhook] Confirmation email sent to ${parent.email} for batch ${batchId}`,
    );
  } catch (err) {
    console.error(
      `[epg-webhook] Failed to send confirmation email for batch ${batchId}:`,
      err,
    );
  }
}
