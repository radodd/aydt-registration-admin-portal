"use server";

import { createClient } from "@/utils/supabase/server";

export async function initEmailForClass(
  classId: string,
  subject: string,
  opts?: { bodyHtml?: string; bodyJson?: Record<string, unknown> }
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

  // Create draft email
  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .insert({
      subject,
      body_html: opts?.bodyHtml ?? null,
      body_json: opts?.bodyJson ?? null,
      status: "draft",
      created_by_admin_id: admin.id,
      updated_by_admin_id: admin.id,
    })
    .select("id")
    .single();

  if (emailErr || !email) throw new Error(emailErr?.message ?? "Failed to create email draft");

  // Fetch all class_sessions for this class
  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("class_id", classId);

  // Insert one recipient selection per class_session
  if ((sessions ?? []).length > 0) {
    const selections = (sessions ?? []).map((s) => ({
      email_id: email.id,
      selection_type: "session" as const,
      session_id: s.id,
      is_excluded: false,
    }));
    await supabase.from("email_recipient_selections").insert(selections);
  }

  await supabase.from("email_activity_logs").insert({
    email_id: email.id,
    action: "created",
    admin_id: admin.id,
    metadata: { source: "class_detail", class_id: classId },
  });

  return { emailId: email.id };
}
