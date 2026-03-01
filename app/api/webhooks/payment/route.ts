import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { parseConvergeWebhook } from "@/utils/payment/converge";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/webhooks/payment
 *
 * Converge result callback — fires server-to-server after a payment attempt.
 * Payload is application/x-www-form-urlencoded.
 *
 * Responsibilities:
 *   1. Parse + validate Converge payload
 *   2. Find the batch by ssl_invoice_number (= batchId)
 *   3. Confirm batch + mark installment 1 paid
 *   4. Send confirmation email to the parent
 *   5. Return 200 so Converge does not retry
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let batchId = "(unknown)";
  try {
    // Converge POSTs as application/x-www-form-urlencoded
    const text = await request.text();
    const formData = new URLSearchParams(text);
    const payload = parseConvergeWebhook(formData);

    batchId = payload.invoiceNumber;

    console.log(`[payment-webhook] txnId=${payload.txnId} batchId=${batchId} approved=${payload.approved} result=${payload.result}`);

    if (!payload.approved) {
      // Declined or error — log and return 200 (don't retry)
      console.warn(`[payment-webhook] Payment declined for batch ${batchId}: ${payload.raw["ssl_result_message"] ?? "unknown reason"}`);
      return NextResponse.json({ ok: false, reason: "declined" }, { status: 200 });
    }

    if (!batchId) {
      console.error("[payment-webhook] Missing ssl_invoice_number in payload");
      return NextResponse.json({ ok: false, reason: "missing invoice" }, { status: 200 });
    }

    /* ------------------------------------------------------------------ */
    /* 1. Confirm the batch                                                 */
    /* ------------------------------------------------------------------ */
    const { data: batch, error: batchError } = await supabase
      .from("registration_batches")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        payment_reference_id: payload.txnId, // overwrite auth token with real txn ID
      })
      .eq("id", batchId)
      .eq("status", "pending_payment") // idempotency guard — only confirm once
      .select("id, semester_id, parent_id, grand_total, payment_plan_type")
      .maybeSingle();

    if (batchError) {
      console.error(`[payment-webhook] Failed to confirm batch ${batchId}:`, batchError);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    if (!batch) {
      // Batch was already confirmed (duplicate webhook) or not found — safe to ignore
      console.warn(`[payment-webhook] Batch ${batchId} not found or already confirmed — ignoring duplicate`);
      return NextResponse.json({ ok: true, note: "already_confirmed" }, { status: 200 });
    }

    /* ------------------------------------------------------------------ */
    /* 2. Mark installment 1 as paid                                        */
    /* ------------------------------------------------------------------ */
    const { data: installment } = await supabase
      .from("batch_payment_installments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_amount: Number(payload.amount) || null,
        payment_reference_id: payload.txnId,
      })
      .eq("batch_id", batchId)
      .eq("installment_number", 1)
      .eq("status", "scheduled")
      .select("amount_due")
      .maybeSingle();

    if (!installment) {
      // Might already be paid (duplicate) — log but don't fail
      console.warn(`[payment-webhook] Installment 1 for batch ${batchId} not updated (may already be paid)`);
    }

    /* ------------------------------------------------------------------ */
    /* 3. Confirm individual registration rows                             */
    /* ------------------------------------------------------------------ */
    await supabase
      .from("registrations")
      .update({ status: "confirmed" })
      .eq("registration_batch_id", batchId);

    /* ------------------------------------------------------------------ */
    /* 4. Send confirmation email                                           */
    /* ------------------------------------------------------------------ */
    await sendConfirmationEmail(batchId, batch.semester_id, batch.parent_id);

    console.log(`[payment-webhook] Batch ${batchId} confirmed successfully`);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(`[payment-webhook] Unhandled error for batch ${batchId}:`, err);
    // Return 200 to prevent Converge from retrying endlessly
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}

/* -------------------------------------------------------------------------- */
/* Confirmation email                                                          */
/* -------------------------------------------------------------------------- */

async function sendConfirmationEmail(
  batchId: string,
  semesterId: string,
  parentId: string | null,
): Promise<void> {
  try {
    // Fetch the semester's confirmation email template
    const { data: semester } = await supabase
      .from("semesters")
      .select("name, confirmation_email")
      .eq("id", semesterId)
      .single();

    if (!semester?.confirmation_email) {
      console.warn(`[payment-webhook] No confirmation_email configured for semester ${semesterId}`);
      return;
    }

    const emailTemplate = semester.confirmation_email as {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      htmlBody?: string;
    };

    if (!emailTemplate.subject || !emailTemplate.htmlBody) {
      console.warn(`[payment-webhook] confirmation_email template incomplete for semester ${semesterId}`);
      return;
    }

    // Fetch the parent's info
    if (!parentId) return;
    const { data: parent } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", parentId)
      .single();

    if (!parent?.email) {
      console.warn(`[payment-webhook] No email for parent ${parentId}`);
      return;
    }

    // Fetch the registrations + sessions + classes for this batch
    const { data: registrations } = await supabase
      .from("registrations")
      .select(
        "id, dancer_id, dancers(first_name, last_name), class_sessions(classes(name))",
      )
      .eq("registration_batch_id", batchId);

    // Build token replacement map
    const dancerNames = [
      ...new Set(
        (registrations ?? []).map((r: any) => {
          const dancer = Array.isArray(r.dancers) ? r.dancers[0] : r.dancers;
          return dancer
            ? `${dancer.first_name} ${dancer.last_name}`
            : "Dancer";
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

    const fromEmail =
      emailTemplate.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? "noreply@aydt.com";
    const fromName = emailTemplate.fromName ?? "AYDT";

    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: parent.email,
      subject: emailTemplate.subject,
      html: htmlBody,
    });

    console.log(`[payment-webhook] Confirmation email sent to ${parent.email} for batch ${batchId}`);
  } catch (err) {
    // Email failure is non-fatal — batch is already confirmed
    console.error(`[payment-webhook] Failed to send confirmation email for batch ${batchId}:`, err);
  }
}
