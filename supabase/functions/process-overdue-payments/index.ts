import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
           users:parent_id(first_name, last_name, email)
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
      parentName: string;
      parentEmail: string;
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
          parentName: user
            ? `${user.first_name} ${user.last_name}`
            : "Unknown",
          parentEmail: user?.email ?? "",
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
