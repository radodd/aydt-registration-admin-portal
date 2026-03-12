import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  fetchEpgTransaction,
  epgEventTypeToPaymentState,
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
    .select("id, state, registration_batch_id")
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
    // 9a. Confirm batch (idempotency: only if still pending_payment)
    const { data: batch } = await supabase
      .from("registration_batches")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        payment_reference_id: transaction.id,
      })
      .eq("id", batchId)
      .eq("status", "pending")
      .select("id, semester_id, parent_id, grand_total, payment_plan_type")
      .maybeSingle();

    if (!batch) {
      // Already confirmed (duplicate webhook) — safe to return
      console.log(
        `[epg-webhook] Batch ${batchId} already confirmed — skipping`,
      );
      return NextResponse.json({ ok: true });
    }

    // 9b. Mark installment 1 as paid
    await supabase
      .from("batch_payment_installments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_amount: parseFloat(transaction.total.amount) || null,
        payment_reference_id: transaction.id,
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

    console.log(
      `[epg-webhook] Batch ${batchId} confirmed (eventType=${eventType} txnId=${transaction.id})`,
    );
  }

  return NextResponse.json({ ok: true });
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
