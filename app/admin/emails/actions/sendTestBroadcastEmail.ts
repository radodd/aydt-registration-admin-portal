"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";
import { resolveEmailVariables } from "@/utils/resolveEmailVariables";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendTestBroadcastEmail(
  emailId: string,
  toAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: "Unauthorized" };

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role, first_name, last_name, signature_html")
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

  // Fetch the first non-manual selection to resolve semester/session names
  const { data: selectionContext } = await supabase
    .from("email_recipient_selections")
    .select(
      `selection_type, semester_id, session_id,
       semesters:semester_id(name),
       sessions:session_id(name, semesters!sessions_semester_id_fkey(name))`,
    )
    .eq("email_id", emailId)
    .eq("is_excluded", false)
    .neq("selection_type", "manual")
    .limit(1)
    .maybeSingle();

  let semesterName = "";
  let sessionName = "";

  if (selectionContext) {
    if (selectionContext.selection_type === "semester") {
      const sem = Array.isArray(selectionContext.semesters)
        ? selectionContext.semesters[0]
        : selectionContext.semesters;
      semesterName = (sem as { name?: string } | null)?.name ?? "";
    } else if (selectionContext.selection_type === "session") {
      const sess = Array.isArray(selectionContext.sessions)
        ? selectionContext.sessions[0]
        : selectionContext.sessions;
      sessionName = (sess as { name?: string } | null)?.name ?? "";
      const parentSem = (
        sess as { semesters?: { name?: string } | { name?: string }[] } | null
      )?.semesters;
      const sem = Array.isArray(parentSem) ? parentSem[0] : parentSem;
      semesterName = sem?.name ?? "";
    }
  }

  // Use admin's own record as "parent" context for test sends
  const resolvedHtml = resolveEmailVariables(email.body_html, {
    parent: {
      firstName: admin.first_name ?? "",
      lastName: admin.last_name ?? "",
    },
    participant: null,
    semester: semesterName ? { name: semesterName } : null,
    session: sessionName ? { name: sessionName } : null,
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
