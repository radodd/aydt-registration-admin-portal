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
const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "admin@aydt.com";

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
}): Promise<{ success: boolean; transactionId?: string; errorDetail?: string }> {
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
    };
  } catch (err) {
    return { success: false, errorDetail: String(err) };
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
      .from("batch_payment_installments")
      .select(
        `id, installment_number, amount_due, due_date,
         registration_batches(
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
      .from("batch_payment_installments")
      .update({ status: "overdue" })
      .in("id", overdueIds);

    if (updateError) throw updateError;

    /* ------------------------------------------------------------------ */
    /* STEP 3 — Charge overdue installments that have a stored method     */
    /* ------------------------------------------------------------------ */

    // Query all overdue installments (including ones from prior runs) that
    // have a stored payment method and haven't exhausted their 3 attempts.
    const { data: chargeable } = await supabase
      .from("batch_payment_installments")
      .select(
        `id, installment_number, amount_due, charge_attempt_count,
         registration_batches!inner(
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
      .not("registration_batches.stored_payment_method_id", "is", null);

    const chargedInstallments: { parentEmail: string; amount: number; num: number }[] = [];
    const failedInstallments: { parentName: string; parentEmail: string; num: number; amount: number; error: string }[] = [];

    for (const row of chargeable ?? []) {
      const batch = Array.isArray(row.registration_batches)
        ? row.registration_batches[0]
        : row.registration_batches;
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
          .from("batch_payment_installments")
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

        // Send receipt email to parent
        try {
          const { data: parent } = await supabase
            .from("users")
            .select("email, first_name")
            .eq("id", (batch as any).parent_id)
            .single();

          if (parent?.email) {
            await resend.emails.send({
              from: "AYDT Payments <noreply@aydt.com>",
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
          .from("batch_payment_installments")
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
      const batch = Array.isArray(row.registration_batches)
        ? row.registration_batches[0]
        : row.registration_batches;
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
      from: "AYDT Payments <noreply@aydt.com>",
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
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
    });
  }
});
