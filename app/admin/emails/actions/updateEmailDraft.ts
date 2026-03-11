"use server";

import { createClient } from "@/utils/supabase/server";
import { EmailDraft } from "@/types";

export async function updateEmailDraft(
  emailId: string,
  draft: EmailDraft,
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || !["admin", "super_admin"].includes(admin.role)) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("emails")
    .update({
      subject: draft.setup?.subject ?? "",
      sender_name: draft.setup?.senderName ?? "",
      sender_email: draft.setup?.senderEmail ?? "",
      reply_to_email: draft.setup?.replyToEmail ?? null,
      include_signature: draft.setup?.includeSignature ?? false,
      body_html: draft.design?.bodyHtml ?? "",
      body_json: draft.design?.bodyJson ?? {},
      updated_by_admin_id: admin.id,
    })
    .eq("id", emailId);

  if (error) throw new Error(error.message);

  // Full replace of recipient selections
  await supabase
    .from("email_recipient_selections")
    .delete()
    .eq("email_id", emailId);

  const rows: Record<string, unknown>[] = [];

  for (const sel of draft.recipients?.selections ?? []) {
    rows.push({
      email_id: emailId,
      selection_type: sel.type,
      semester_id: sel.semesterId ?? null,
      class_id: sel.classId ?? null,
      session_id: sel.sessionId ?? null,
      instructor_name: sel.instructorName ?? null,
      user_id: null,
      include_instructors: sel.includeInstructors ?? false,
      is_excluded: false,
    });
  }

  for (const user of draft.recipients?.manualAdditions ?? []) {
    rows.push({
      email_id: emailId,
      selection_type: "manual",
      semester_id: null,
      class_id: null,
      session_id: null,
      user_id: user.userId ?? null,
      subscriber_id: user.subscriberId ?? null,
      is_excluded: false,
    });
  }

  for (const familyId of draft.recipients?.excludedFamilyIds ?? []) {
    rows.push({
      email_id: emailId,
      selection_type: "manual",
      semester_id: null,
      class_id: null,
      session_id: null,
      user_id: null,
      family_id: familyId,
      is_excluded: true,
    });
  }

  if (rows.length > 0) {
    const { error: selErr } = await supabase
      .from("email_recipient_selections")
      .insert(rows);
    if (selErr) throw new Error(selErr.message);
  }

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "edited",
    admin_id: admin.id,
  });
}
