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
      .from("registration_batches")
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

  return NextResponse.json({ ok: true }, { status: 200 });
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

  // 9c. Confirm individual enrollment rows in BOTH tables.
  //   - registrations: drop-in / legacy per-session rows (status pending_payment → confirmed)
  //   - schedule_enrollments: standard/tiered full-term rows (status pending → confirmed)
  // Phase 3b-ii: public flow can produce rows in either or both tables for a batch.
  await Promise.all([
    supabase
      .from("registrations")
      .update({ status: "confirmed" })
      .eq("registration_batch_id", batchId),
    supabase
      .from("schedule_enrollments")
      .update({ status: "confirmed" })
      .eq("batch_id", batchId)
      .eq("status", "pending"),
  ]);

  // 9d. Send confirmation email (non-fatal). Pass the charged amount + currency
  // so {{total_amount}} resolves.
  await sendConfirmationEmail(
    batchId,
    batch.semester_id,
    batch.parent_id,
    transaction.total.amount,
    transaction.total.currencyCode,
  );
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
        .select("first_name, last_name, email, address_line1, address_line2, city, state, zipcode")
        .eq("id", parentId)
        .single();

      epgShopper = await createEpgShopper({
        customReference: parentId,
        fullName: user ? `${user.first_name} ${user.last_name}`.trim() : undefined,
        email: user?.email ?? undefined,
        ...(user?.address_line1 && user?.city && user?.state && user?.zipcode && {
          primaryAddress: {
            street1: user.address_line1,
            street2: user.address_line2,
            city: user.city,
            region: user.state,
            postalCode: user.zipcode,
          },
        }),
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

/**
 * Surface a failed confirmation email to staff. The payment succeeded and the
 * registration is confirmed — only the email failed — so this never throws.
 * We always log, and additionally email ADMIN_NOTIFICATION_EMAIL so a human can
 * resend or fix the template. For data-issue failures (missing/incomplete
 * template, no recipient) Resend itself is healthy and the alert lands; if
 * Resend is the thing that's down, the alert may also fail and we fall back to
 * the console.error above.
 */
async function alertAdminEmailFailure(params: {
  batchId: string;
  reason: string;
  recipientEmail?: string | null;
  detail?: string;
}): Promise<void> {
  const { batchId, reason, recipientEmail, detail } = params;
  console.error(
    `[epg-webhook] ❌ confirmation email NOT sent for batch ${batchId} — ${reason}${detail ? ` (${detail})` : ""}`,
  );

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.error(
      `[epg-webhook] ADMIN_NOTIFICATION_EMAIL not set — cannot alert staff about the failed confirmation email for batch ${batchId}`,
    );
    return;
  }

  const fromEmail = (process.env.RESEND_FROM_EMAIL || "noreply@aydt.com").trim();
  try {
    const { error } = await resend.emails.send({
      from: `AYDT System <${fromEmail}>`,
      to: adminEmail,
      subject: `⚠️ Confirmation email not sent — batch ${batchId}`,
      html: `
        <p>The registration confirmation email for batch <strong>${batchId}</strong> could not be sent.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        ${recipientEmail ? `<p><strong>Intended recipient:</strong> ${recipientEmail}</p>` : ""}
        ${detail ? `<p><strong>Detail:</strong> ${detail}</p>` : ""}
        <p>The payment succeeded and the registration is confirmed — only the confirmation email failed. Please follow up manually (resend the email, or fix the semester's confirmation template).</p>
      `,
    });
    if (error) {
      console.error(
        `[epg-webhook] ALSO failed to send the admin alert email for batch ${batchId}:`,
        error,
      );
    }
  } catch (err) {
    console.error(
      `[epg-webhook] admin alert email threw for batch ${batchId}:`,
      err,
    );
  }
}

async function sendConfirmationEmail(
  batchId: string,
  semesterId: string,
  parentId: string | null,
  amountChargedRaw?: string,
  currencyCode?: string,
): Promise<void> {
  try {
    const { data: semester } = await supabase
      .from("semesters")
      .select("name, confirmation_email")
      .eq("id", semesterId)
      .single();

    if (!semester?.confirmation_email) {
      await alertAdminEmailFailure({
        batchId,
        reason: `no confirmation_email template is configured for semester ${semesterId}`,
      });
      return;
    }

    const emailTemplate = semester.confirmation_email as {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      htmlBody?: string;
    };

    if (!emailTemplate.subject || !emailTemplate.htmlBody) {
      await alertAdminEmailFailure({
        batchId,
        reason: `confirmation_email template for semester ${semesterId} is missing a subject or body`,
      });
      return;
    }

    if (!parentId) {
      await alertAdminEmailFailure({
        batchId,
        reason: "batch has no parent_id — cannot determine the recipient",
      });
      return;
    }
    const { data: parent } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", parentId)
      .single();

    if (!parent?.email) {
      await alertAdminEmailFailure({
        batchId,
        reason: `parent ${parentId} has no email address on file`,
      });
      return;
    }

    // A batch can produce rows in EITHER table (Phase 3b-ii):
    //   - drop-in registrations  → `registrations` (joined via class_sessions → classes)
    //   - standard/tiered         → `schedule_enrollments` (joined via class_schedules → classes)
    // Aggregate dancer + class names across BOTH so the email isn't blank for
    // tiered/standard-only batches.
    const [{ data: registrations }, { data: enrollments }] = await Promise.all([
      supabase
        .from("registrations")
        .select(
          "id, dancer_id, dancers(first_name, last_name), class_sessions(classes(name))",
        )
        .eq("registration_batch_id", batchId),
      supabase
        .from("schedule_enrollments")
        .select(
          "id, dancer_id, dancers(first_name, last_name), class_schedules(classes(name))",
        )
        .eq("batch_id", batchId)
        .neq("status", "cancelled"),
    ]);

    const dancerNameSet = new Set<string>();
    const classNameSet = new Set<string>();

    // Supabase nested joins come back as either an object or a single-element
    // array depending on the relationship — normalize to the first record.
    type DancerRel = { first_name: string; last_name: string };
    type ClassRel = { name: string | null };
    type ClassParent = { classes: ClassRel | ClassRel[] | null };
    const firstOf = <T>(rel: T | T[] | null | undefined): T | null =>
      Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);

    const addNames = (
      dancerRel: DancerRel | DancerRel[] | null | undefined,
      classParentRel: ClassParent | ClassParent[] | null | undefined,
    ) => {
      const dancer = firstOf(dancerRel);
      if (dancer) dancerNameSet.add(`${dancer.first_name} ${dancer.last_name}`);
      const parent = firstOf(classParentRel);
      const cls = parent ? firstOf(parent.classes) : null;
      if (cls?.name) classNameSet.add(cls.name);
    };

    for (const r of registrations ?? []) {
      const row = r as {
        dancers: DancerRel | DancerRel[] | null;
        class_sessions: ClassParent | ClassParent[] | null;
      };
      addNames(row.dancers, row.class_sessions);
    }

    for (const e of enrollments ?? []) {
      const row = e as {
        dancers: DancerRel | DancerRel[] | null;
        class_schedules: ClassParent | ClassParent[] | null;
      };
      addNames(row.dancers, row.class_schedules);
    }

    const dancerNames = [...dancerNameSet].join(", ");
    const classNames = [...classNameSet].join(", ");

    console.log(
      `[epg-webhook] ⚠️ TEMP - email aggregation batch=${batchId} regs=${(registrations ?? []).length} enrollments=${(enrollments ?? []).length} dancers="${dancerNames}" classes="${classNames}"`,
    ); // TODO: DELETE

    // Format the amount actually charged + a registration date. Matches the
    // admin preview format in ConfirmationEmailStep.tsx (currency + long date).
    const totalAmount = amountChargedRaw
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currencyCode || "USD",
        }).format(parseFloat(amountChargedRaw) || 0)
      : "";
    const registrationDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const tokens: Record<string, string> = {
      // Admin-UI tokens (see app/admin/semesters/steps/ConfirmationEmailStep.tsx
      // TOKENS) — these are what the token picker actually inserts. Must stay
      // in sync with that list.
      "{{first_name}}": parent.first_name,
      "{{session_title}}": classNames,
      "{{total_amount}}": totalAmount,
      "{{registration_date}}": registrationDate,
      // Extended tokens — not in the admin picker, but kept so any
      // hand-authored template that uses them still resolves.
      "{{parent_first_name}}": parent.first_name,
      "{{parent_name}}": `${parent.first_name} ${parent.last_name}`,
      "{{semester_name}}": semester.name,
      "{{dancer_name}}": dancerNames,
      "{{dancer_list}}": dancerNames,
      "{{class_list}}": classNames,
      "{{session_list}}": classNames,
    };

    // Substitute tokens in BOTH subject and body. Any unknown token is left
    // as-is — better a literal token than a crash.
    const applyTokens = (input: string): string => {
      let out = input;
      for (const [token, value] of Object.entries(tokens)) {
        out = out.replaceAll(token, value);
      }
      return out;
    };

    const subject = applyTokens(emailTemplate.subject);
    let htmlBody = applyTokens(emailTemplate.htmlBody);
    htmlBody = prepareEmailHtml(htmlBody);

    // Use truthy fallback (not ??) so empty strings saved by the admin UI also
    // fall through — otherwise `from` renders as " <>" and Resend 422s.
    const fromEmail = (
      emailTemplate.fromEmail ||
      process.env.RESEND_FROM_EMAIL ||
      "noreply@aydt.com"
    ).trim();
    const fromName = (emailTemplate.fromName || "AYDT").trim();

    // ⚠️ TEMP - pre-send diagnostics so we can confirm the resolved values
    // (esp. the `from` field that was rendering as " <>"). TODO: DELETE
    console.log(
      `[epg-webhook] ⚠️ TEMP - sending confirmation email batch=${batchId} from="${fromName} <${fromEmail}>" to=${parent.email} subject="${subject}" templateFromEmail="${emailTemplate.fromEmail ?? ""}" envFromEmail="${process.env.RESEND_FROM_EMAIL ?? ""}"`,
    );

    // Resend v6 returns { data, error } and does NOT throw on 4xx — must check
    // error explicitly, or a validation failure silently looks like success.
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: parent.email,
      subject,
      html: htmlBody,
    });

    if (resendError) {
      await alertAdminEmailFailure({
        batchId,
        reason: "Resend rejected the confirmation email",
        recipientEmail: parent.email,
        detail: `from="${fromName} <${fromEmail}>" — ${
          typeof resendError === "object" ? JSON.stringify(resendError) : String(resendError)
        }`,
      });
      return;
    }

    console.log(
      `[epg-webhook] ✅ Confirmation email sent to ${parent.email} for batch ${batchId} (resendId=${resendData?.id ?? "unknown"})`,
    );
  } catch (err) {
    console.error(
      `[epg-webhook] Failed to send confirmation email for batch ${batchId}:`,
      err,
    );
  }
}
