/**
 * Automatic payment-error notifications — see docs/PAYMENT_ERROR_LOGGING_PLAN.md §8.
 *
 * Called by logPaymentError AFTER a row is inserted. Two triggers, both
 * best-effort and both THROTTLED so a gateway outage can't cause an email storm:
 *
 *   1. Critical dev-lane error → notify the developer immediately, but only while
 *      fewer than MAX_CRITICAL_NOTIFS such errors have been logged in the last
 *      CRITICAL_WINDOW_MIN minutes (so a retry loop sends a few alerts, then
 *      goes quiet instead of flooding).
 *   2. Threshold escalation → when ONE entity (installment → order → family)
 *      reaches ENTITY_THRESHOLD failures within ENTITY_WINDOW_MIN, send a single
 *      escalation on the crossing (count === threshold), not on every later one.
 *
 * Never throws — notification failure must not affect the caller.
 */

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

// Lazy — constructing Resend at module load throws when RESEND_API_KEY is unset
// (e.g. in tests that transitively import this via logPaymentError). Defer it to
// the moment we actually send, inside the best-effort try/catch.
let _resend: Resend | null = null;
const getResend = (): Resend => (_resend ??= new Resend(process.env.RESEND_API_KEY!));
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@madasacollective.com";
const DEV_EMAIL =
  process.env.DEVELOPER_NOTIFICATION_EMAIL ??
  process.env.ADMIN_NOTIFICATION_EMAIL ??
  "";
const SITE_URL = process.env.SITE_URL ?? "https://aydt.com";

const ENTITY_WINDOW_MIN = 60;
const ENTITY_THRESHOLD = 3;
const CRITICAL_WINDOW_MIN = 10;
const MAX_CRITICAL_NOTIFS = 3;

/** Minimal shape of the row we just inserted. */
export interface NotifiableErrorRow {
  id: string;
  origin: string;
  source: string;
  category: string;
  owner_lane: string;
  severity: string;
  order_id: string | null;
  installment_id: string | null;
  family_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

export async function notifyPaymentError(
  supabase: SupabaseClient,
  row: NotifiableErrorRow,
): Promise<void> {
  try {
    if (!DEV_EMAIL) return;

    const reasons: string[] = [];

    // ── Trigger 2: threshold escalation by entity ──
    const entityField = row.installment_id
      ? "installment_id"
      : row.order_id
        ? "order_id"
        : row.family_id
          ? "family_id"
          : null;
    const entityVal = row.installment_id ?? row.order_id ?? row.family_id ?? null;

    if (entityField && entityVal) {
      const since = new Date(Date.now() - ENTITY_WINDOW_MIN * 60_000).toISOString();
      const { count } = await supabase
        .from("payment_error_logs")
        .select("id", { count: "exact", head: true })
        .eq(entityField, entityVal)
        .gte("created_at", since);
      if ((count ?? 0) === ENTITY_THRESHOLD) {
        reasons.push(
          `${ENTITY_THRESHOLD} failures for the same ${entityField.replace("_id", "")} within ${ENTITY_WINDOW_MIN} min`,
        );
      }
    }

    // ── Trigger 1: critical dev-lane error (throttled) ──
    if (row.severity === "critical" && row.owner_lane === "dev") {
      const since = new Date(Date.now() - CRITICAL_WINDOW_MIN * 60_000).toISOString();
      const { count } = await supabase
        .from("payment_error_logs")
        .select("id", { count: "exact", head: true })
        .eq("owner_lane", "dev")
        .eq("severity", "critical")
        .gte("created_at", since);
      if ((count ?? 0) <= MAX_CRITICAL_NOTIFS) {
        reasons.push("critical developer-lane error");
      }
    }

    if (reasons.length === 0) return;

    const detail = (label: string, value: unknown) =>
      value == null || value === ""
        ? ""
        : `<tr><td style="padding:4px 12px;color:#6b7280;">${label}</td><td style="padding:4px 12px;font-family:monospace;">${String(value)}</td></tr>`;

    const html = `
      <h2 style="font-family:sans-serif;">AYDT — Payment error alert</h2>
      <p style="font-family:sans-serif;">Triggered by: <strong>${reasons.join("; ")}</strong>.</p>
      <table style="font-family:sans-serif;border-collapse:collapse;">
        ${detail("Severity / lane", `${row.severity} / ${row.owner_lane}`)}
        ${detail("Category", row.category)}
        ${detail("Origin / source", `${row.origin} / ${row.source}`)}
        ${detail("Error code", row.error_code)}
        ${detail("Message", row.error_message)}
        ${detail("Order", row.order_id)}
        ${detail("Installment", row.installment_id)}
        ${detail("Family", row.family_id)}
        ${detail("Log id", row.id)}
      </table>
      <p style="font-family:sans-serif;margin-top:16px;">
        <a href="${SITE_URL}/admin/payments">Open the Error Log →</a>
      </p>`;

    await getResend().emails.send({
      from: FROM,
      to: DEV_EMAIL,
      subject: `[AYDT] Payment error alert — ${row.category} (${row.severity})`,
      html,
    });
  } catch (err) {
    console.error("[notifyPaymentError] failed:", err);
  }
}
