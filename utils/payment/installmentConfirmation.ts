/**
 * Shared installment confirmation + stored-card setup logic.
 *
 * Extracted from app/api/webhooks/epg/route.ts so it can be driven by MULTIPLE
 * triggers, all idempotent:
 *   1. returnUrl handoff  — app/(user-facing)/register/... (fast, customer-present)
 *   2. EPG webhook        — app/api/webhooks/epg/route.ts (server-to-server backup)
 *   3. reconciliation cron — supabase/functions/reconcile-installment-setup
 *      (Deno; re-implements the charge but reuses NOTHING here — see note below)
 *
 * NODE-ONLY. Imports the Node EPG client (utils/payment/epg.ts) and Resend, so
 * it can only be called from the Next.js runtime (webhook route, server actions).
 * The Deno reconciliation cron deliberately re-implements this logic in Deno —
 * the Node/Deno boundary makes a single literal implementation impossible (same
 * split that already exists for process-overdue-payments).
 *
 * Why the two-step (store card, then charge server-to-server)?
 *   Installment sessions are created with doCreateTransaction:false so the
 *   hostedCard token survives for storage (a doCreateTransaction:true session
 *   consumes the token and POST /stored-cards 404s). Because no transaction is
 *   created on the hosted page, there is NO webhook transaction object to read
 *   the charge amount from — so this helper derives the installment-1 amount
 *   from order_payment_installments and the session id from the payments row.
 *   Confirmed two-step pattern with Elavon (Justin Huffines, 2026-05-30).
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  fetchEpgPaymentSession,
  createEpgShopper,
  fetchEpgShopperByReference,
  createEpgStoredCard,
  createEpgStoredAchPayment,
  createEpgTransaction,
} from "@/utils/payment/epg";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";
import { buildRegistrationSummaryHtml } from "@/utils/email/buildRegistrationSummary";
import { logPaymentError } from "@/utils/payment/logPaymentError";
import type { PaymentErrorSource } from "@/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);

/* -------------------------------------------------------------------------- */
/* alertAdminEmailFailure                                                      */
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
    `[installment-confirm] ❌ confirmation email NOT sent for batch ${batchId} — ${reason}${detail ? ` (${detail})` : ""}`,
  );

  // Application-internal: the payment succeeded but the confirmation/receipt
  // email didn't go out. Warning severity (no money impact) — unifies this with
  // the existing admin email alert below.
  await logPaymentError({
    origin: "application",
    source: "app_internal",
    category: "unknown",
    severity: "warning",
    orderId: batchId,
    errorMessage: `Confirmation email not sent: ${reason}${detail ? ` (${detail})` : ""}`,
    rawPayload: { reason, recipientEmail: recipientEmail ?? null, detail: detail ?? null },
  });

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.error(
      `[installment-confirm] ADMIN_NOTIFICATION_EMAIL not set — cannot alert staff about the failed confirmation email for batch ${batchId}`,
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
        `[installment-confirm] ALSO failed to send the admin alert email for batch ${batchId}:`,
        error,
      );
    }
  } catch (err) {
    console.error(
      `[installment-confirm] admin alert email threw for batch ${batchId}:`,
      err,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* sendConfirmationEmail                                                       */
/* -------------------------------------------------------------------------- */

export async function sendConfirmationEmail(
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
    //   - drop-in registrations  → `registrations` (joined via class_meetings → classes)
    //   - standard/tiered         → `section_enrollments` (joined via class_sections → classes)
    // Aggregate dancer + class names across BOTH so the email isn't blank for
    // tiered/standard-only batches.
    const [{ data: registrations }, { data: enrollments }] = await Promise.all([
      supabase
        .from("meeting_enrollments")
        .select(
          "id, dancer_id, dancers(first_name, last_name), class_meetings(classes(name))",
        )
        .eq("registration_batch_id", batchId),
      supabase
        .from("section_enrollments")
        .select(
          "id, dancer_id, dancers(first_name, last_name), class_sections(classes(name))",
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
        class_meetings: ClassParent | ClassParent[] | null;
      };
      addNames(row.dancers, row.class_meetings);
    }

    for (const e of enrollments ?? []) {
      const row = e as {
        dancers: DancerRel | DancerRel[] | null;
        class_sections: ClassParent | ClassParent[] | null;
      };
      addNames(row.dancers, row.class_sections);
    }

    const dancerNames = [...dancerNameSet].join(", ");
    const classNames = [...classNameSet].join(", ");

    console.log(
      `[installment-confirm] ⚠️ TEMP - email aggregation batch=${batchId} regs=${(registrations ?? []).length} enrollments=${(enrollments ?? []).length} dancers="${dancerNames}" classes="${classNames}"`,
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

    // Installment plans (#7): build a schedule block so auto-charged families see
    // exactly what will be charged and when. Empty string for pay-in-full.
    const { data: installments } = await supabase
      .from("order_payment_installments")
      .select("installment_number, amount_due, due_date, status")
      .eq("batch_id", batchId)
      .order("installment_number", { ascending: true });

    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode || "USD" }).format(n);

    let paymentScheduleHtml = "";
    if (installments && installments.length > 1) {
      const rows = installments
        .map((inst) => {
          const dueLabel = new Date(`${inst.due_date}T12:00:00`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const paid = inst.status === "paid";
          return `
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#555;">
                Installment ${inst.installment_number} · ${dueLabel}${paid ? " (paid today)" : ""}
              </td>
              <td style="padding:6px 0;font-size:14px;text-align:right;color:${paid ? "#16a34a" : "#333"};">
                ${fmtMoney(Number(inst.amount_due))}
              </td>
            </tr>`;
        })
        .join("");
      paymentScheduleHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;border-collapse:collapse;">
          <tr>
            <td colspan="2" style="padding:0 0 8px 0;font-weight:bold;font-size:13px;color:#7B1F1A;border-bottom:2px solid #7B1F1A;text-transform:uppercase;letter-spacing:0.05em;">
              Auto-charge Schedule
            </td>
          </tr>
          ${rows}
        </table>
        <p style="margin:8px 0 0 0;font-size:13px;color:#64748b;">
          Your card on file will be charged automatically on each date above. No action is needed.
        </p>`;
    }

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
      // #7: installment schedule block (empty for pay-in-full). Template authors
      // can place it explicitly; otherwise it is appended below for installment
      // plans so families always see the schedule.
      "{{payment_schedule}}": paymentScheduleHtml,
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
    // If this is an installment plan and the template didn't place the schedule
    // token itself, append the schedule so the family always sees it (#7).
    if (paymentScheduleHtml && !emailTemplate.htmlBody.includes("{{payment_schedule}}")) {
      htmlBody += paymentScheduleHtml;
    }

    // #4: append the system-generated, non-editable "Registration Summary"
    // receipt. Always rendered regardless of the admin's free-text body, and
    // reads BOTH meeting_enrollments + section_enrollments so tiered/standard
    // enrollments are included. Returns "" on empty/error — never blocks the send.
    const registrationSummaryHtml = await buildRegistrationSummaryHtml(supabase, {
      batchId,
      currencyCode,
    });
    if (registrationSummaryHtml) {
      htmlBody += registrationSummaryHtml;
    }

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
      `[installment-confirm] ⚠️ TEMP - sending confirmation email batch=${batchId} from="${fromName} <${fromEmail}>" to=${parent.email} subject="${subject}" templateFromEmail="${emailTemplate.fromEmail ?? ""}" envFromEmail="${process.env.RESEND_FROM_EMAIL ?? ""}"`,
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
      `[installment-confirm] ✅ Confirmation email sent to ${parent.email} for batch ${batchId} (resendId=${resendData?.id ?? "unknown"})`,
    );
  } catch (err) {
    console.error(
      `[installment-confirm] Failed to send confirmation email for batch ${batchId}:`,
      err,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* confirmBatch — shared confirmation steps (9a–9d)                           */
/* -------------------------------------------------------------------------- */

export async function confirmBatch(params: {
  transaction: { id: string; total: { amount: string; currencyCode: string } };
  batchId: string;
  /** The transaction ID to record on installment 1 (HPP txn for full-pay, S2S txn for installments). */
  transactionId: string;
}): Promise<void> {
  const { transaction, batchId, transactionId } = params;

  // 9a. Confirm batch (idempotency: only if still pending)
  const { data: batch } = await supabase
    .from("registration_orders")
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
    console.log(`[installment-confirm] Batch ${batchId} already confirmed — skipping`);
    return;
  }

  // 9b. Mark installment 1 as paid
  await supabase
    .from("order_payment_installments")
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
  //   - section_enrollments: standard/tiered full-term rows (status pending → confirmed)
  // Phase 3b-ii: public flow can produce rows in either or both tables for a batch.
  await Promise.all([
    supabase
      .from("meeting_enrollments")
      .update({ status: "confirmed" })
      .eq("registration_batch_id", batchId),
    supabase
      .from("section_enrollments")
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

/**
 * Auto-charge stops and installment 1 moves to 'failed' after this many declined
 * attempts — mirrors the recurring-charge policy in chargeStoredPaymentInstallment
 * and the process-overdue-payments cron. Shared across ALL triggers via the
 * installment row's charge_attempt_count, so a card can't be hammered no matter
 * how many times the returnUrl handoff / webhook / reconciliation cron re-enter.
 */
const MAX_INSTALLMENT1_ATTEMPTS = 3;

/* -------------------------------------------------------------------------- */
/* ensureStoredCardAndChargeInstallment1 — installment-only path              */
/*                                                                            */
/* Fully idempotent and crash-safe. Safe to call any number of times from the */
/* returnUrl handoff, the EPG webhook, OR the reconciliation cron.            */
/*                                                                            */
/* Two decoupled, separately-idempotent phases keyed off real DB state — so a */
/* crash BETWEEN them recovers cleanly:                                       */
/*                                                                            */
/*   Phase A — ensure the card is stored:                                     */
/*     • If registration_orders.stored_payment_method_id is already set, REUSE */
/*       that stored method (do NOT re-tokenize — the hostedCard token is      */
/*       single-use and was consumed by the first storage; re-running          */
/*       POST /stored-cards would 404). This is the crash-after-storage fix.   */
/*     • Otherwise: session → token → shopper → store card → link             */
/*       stored_payment_method_id IMMEDIATELY (committed before charging).      */
/*                                                                            */
/*   Phase B — ensure installment 1 is charged + the batch confirmed:          */
/*     • Skip if installment 1 is already 'paid' (just (re)confirm the batch). */
/*     • Stop if charge_attempt_count >= MAX (declined too many times).        */
/*     • Charge S2S (merchant-initiated). customReference is constant          */
/*       (`installment1-{batchId}`) so EPG dedups concurrent / retried charges.*/
/*     • Authorized → confirm batch. Declined → bump attempt count + record    */
/*       the error (status → 'failed' at the cap); leave the order for the     */
/*       grace-window cron / admin.                                            */
/*                                                                            */
/* The installment-1 amount + session id come from the DB                     */
/* (order_payment_installments + payments), not a webhook transaction, because */
/* the tokenize-only session (doCreateTransaction:false) produces no           */
/* transaction to read them from.                                             */
/* -------------------------------------------------------------------------- */

export type EnsureStoredCardResult =
  | "stored_and_charged"
  | "already_done"
  | "declined"
  | "skipped"
  | "error";

/** A resolved, chargeable stored payment method (existing or freshly created). */
type ResolvedStoredMethod = {
  storedMethodId: string;
  storedMethodHref: string;
  type: "card" | "ach";
  shopperHref: string;
};

export async function ensureStoredCardAndChargeInstallment1(params: {
  batchId: string;
  /** Optional override; otherwise read from the payments row for this batch. */
  paymentSessionId?: string | null;
  /**
   * Capture-point label for any error logged here. Defaults to "hpp_checkout"
   * (the primary returnUrl path); the webhook backup passes "webhook".
   */
  source?: PaymentErrorSource;
}): Promise<{ status: EnsureStoredCardResult; detail?: string }> {
  const { batchId } = params;
  const errorSource: PaymentErrorSource = params.source ?? "hpp_checkout";

  try {
    const { data: existingBatch } = await supabase
      .from("registration_orders")
      .select("status, stored_payment_method_id, parent_id")
      .eq("id", batchId)
      .single();

    if (!existingBatch) {
      console.error(`[installment-confirm] Batch ${batchId} not found`);
      return { status: "error", detail: "batch not found" };
    }
    if (existingBatch.status === "confirmed") {
      console.log(`[installment-confirm] Batch ${batchId} already confirmed — nothing to do`);
      return { status: "already_done" };
    }

    const parentId = existingBatch.parent_id ?? null;
    if (!parentId) {
      console.error(`[installment-confirm] No parent_id on batch ${batchId} — cannot create EPG Shopper`);
      return { status: "error", detail: "missing parent_id" };
    }

    // Installment-1 row drives the charge amount + the shared attempt counter.
    const { data: inst1 } = await supabase
      .from("order_payment_installments")
      .select("id, amount_due, status, charge_attempt_count, transaction_id")
      .eq("batch_id", batchId)
      .eq("installment_number", 1)
      .maybeSingle();

    if (!inst1) {
      console.error(`[installment-confirm] No installment-1 row for batch ${batchId} — cannot charge`);
      return { status: "error", detail: "missing installment-1 row" };
    }
    const amountDollars = Number(inst1.amount_due);
    if (!amountDollars || amountDollars <= 0) {
      console.error(`[installment-confirm] No installment-1 amount for batch ${batchId} — cannot charge`);
      return { status: "error", detail: "missing installment-1 amount" };
    }

    // ----- Phase A: ensure a stored payment method (reuse or create) ---------
    const resolved = await resolveStoredMethod({
      batchId,
      parentId,
      paymentSessionId: params.paymentSessionId ?? null,
      existingStoredMethodId: existingBatch.stored_payment_method_id ?? null,
    });
    if ("error" in resolved) {
      return { status: "error", detail: resolved.error };
    }

    // ----- Phase B: ensure installment 1 is charged + the batch confirmed ----

    // Already paid (charge succeeded on a prior attempt, but confirmation may
    // not have completed) — just (re)confirm the batch idempotently.
    if (inst1.status === "paid") {
      await confirmBatch({
        transaction: {
          id: inst1.transaction_id ?? "",
          total: { amount: amountDollars.toFixed(2), currencyCode: "USD" },
        },
        batchId,
        transactionId: inst1.transaction_id ?? "",
      });
      return { status: "already_done" };
    }

    // Declined too many times — stop auto-charging; the grace-window cron will
    // fail the order and an admin can retry manually.
    if ((inst1.charge_attempt_count ?? 0) >= MAX_INSTALLMENT1_ATTEMPTS) {
      console.warn(
        `[installment-confirm] Batch ${batchId} installment 1 hit the ${MAX_INSTALLMENT1_ATTEMPTS}-attempt cap — not retrying`,
      );
      return { status: "declined", detail: "attempt cap reached" };
    }

    const installment1Txn = await createEpgTransaction({
      ...(resolved.type === "card"
        ? { storedCardHref: resolved.storedMethodHref }
        : { storedAchPaymentHref: resolved.storedMethodHref }),
      shopperHref: resolved.shopperHref,
      amountDollars,
      currencyCode: "USD",
      customReference: `installment1-${batchId}`,
      doCapture: true,
    });

    if (!installment1Txn.isAuthorized) {
      const newCount = (inst1.charge_attempt_count ?? 0) + 1;
      console.error(
        `[installment-confirm] Installment 1 S2S charge DECLINED for batch ${batchId} ` +
        `(state=${installment1Txn.state}, attempt ${newCount}/${MAX_INSTALLMENT1_ATTEMPTS}). ` +
        `Stored method ${resolved.storedMethodId} is linked; batch NOT confirmed.`,
      );
      await supabase
        .from("order_payment_installments")
        .update({
          charge_attempt_count: newCount,
          last_charge_error: installment1Txn.state ?? "declined",
          status: newCount >= MAX_INSTALLMENT1_ATTEMPTS ? "failed" : inst1.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inst1.id);

      // History layer: one row per ACTUAL declined attempt. Sits in the real-
      // charge branch (not the early attempt-cap return above), so repeated
      // polling of the finalize route never duplicates a row.
      await logPaymentError({
        origin: "gateway",
        source: errorSource,
        category: "decline",
        orderId: batchId,
        installmentId: inst1.id,
        installmentNumber: 1,
        errorCode: installment1Txn.state,
        errorMessage: `Installment 1 charge declined (state=${installment1Txn.state}).`,
        retryCount: newCount,
        rawPayload: { state: installment1Txn.state, transactionId: installment1Txn.id },
      });

      return { status: "declined", detail: installment1Txn.state };
    }

    // Authorized — confirm the batch (marks installment 1 paid, confirms
    // enrollments, sends the confirmation email; all idempotent).
    await confirmBatch({
      transaction: installment1Txn,
      batchId,
      transactionId: installment1Txn.id,
    });

    return { status: "stored_and_charged" };
  } catch (err) {
    // Semi-fatal: card storage or charge failed. Batch is NOT confirmed.
    // The stored method (if any) is already linked, so a retry resumes at the
    // charge step rather than re-tokenizing. Admin/grace-window handle the rest.
    console.error(
      `[installment-confirm] ensureStoredCardAndChargeInstallment1 FAILED for batch ${batchId}:`,
      err,
    );
    return { status: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Phase A helper: return a chargeable stored method for the batch, reusing the
 * already-linked one when present (crash-safe — never re-tokenizes a spent
 * hostedCard token) and otherwise creating + linking a fresh one.
 */
async function resolveStoredMethod(args: {
  batchId: string;
  parentId: string;
  paymentSessionId: string | null;
  existingStoredMethodId: string | null;
}): Promise<ResolvedStoredMethod | { error: string }> {
  const { batchId, parentId, existingStoredMethodId } = args;

  // 0. Reuse an already-stored method (set by a prior attempt before a crash).
  if (existingStoredMethodId) {
    const { data: sm } = await supabase
      .from("stored_payment_methods")
      .select("id, type, epg_stored_href, shopper_id")
      .eq("id", existingStoredMethodId)
      .maybeSingle();
    if (!sm?.epg_stored_href || !sm.shopper_id) {
      return { error: "linked stored method row is missing or incomplete" };
    }
    const { data: shopper } = await supabase
      .from("shoppers")
      .select("epg_shopper_href")
      .eq("id", sm.shopper_id)
      .maybeSingle();
    if (!shopper?.epg_shopper_href) {
      return { error: "shopper for linked stored method not found" };
    }
    console.log(`[installment-confirm] Reusing stored method ${sm.id} for batch ${batchId} (no re-tokenize)`);
    return {
      storedMethodId: sm.id,
      storedMethodHref: sm.epg_stored_href,
      type: (sm.type as "card" | "ach") ?? "card",
      shopperHref: shopper.epg_shopper_href,
    };
  }

  // 1. Resolve the payment session id (caller override → payments row).
  let paymentSessionId = args.paymentSessionId;
  if (!paymentSessionId) {
    const { data: payment } = await supabase
      .from("payments")
      .select("payment_session_id")
      .eq("custom_reference", batchId)
      .maybeSingle();
    paymentSessionId = payment?.payment_session_id ?? null;
  }
  if (!paymentSessionId) {
    return { error: "missing payment_session_id" };
  }

  // 2. Fetch the session to get the single-use hostedCard / hostedAchPayment token.
  const sessionHref = `${process.env.EPG_BASE_URL}/payment-sessions/${paymentSessionId}`;
  const session = await fetchEpgPaymentSession(sessionHref);
  const hostedCardHref = session.hostedCard?.href ?? null;
  const hostedAchHref = session.hostedAchPayment?.href ?? null;
  if (!hostedCardHref && !hostedAchHref) {
    return { error: "session has no hosted token (card not entered / abandoned)" };
  }

  // 3. Find or create the EPG Shopper for this user.
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
      { onConflict: "epg_shopper_id" },
    )
    .select("id")
    .single();

  if (!dbShopper) {
    return { error: "shopper upsert failed" };
  }

  // 4. Create the Stored Card / Stored ACH from the one-time token.
  let storedMethodId: string | null = null;
  let storedMethodHref: string | null = null;
  let type: "card" | "ach" = "card";

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
    type = "card";
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
    type = "ach";
  }

  if (!storedMethodId || !storedMethodHref) {
    return { error: "stored method persist failed" };
  }

  // 5. Link IMMEDIATELY — committed before any charge, so a crash/throw during
  //    the charge resumes by reusing this method (step 0) instead of re-using
  //    the now-consumed hostedCard token.
  await supabase
    .from("registration_orders")
    .update({ stored_payment_method_id: storedMethodId })
    .eq("id", batchId);

  console.log(`[installment-confirm] Stored payment method ${storedMethodId} linked to batch ${batchId}`);

  return { storedMethodId, storedMethodHref, type, shopperHref: epgShopper.href };
}
