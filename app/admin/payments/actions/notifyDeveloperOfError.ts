"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@madasacollective.com";
const DEV_EMAIL =
  process.env.DEVELOPER_NOTIFICATION_EMAIL ??
  process.env.ADMIN_NOTIFICATION_EMAIL ??
  "";

/**
 * Flag a dev-actionable payment error to the developer by email, and mark the
 * row 'actioned'. Admin or super-admin only.
 * See docs/PAYMENT_ERROR_LOGGING_PLAN.md §6 & §8.
 */
export async function notifyDeveloperOfError(
  errorLogId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: userRecord } = await supabase
    .from("users")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (userRecord?.role !== "admin" && userRecord?.role !== "super_admin") {
    return { error: "Insufficient permissions." };
  }

  if (!DEV_EMAIL) return { error: "No developer email configured." };

  const { data: log } = await supabase
    .from("payment_error_logs")
    .select(
      `id, created_at, origin, source, category, owner_lane, severity,
       order_id, installment_id, installment_number, transaction_id,
       error_code, error_message, http_status, retry_count`,
    )
    .eq("id", errorLogId)
    .single();

  if (!log) return { error: "Error not found." };

  const flaggedBy =
    `${userRecord?.first_name ?? ""} ${userRecord?.last_name ?? ""}`.trim() || "An admin";

  const row = (label: string, value: unknown) =>
    value == null || value === ""
      ? ""
      : `<tr><td style="padding:4px 12px;color:#6b7280;">${label}</td><td style="padding:4px 12px;font-family:monospace;">${String(value)}</td></tr>`;

  const html = `
    <h2 style="font-family:sans-serif;">AYDT — Payment error flagged for review</h2>
    <p style="font-family:sans-serif;">${flaggedBy} flagged a <strong>${log.severity}</strong> ${log.owner_lane}-lane payment error.</p>
    <table style="font-family:sans-serif;border-collapse:collapse;">
      ${row("Category", log.category)}
      ${row("Origin / source", `${log.origin} / ${log.source}`)}
      ${row("Error code", log.error_code)}
      ${row("Message", log.error_message)}
      ${row("HTTP status", log.http_status)}
      ${row("Attempt #", log.retry_count)}
      ${row("Installment", log.installment_number)}
      ${row("Transaction", log.transaction_id)}
      ${row("When", new Date(log.created_at).toLocaleString("en-US"))}
      ${row("Log id", log.id)}
    </table>`;

  const { error: sendErr } = await resend.emails.send({
    from: FROM,
    to: DEV_EMAIL,
    subject: `[AYDT] Payment error flagged — ${log.category} (${log.severity})`,
    html,
  });

  if (sendErr) return { error: sendErr.message };

  await supabase
    .from("payment_error_logs")
    .update({
      status: "actioned",
      resolution_notes: `Flagged to developer by ${flaggedBy}.`,
    })
    .eq("id", errorLogId);

  return {};
}
