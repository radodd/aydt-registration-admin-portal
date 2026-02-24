"use server";

import { createClient } from "@/utils/supabase/server";

export async function cloneEmail(
  sourceEmailId: string,
): Promise<{ emailId: string }> {
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

  const { data: source, error: srcErr } = await supabase
    .from("emails")
    .select("*")
    .eq("id", sourceEmailId)
    .single();

  if (srcErr || !source) throw new Error("Source email not found");

  const { data: newEmail, error } = await supabase
    .from("emails")
    .insert({
      subject: `Copy of ${source.subject}`,
      body_html: source.body_html,
      body_json: source.body_json,
      status: "draft",
      sender_name: source.sender_name,
      sender_email: source.sender_email,
      reply_to_email: source.reply_to_email,
      include_signature: source.include_signature,
      created_by_admin_id: admin.id,
      updated_by_admin_id: admin.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Clone selection criteria — NOT the recipient snapshot
  const { data: selections } = await supabase
    .from("email_recipient_selections")
    .select("*")
    .eq("email_id", sourceEmailId);

  if (selections && selections.length > 0) {
    await supabase.from("email_recipient_selections").insert(
      selections.map((s) => ({
        email_id: newEmail.id,
        selection_type: s.selection_type,
        semester_id: s.semester_id,
        session_id: s.session_id,
        user_id: s.user_id,
        is_excluded: s.is_excluded,
      })),
    );
  }

  await supabase.from("email_activity_logs").insert({
    email_id: newEmail.id,
    action: "cloned",
    admin_id: admin.id,
    metadata: { cloned_from: sourceEmailId },
  });

  return { emailId: newEmail.id };
}
