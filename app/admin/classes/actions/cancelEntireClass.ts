"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";
import { sendSms } from "@/utils/sendSms";
import { requireAdmin } from "@/utils/requireAdmin";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

interface FamilyEntry {
  userId: string;
  email: string;
  firstName: string;
  phone: string | null;
  smsOptIn: boolean;
  smsVerified: boolean;
}

/**
 * Cancel an entire class and notify all enrolled families via email + SMS.
 *
 * @param classId  ID of the class to cancel
 * @param reason   Admin-provided reason shown in notifications
 */
export async function cancelEntireClass(
  classId: string,
  reason: string
): Promise<{ notified?: number; className?: string; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Unauthorized" };
  }

  const supabase = await createClient();

  // 1. Fetch class + semester info for notification content
  const { data: cls, error: clsError } = await supabase
    .from("classes")
    .select("id, name, semesters(name)")
    .eq("id", classId)
    .single();

  if (clsError || !cls) return { error: clsError?.message ?? "Class not found" };

  const className = (cls as any).name as string;
  const semesterName = Array.isArray((cls as any).semesters)
    ? ((cls as any).semesters[0] as { name?: string })?.name ?? ""
    : ((cls as any).semesters as { name?: string } | null)?.name ?? "";

  // 2. Get all session IDs for this class
  const { data: sessions } = await supabase
    .from("class_meetings")
    .select("id")
    .eq("class_id", classId);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  // 3. Find all active registrations across every session
  const familyMap = new Map<string, FamilyEntry>();

  if (sessionIds.length > 0) {
    const { data: registrations } = await supabase
      .from("meeting_enrollments")
      .select(
        "id, meeting_id, status, registration_batch_id, registration_orders!registrations_registration_batch_id_fkey(family_id, parent_id, users!registration_batches_parent_id_fkey(id, first_name, last_name, email, phone_number, sms_opt_in, sms_verified))"
      )
      .in("meeting_id", sessionIds)
      .not("status", "in", '("declined","cancelled")')
      .not("registration_batch_id", "is", null);

    for (const reg of registrations ?? []) {
      const batch = Array.isArray(reg.registration_orders)
        ? reg.registration_orders[0]
        : reg.registration_orders;
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
  }

  // 4. Mark class inactive (best-effort — may be blocked by DB trigger if semester is published)
  const { error: updateErr } = await supabase
    .from("classes")
    .update({ is_active: false })
    .eq("id", classId);

  if (updateErr) {
    console.warn("[cancelEntireClass] could not set is_active=false:", updateErr.message);
  }

  // 5. Notify each unique family
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@aydt.com";
  let notified = 0;

  for (const family of familyMap.values()) {
    try {
      await resend.emails.send({
        from: `AYDT Registration <${fromEmail}>`,
        to: family.email,
        subject: `Class Cancellation: ${className}`,
        html: buildCancellationEmailHtml({
          className,
          semesterName,
          reason,
          parentFirstName: family.firstName,
        }),
      });
    } catch (err) {
      console.error("[cancelEntireClass] email failed for", family.email, err);
    }

    if (family.smsOptIn && family.smsVerified && family.phone) {
      const smsMsg = `${className} (${semesterName}) has been cancelled. Reason: ${reason}`;
      await sendSms(family.phone, smsMsg, family.userId);
    }

    notified++;
  }

  return { notified, className };
}

function buildCancellationEmailHtml(opts: {
  className: string;
  semesterName: string;
  reason: string;
  parentFirstName: string;
}): string {
  const content = `
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
  `;
  return wrapEmailLayout(content);
}
