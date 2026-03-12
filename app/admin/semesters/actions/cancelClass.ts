"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";
import { sendSms } from "@/utils/sendSms";

interface FamilyEntry {
  userId: string;
  email: string;
  firstName: string;
  phone: string | null;
  smsOptIn: boolean;
  smsVerified: boolean;
}

/**
 * Cancel a class session and notify all enrolled families via email + SMS.
 *
 * @param sessionId  ID of the class_session to cancel
 * @param reason     Admin-provided reason shown in notifications
 * @returns          Count of families notified, or an error string
 */
export async function cancelClass(
  sessionId: string,
  reason: string
): Promise<{ notified?: number; error?: string }> {
  const supabase = await createClient();

  // Auth + role check
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { error: "Not authenticated" };

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || !["admin", "super_admin"].includes(currentUser.role)) {
    return { error: "Unauthorized" };
  }

  // 1. Mark session cancelled
  const { error: cancelErr } = await supabase
    .from("class_sessions")
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq("id", sessionId);

  if (cancelErr) return { error: cancelErr.message };

  // 2. Fetch session info for notification content
  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, classes(name), semesters(name)")
    .eq("id", sessionId)
    .single();

  const className =
    (Array.isArray(session?.classes)
      ? (session.classes[0] as { name?: string })?.name
      : (session?.classes as { name?: string } | null)?.name) ?? "your class";

  const semesterName =
    (Array.isArray(session?.semesters)
      ? (session.semesters[0] as { name?: string })?.name
      : (session?.semesters as { name?: string } | null)?.name) ?? "";

  // 3. Fetch active registrations → batches → parent users.
  //    Registrations point to ONE representative session per schedule (first occurrence).
  //    We must query by schedule_id so cancelling any occurrence finds all enrolled families.
  const { data: cancelledSession } = await supabase
    .from("class_sessions")
    .select("schedule_id")
    .eq("id", sessionId)
    .single();

  const scheduleId = (cancelledSession as any)?.schedule_id as string | null;
  console.log("[cancelClass] sessionId:", sessionId, "→ scheduleId:", scheduleId);

  // Get all session IDs in this schedule so we can find registrations regardless of
  // which occurrence the registration was originally attached to.
  let siblingSessions: string[] = [sessionId];
  if (scheduleId) {
    const { data: siblings } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("schedule_id", scheduleId);
    if (siblings && siblings.length > 0) {
      siblingSessions = siblings.map((s) => s.id);
    }
  }
  console.log("[cancelClass] siblingSessions count:", siblingSessions.length, "ids:", siblingSessions.slice(0, 3));

  const { data: registrations, error: regError } = await supabase
    .from("registrations")
    .select(
      "id, session_id, status, registration_batch_id, registration_batches!registrations_registration_batch_id_fkey(parent_id, users!registration_batches_parent_id_fkey(id, first_name, email, phone_number, sms_opt_in, sms_verified))"
    )
    .in("session_id", siblingSessions)
    .not("status", "in", '("declined","cancelled")')
    .not("registration_batch_id", "is", null);

  console.log("[cancelClass] registrations query error:", regError);
  console.log("[cancelClass] registrations found:", registrations?.length ?? 0);
  if (registrations && registrations.length > 0) {
    const sample = registrations[0] as any;
    console.log("[cancelClass] sample reg:", {
      id: sample.id,
      session_id: sample.session_id,
      status: sample.status,
      batch_id: sample.registration_batch_id,
      batch: sample.registration_batches,
    });
  }

  // 4. Deduplicate by user ID
  const familyMap = new Map<string, FamilyEntry>();

  for (const reg of registrations ?? []) {
    const batch = Array.isArray(reg.registration_batches)
      ? reg.registration_batches[0]
      : reg.registration_batches;
    if (!batch) continue;

    const parent = Array.isArray((batch as any).users)
      ? (batch as any).users[0]
      : (batch as any).users;
    if (!parent?.id || familyMap.has(parent.id)) continue;

    familyMap.set(parent.id, {
      userId: parent.id,
      email: parent.email,
      firstName: parent.first_name,
      phone: parent.phone_number ?? null,
      smsOptIn: parent.sms_opt_in ?? false,
      smsVerified: parent.sms_verified ?? false,
    });
  }

  // 5. Notify each family
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@aydt.com";
  let notified = 0;

  for (const family of familyMap.values()) {
    // Email (best-effort)
    try {
      await resend.emails.send({
        from: `AYDT Registration <${fromEmail}>`,
        to: family.email,
        subject: `Class Cancellation: ${className}`,
        html: buildCancellationEmailHtml({ className, semesterName, reason, parentFirstName: family.firstName }),
      });
    } catch (err) {
      console.error("[cancelClass] email failed for", family.email, err);
    }

    // SMS (best-effort)
    if (family.smsOptIn && family.smsVerified && family.phone) {
      const smsMsg = `${className} (${semesterName}) has been cancelled. Reason: ${reason}`;
      await sendSms(family.phone, smsMsg, family.userId);
    }

    notified++;
  }

  return { notified };
}

function buildCancellationEmailHtml(opts: {
  className: string;
  semesterName: string;
  reason: string;
  parentFirstName: string;
}): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;">
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px;">Hi ${opts.parentFirstName},</p>
                  <p style="margin:0 0 16px;">
                    We regret to inform you that <strong>${opts.className}</strong>
                    ${opts.semesterName ? `(${opts.semesterName})` : ""} has been <strong>cancelled</strong>.
                  </p>
                  <p style="margin:0 0 16px;"><strong>Reason:</strong> ${opts.reason}</p>
                  <p style="margin:0 0 16px;">
                    Please contact us if you have questions or would like to explore alternative classes.
                  </p>
                  <p style="margin:0;">— The AYDT Team</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
