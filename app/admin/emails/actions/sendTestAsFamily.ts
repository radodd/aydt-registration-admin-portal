"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";
import { DancerClassContext } from "@/types";
import { resolveEmailVariables } from "@/utils/resolveEmailVariables";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY!);

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const min = m ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min} ${ampm}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Sends a test email using real data from a specific family.
 * Uses the same variable resolution pipeline as production sends,
 * allowing admins to validate multi-dancer aggregation and template rendering.
 */
export async function sendTestAsFamily(
  emailId: string,
  familyId: string,
  toAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: "Unauthorized" };

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role, signature_html")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || !["admin", "super_admin"].includes(admin.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const { data: email, error } = await supabase
    .from("emails")
    .select("*")
    .eq("id", emailId)
    .single();

  if (error || !email) return { success: false, error: "Email not found" };

  // Get the primary parent for this family
  const { data: primaryParent } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .eq("family_id", familyId)
    .eq("is_primary_parent", true)
    .maybeSingle();

  // Get all dancers belonging to this family
  const { data: dancers } = await supabase
    .from("dancers")
    .select("id, first_name, last_name")
    .eq("family_id", familyId);

  const dancerIds = (dancers ?? []).map((d: { id: string }) => d.id);

  // Get active registrations for those dancers with class + semester context
  const { data: registrations } = dancerIds.length
    ? await supabase
        .from("registrations")
        .select(
          `dancer_id,
           class_sessions!inner(
             day_of_week,
             start_time,
             classes!inner(name),
             semesters!class_sessions_semester_id_fkey(name)
           )`,
        )
        .in("dancer_id", dancerIds)
        .neq("status", "cancelled")
    : { data: [] };

  // Build DancerClassContext[] keyed by dancer ID
  type DancerEntry = { dancerName: string; classes: { className: string; sessionLabel: string }[] };
  const dancerMap = new Map<string, DancerEntry>();

  for (const d of dancers ?? []) {
    const dancer = d as { id: string; first_name: string; last_name: string };
    dancerMap.set(dancer.id, {
      dancerName: `${dancer.first_name} ${dancer.last_name}`.trim(),
      classes: [],
    });
  }

  let firstSemesterName = "";
  let firstClassName = "";

  for (const reg of registrations ?? []) {
    const r = reg as { dancer_id: string; class_sessions: unknown };
    const cs = Array.isArray(r.class_sessions) ? r.class_sessions[0] : r.class_sessions;
    if (!cs) continue;

    const cls = Array.isArray((cs as any).classes)
      ? (cs as any).classes[0]
      : (cs as any).classes;
    const sem = Array.isArray((cs as any).semesters)
      ? (cs as any).semesters[0]
      : (cs as any).semesters;

    const sessionLabel = `${capitalize((cs as any).day_of_week ?? "")}${(cs as any).start_time ? ` ${formatTime((cs as any).start_time)}` : ""}`;

    if (cls && dancerMap.has(r.dancer_id)) {
      dancerMap.get(r.dancer_id)!.classes.push({
        className: cls.name as string,
        sessionLabel,
      });
    }

    if (!firstSemesterName && sem?.name) firstSemesterName = sem.name as string;
    if (!firstClassName && cls?.name) firstClassName = cls.name as string;
  }

  const dancerContext: DancerClassContext[] = Array.from(dancerMap.values()).filter(
    (d) => d.classes.length > 0,
  );

  // Build participant from first dancer for {{student_name}} backwards compat
  const firstDancer = dancerContext[0];
  const participantParts = firstDancer?.dancerName.split(" ") ?? [];

  const resolvedHtml = resolveEmailVariables(email.body_html, {
    parent: primaryParent
      ? {
          firstName: (primaryParent as any).first_name ?? "",
          lastName: (primaryParent as any).last_name ?? "",
        }
      : null,
    participant: firstDancer
      ? { firstName: participantParts[0] ?? "", lastName: participantParts.slice(1).join(" ") }
      : null,
    semester: firstSemesterName ? { name: firstSemesterName } : null,
    session: firstClassName ? { name: firstClassName } : null,
    dancers: dancerContext,
  });

  const signatureSuffix =
    email.include_signature && admin.signature_html
      ? `<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;"><div>${admin.signature_html}</div>`
      : "";

  const finalHtml = prepareEmailHtml(resolvedHtml + signatureSuffix);

  try {
    const { error: sendErr } = await resend.emails.send({
      from: `${email.sender_name || "AYDT Admin"} <${email.sender_email || "noreply@aydt.com"}>`,
      to: toAddress,
      subject: `[TEST] ${email.subject || "(no subject)"}`,
      html: finalHtml,
    });

    if (sendErr) return { success: false, error: sendErr.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }
}
