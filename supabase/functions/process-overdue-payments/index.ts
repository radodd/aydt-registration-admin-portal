import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/* -------------------------------------------------------------------------- */
/* Twilio SMS helper (inline — Deno can't import from @/ paths)               */
/* -------------------------------------------------------------------------- */

async function sendSmsViaApi(
  toPhone: string,
  message: string,
  userId: string,
): Promise<void> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !fromPhone || !toPhone) return;

  const body = ("AYDT: " + message).slice(0, 160);
  let twilioSid: string | undefined;
  let errorMessage: string | undefined;
  let status = "failed";

  try {
    const credentials = btoa(`${accountSid}:${authToken}`);
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toPhone,
          From: fromPhone,
          Body: body,
        }).toString(),
      },
    );
    if (res.ok) {
      const data = await res.json();
      twilioSid = data.sid;
      status = "sent";
    } else {
      errorMessage = await res.text();
    }
  } catch (err) {
    errorMessage = String(err);
  }

  try {
    await supabase.from("sms_notifications").insert({
      user_id: userId,
      to_phone: toPhone,
      body,
      status,
      twilio_sid: twilioSid ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (_) {
    // logging failure must never break the primary flow
  }
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const siteUrl = Deno.env.get("SITE_URL") ?? "https://aydt.com";
const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "admin@aydt.nyc";
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "admin@aydt.nyc";

/* -------------------------------------------------------------------------- */
/* EPG server-to-server charge helper (inline — Deno can't import Node utils) */
/* Uses btoa() for HTTP Basic auth, same pattern as sendSmsViaApi above.      */
/* Ref: docs/elavon/api_transactions.md                                       */
/* -------------------------------------------------------------------------- */

async function chargeInstallmentEpg(params: {
  storedMethodHref: string;
  storedMethodType: "card" | "ach";
  shopperHref: string;
  amountDollars: number;
  installmentId: string;
  installmentNumber: number;
}): Promise<{
  success: boolean;
  transactionId?: string;
  errorDetail?: string;
  httpStatus?: number;
  raw?: unknown;
}> {
  const alias = Deno.env.get("EPG_MERCHANT_ALIAS");
  const key = Deno.env.get("EPG_SECRET_KEY");
  const baseUrl = Deno.env.get("EPG_BASE_URL");

  if (!alias || !key || !baseUrl) {
    return { success: false, errorDetail: "EPG env vars not configured" };
  }

  const auth = "Basic " + btoa(`${alias}:${key}`);
  const paymentMethodKey = params.storedMethodType === "card" ? "storedCard" : "storedAchPayment";

  try {
    const res = await fetch(`${baseUrl}/transactions`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "Accept": "application/json;charset=UTF-8",
        "Accept-Version": "1",
      },
      body: JSON.stringify({
        [paymentMethodKey]: params.storedMethodHref,
        shopper: params.shopperHref,
        total: {
          amount: params.amountDollars.toFixed(2),
          currencyCode: "USD",
        },
        // Merchant-initiated recurring charge (no cardholder present in this
        // cron). Required to exempt the charge from 3DS2 enforcement, otherwise
        // it is declined with `3dsEnforcedOnEcommerceSales`. Accepted values
        // confirmed by Elavon (Justin Huffines, 2026-05-30). Mirrors
        // createEpgTransaction in utils/payment/epg.ts.
        credentialOnFileType: "recurring",
        shopperInteraction: "merchantInitiated",
        customReference: params.installmentId,
        description: `AYDT Installment ${params.installmentNumber}`,
        doCapture: true,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { failures?: { code: string }[] };
      return {
        success: false,
        errorDetail: errBody.failures?.[0]?.code ?? `HTTP ${res.status}`,
        httpStatus: res.status,
        raw: errBody,
      };
    }

    const txn = await res.json() as {
      id: string;
      isAuthorized: boolean;
      state: string;
      failures?: { code: string }[];
    };

    if (txn.isAuthorized) return { success: true, transactionId: txn.id };
    return {
      success: false,
      errorDetail: txn.failures?.[0]?.code ?? txn.state,
      httpStatus: res.status,
      raw: txn,
    };
  } catch (err) {
    return {
      success: false,
      errorDetail: String(err),
      raw: { exception: String(err) },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Payment error logging (inline — Deno can't import @/utils paths).          */
/* COMPACT MIRROR of utils/payment/{classifyPaymentError,logPaymentError}.ts. */
/* Keep the rules here in sync with the canonical TS versions; the real       */
/* Elavon decline-code map + the unit tests live there.                       */
/* See docs/PAYMENT_ERROR_LOGGING_PLAN.md §4 & §5.                            */
/* -------------------------------------------------------------------------- */

// Hard/soft declines the admin can act on (update card / contact family).
const ADMIN_LANE_CODES: Record<string, { category: string; retryable: boolean }> = {
  insufficient_funds: { category: "insufficient_funds", retryable: true }, // soft
  expired_card: { category: "card_expired", retryable: false },
  pickup_card: { category: "decline", retryable: false },
  stolen_card: { category: "decline", retryable: false },
  invalid_account: { category: "decline", retryable: false },
  do_not_honor: { category: "decline", retryable: false },
  avs_mismatch: { category: "avs_cvv", retryable: false },
  cvv_mismatch: { category: "avs_cvv", retryable: false },
  token_expired: { category: "token_expired", retryable: false },
  token_not_found: { category: "token_expired", retryable: false },
};

function classifyChargeError(
  errorCode: string | undefined,
  httpStatus: number | undefined,
): {
  category: string;
  ownerLane: "admin" | "dev";
  severity: "info" | "warning" | "critical";
  isRetryable: boolean;
} {
  const key = errorCode?.trim().toLowerCase();
  if (key && ADMIN_LANE_CODES[key]) {
    const m = ADMIN_LANE_CODES[key];
    return { category: m.category, ownerLane: "admin", severity: "warning", isRetryable: m.retryable };
  }
  // Transport-level failures from the gateway → dev lane, retryable.
  if (httpStatus != null && (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429)) {
    return { category: "network", ownerLane: "dev", severity: "critical", isRetryable: true };
  }
  // Keyword heuristics on the raw code/state string.
  const msg = (errorCode ?? "").toLowerCase();
  if (msg.includes("insufficient")) return { category: "insufficient_funds", ownerLane: "admin", severity: "warning", isRetryable: true };
  if (msg.includes("expired")) return { category: "card_expired", ownerLane: "admin", severity: "warning", isRetryable: false };
  if (msg.includes("3ds") || msg.includes("three-d")) return { category: "3ds_mit", ownerLane: "dev", severity: "critical", isRetryable: false };
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("network")) return { category: "network", ownerLane: "dev", severity: "critical", isRetryable: true };
  if (msg.includes("token")) return { category: "token_expired", ownerLane: "admin", severity: "warning", isRetryable: false };
  // Conservative default: unknown gateway code → dev lane, NEVER auto-retry.
  return { category: "unknown", ownerLane: "dev", severity: "critical", isRetryable: false };
}

/**
 * Record ONE failed charge attempt. Best-effort: a logging failure must never
 * break the cron. Each attempt is its own row, chained to the prior attempt for
 * the same installment via retry_of (plan §5).
 */
async function logChargeError(params: {
  installmentId: string;
  installmentNumber: number;
  orderId: string | null;
  attemptNumber: number;
  errorDetail: string;
  httpStatus?: number;
  raw?: unknown;
}): Promise<void> {
  try {
    const c = classifyChargeError(params.errorDetail, params.httpStatus);

    // Link to the most recent prior failure for this installment, building the
    // retry chain across daily cron runs.
    const { data: prior } = await supabase
      .from("payment_error_logs")
      .select("id")
      .eq("installment_id", params.installmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("payment_error_logs").insert({
      origin: "gateway",
      source: "cron",
      category: c.category,
      owner_lane: c.ownerLane,
      severity: c.severity,
      order_id: params.orderId,
      installment_id: params.installmentId,
      installment_number: params.installmentNumber,
      error_code: params.errorDetail,
      error_message: params.errorDetail,
      http_status: params.httpStatus ?? null,
      raw_payload: params.raw ?? null,
      retry_of: prior?.id ?? null,
      retry_count: params.attemptNumber,
      is_retryable: c.isRetryable,
      status: "new",
    });
  } catch (logErr) {
    console.error(`[logChargeError] failed for installment ${params.installmentId}:`, logErr);
  }
}

/* -------------------------------------------------------------------------- */
/* Main handler                                                               */
/* -------------------------------------------------------------------------- */

Deno.serve(async (_req) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // 'YYYY-MM-DD'

    /* ------------------------------------------------------------------ */
    /* STEP 1 — Find installments that are past due and still 'scheduled'  */
    /* ------------------------------------------------------------------ */

    const { data: overdueRows, error: fetchError } = await supabase
      .from("order_payment_installments")
      .select(
        `id, installment_number, amount_due, due_date,
         registration_orders(
           id, semester_id,
           semesters:semester_id(name),
           users:parent_id(id, first_name, last_name, email, phone_number, sms_opt_in, sms_verified)
         )`,
      )
      .eq("status", "scheduled")
      .lt("due_date", today);

    if (fetchError) throw fetchError;

    if (!overdueRows || overdueRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0 }), {
        status: 200,
      });
    }

    /* ------------------------------------------------------------------ */
    /* STEP 2 — Mark all overdue installments                              */
    /* ------------------------------------------------------------------ */

    const overdueIds = overdueRows.map((r) => r.id);

    const { error: updateError } = await supabase
      .from("order_payment_installments")
      .update({ status: "overdue" })
      .in("id", overdueIds);

    if (updateError) throw updateError;

    /* ------------------------------------------------------------------ */
    /* STEP 3 — Charge overdue installments that have a stored method     */
    /* ------------------------------------------------------------------ */

    // Query all overdue installments (including ones from prior runs) that
    // have a stored payment method and haven't exhausted their 3 attempts.
    const { data: chargeable } = await supabase
      .from("order_payment_installments")
      .select(
        `id, installment_number, amount_due, charge_attempt_count,
         registration_orders!inner(
           id, parent_id,
           stored_payment_method_id,
           stored_payment_methods!registration_batches_stored_payment_method_id_fkey(
             id, epg_stored_href, type,
             shoppers(epg_shopper_href)
           )
         )`,
      )
      .eq("status", "overdue")
      .lt("charge_attempt_count", 3)
      .not("registration_orders.stored_payment_method_id", "is", null);

    const chargedInstallments: { parentEmail: string; amount: number; num: number }[] = [];
    const failedInstallments: { parentName: string; parentEmail: string; num: number; amount: number; error: string }[] = [];

    for (const row of chargeable ?? []) {
      const batch = Array.isArray(row.registration_orders)
        ? row.registration_orders[0]
        : row.registration_orders;
      if (!batch) continue;

      const storedMethod = Array.isArray((batch as any).stored_payment_methods)
        ? (batch as any).stored_payment_methods[0]
        : (batch as any).stored_payment_methods;
      if (!storedMethod?.epg_stored_href) continue;

      const shopper = Array.isArray(storedMethod.shoppers)
        ? storedMethod.shoppers[0]
        : storedMethod.shoppers;
      if (!shopper?.epg_shopper_href) continue;

      const result = await chargeInstallmentEpg({
        storedMethodHref: storedMethod.epg_stored_href,
        storedMethodType: storedMethod.type as "card" | "ach",
        shopperHref: shopper.epg_shopper_href,
        amountDollars: Number(row.amount_due),
        installmentId: row.id,
        installmentNumber: row.installment_number,
      });

      if (result.success) {
        await supabase
          .from("order_payment_installments")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            paid_amount: Number(row.amount_due),
            payment_reference_id: result.transactionId,
            transaction_id: result.transactionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        console.log(
          `[charge] installment ${row.id} paid — txn ${result.transactionId}`,
        );

        // #48 resolve-on-success: the balance is now collected, so clear any
        // open error rows for this installment (e.g. a prior declined attempt
        // this cron logged). Keeps the actionable Error Log free of self-
        // resolved recurring failures. Best-effort; service-role, no user.
        // Deno can't import the Node helper, so this mirrors resolveOpenPaymentErrors.
        try {
          await supabase
            .from("payment_error_logs")
            .update({
              status: "resolved",
              resolved_by: null,
              resolved_at: new Date().toISOString(),
              resolution_notes: `Resolved on payment success via recurring cron — txn ${result.transactionId ?? "n/a"}.`,
            })
            .eq("installment_id", row.id)
            .in("status", ["new", "acknowledged", "actioned"]);
        } catch (resolveErr) {
          console.error(`[charge] resolve-on-success failed for installment ${row.id}:`, resolveErr);
        }

        // Send receipt email to parent
        try {
          const { data: parent } = await supabase
            .from("users")
            .select("email, first_name")
            .eq("id", (batch as any).parent_id)
            .single();

          if (parent?.email) {
            await resend.emails.send({
              from: `AYDT Payments <${fromEmail}>`,
              to: parent.email,
              subject: `AYDT — Installment ${row.installment_number} Payment Processed`,
              html: `<p style="font-family:sans-serif;">Hi ${parent.first_name},</p>
                     <p style="font-family:sans-serif;">Your installment ${row.installment_number} payment of <strong>$${Number(row.amount_due).toFixed(2)}</strong> has been successfully processed.</p>
                     <p style="font-family:sans-serif;">Transaction ID: ${result.transactionId}</p>
                     <p style="font-family:sans-serif;">Thank you,<br>AYDT</p>`,
            });
            chargedInstallments.push({
              parentEmail: parent.email,
              amount: Number(row.amount_due),
              num: row.installment_number,
            });
          }
        } catch (emailErr) {
          console.error(`[charge] receipt email failed for installment ${row.id}:`, emailErr);
        }
      } else {
        const newCount = (row.charge_attempt_count ?? 0) + 1;
        const isFailed = newCount >= 3;

        await supabase
          .from("order_payment_installments")
          .update({
            charge_attempt_count: newCount,
            last_charge_error: result.errorDetail ?? "unknown",
            status: isFailed ? "failed" : "overdue",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        console.log(
          `[charge] installment ${row.id} declined (${result.errorDetail}) — attempt ${newCount}/3`,
        );

        // Record this attempt in the durable error log (one row per attempt).
        await logChargeError({
          installmentId: row.id,
          installmentNumber: row.installment_number,
          orderId: (batch as any).id ?? null,
          attemptNumber: newCount,
          errorDetail: result.errorDetail ?? "unknown",
          httpStatus: result.httpStatus,
          raw: result.raw,
        });

        if (isFailed) {
          // Fetch parent details for admin failure summary
          const { data: parent } = await supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", (batch as any).parent_id)
            .maybeSingle();

          failedInstallments.push({
            parentName: parent ? `${parent.first_name} ${parent.last_name}` : "Unknown",
            parentEmail: parent?.email ?? "",
            num: row.installment_number,
            amount: Number(row.amount_due),
            error: result.errorDetail ?? "unknown",
          });
        }
      }
    }

    /* ------------------------------------------------------------------ */
    /* STEP 4 — Build admin notification email                             */
    /* ------------------------------------------------------------------ */

    // Group installments by batch for readable summary
    type BatchGroup = {
      parentId: string;
      parentName: string;
      parentEmail: string;
      parentPhone: string | null;
      smsOptIn: boolean;
      smsVerified: boolean;
      semesterName: string;
      installments: { num: number; amount: number; dueDate: string }[];
    };

    const grouped = new Map<string, BatchGroup>();

    for (const row of overdueRows) {
      const batch = Array.isArray(row.registration_orders)
        ? row.registration_orders[0]
        : row.registration_orders;
      if (!batch) continue;

      const user = Array.isArray((batch as any).users)
        ? (batch as any).users[0]
        : (batch as any).users;
      const semester = Array.isArray((batch as any).semesters)
        ? (batch as any).semesters[0]
        : (batch as any).semesters;

      if (!grouped.has((batch as any).id)) {
        grouped.set((batch as any).id, {
          parentId: user?.id ?? "",
          parentName: user
            ? `${user.first_name} ${user.last_name}`
            : "Unknown",
          parentEmail: user?.email ?? "",
          parentPhone: (user as any)?.phone_number ?? null,
          smsOptIn: (user as any)?.sms_opt_in ?? false,
          smsVerified: (user as any)?.sms_verified ?? false,
          semesterName: semester?.name ?? "Unknown semester",
          installments: [],
        });
      }

      grouped.get((batch as any).id)!.installments.push({
        num: row.installment_number,
        amount: Number(row.amount_due),
        dueDate: row.due_date,
      });
    }

    const rows = [...grouped.values()];

    const tableRows = rows
      .map(
        (g) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${g.parentName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${g.parentEmail}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${g.semesterName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            ${g.installments.map((i) => `Payment ${i.num}: $${i.amount.toFixed(2)} (due ${i.dueDate})`).join("<br>")}
          </td>
        </tr>`,
      )
      .join("");

    const chargedSection = chargedInstallments.length > 0
      ? `<h3 style="font-family:sans-serif;color:#16a34a;">✓ Auto-charged (${chargedInstallments.length})</h3>
         <table style="font-family:sans-serif;border-collapse:collapse;width:100%;margin-bottom:16px;">
           <thead><tr style="background:#f0fdf4;text-align:left;">
             <th style="padding:8px 12px;">Parent Email</th>
             <th style="padding:8px 12px;">Installment</th>
             <th style="padding:8px 12px;">Amount</th>
           </tr></thead>
           <tbody>${chargedInstallments.map((c) => `
             <tr>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.parentEmail}</td>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">Payment ${c.num}</td>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">$${c.amount.toFixed(2)}</td>
             </tr>`).join("")}
           </tbody>
         </table>`
      : "";

    const failedSection = failedInstallments.length > 0
      ? `<h3 style="font-family:sans-serif;color:#dc2626;">✗ Charge Failed (3 attempts — manual review required)</h3>
         <table style="font-family:sans-serif;border-collapse:collapse;width:100%;margin-bottom:16px;">
           <thead><tr style="background:#fef2f2;text-align:left;">
             <th style="padding:8px 12px;">Parent</th>
             <th style="padding:8px 12px;">Email</th>
             <th style="padding:8px 12px;">Installment</th>
             <th style="padding:8px 12px;">Amount</th>
             <th style="padding:8px 12px;">Error</th>
           </tr></thead>
           <tbody>${failedInstallments.map((f) => `
             <tr>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">${f.parentName}</td>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">${f.parentEmail}</td>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">Payment ${f.num}</td>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">$${f.amount.toFixed(2)}</td>
               <td style="padding:8px 12px;border-bottom:1px solid #eee;">${f.error}</td>
             </tr>`).join("")}
           </tbody>
         </table>`
      : "";

    const html = `
      <h2 style="font-family:sans-serif;">AYDT — Overdue Payments Detected</h2>
      <p style="font-family:sans-serif;">${overdueIds.length} installment(s) became overdue today (${today}).</p>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#f5f5f5;text-align:left;">
            <th style="padding:8px 12px;">Parent</th>
            <th style="padding:8px 12px;">Email</th>
            <th style="padding:8px 12px;">Semester</th>
            <th style="padding:8px 12px;">Installments</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${chargedSection}
      ${failedSection}
      <p style="font-family:sans-serif;margin-top:16px;">
        <a href="${siteUrl}/admin/payments">View Payment Dashboard →</a>
      </p>
    `;

    await resend.emails.send({
      from: `AYDT Payments <${fromEmail}>`,
      to: adminEmail,
      subject: `[AYDT] ${overdueIds.length} Overdue Payment${overdueIds.length !== 1 ? "s" : ""} — ${today}`,
      html,
    });

    console.log(
      `process-overdue-payments: marked ${overdueIds.length} installments overdue`,
    );

    /* ------------------------------------------------------------------ */
    /* STEP 4 — Send SMS to opted-in parents                              */
    /* ------------------------------------------------------------------ */

    for (const group of grouped.values()) {
      if (!group.smsOptIn || !group.smsVerified || !group.parentPhone) continue;
      const count = group.installments.length;
      const smsMsg = `You have ${count} overdue payment${count > 1 ? "s" : ""} for ${group.semesterName}. Pay now: ${siteUrl}/payments`;
      await sendSmsViaApi(group.parentPhone, smsMsg, group.parentId);
    }

    return new Response(
      JSON.stringify({ ok: true, updated: overdueIds.length }),
      { status: 200 },
    );
  } catch (err) {
    console.error("process-overdue-payments error:", err);

    // Application-origin failure: the cron itself broke (DB/query/runtime), not a
    // gateway decline. Dev-actionable. Best-effort — never mask the original error.
    try {
      await supabase.from("payment_error_logs").insert({
        origin: "application",
        source: "cron",
        category: "unknown",
        owner_lane: "dev",
        severity: "critical",
        error_message: String(err),
        raw_payload: { stack: (err as Error)?.stack ?? null },
        retry_count: 0,
        is_retryable: false,
        status: "new",
      });
    } catch (_) {
      // logging failure must never break the primary flow
    }

    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
    });
  }
});
