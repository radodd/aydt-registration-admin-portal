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
    /* STEP 3 — Build admin notification email                             */
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
