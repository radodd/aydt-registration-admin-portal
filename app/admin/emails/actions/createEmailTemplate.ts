"use server";

import { EmailDraft } from "@/types";
import { createClient } from "@/utils/supabase/server";

export async function createEmailTemplate(state: EmailDraft) {
  const supabase = await createClient();
  console.log("STATE in createEmailTemplate", state);
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized.");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || !["admin", "super_admin"].includes(admin.role)) {
    throw new Error("Unauthorized action.");
  }

  const { error } = await supabase.from("email_templates").insert({
    name: "Untitled Template",
    subject: state.setup?.subject,
    body_html: state.design?.bodyHtml,
    body_json: state.design?.bodyJson,
    created_by_admin_id: admin.id,
    updated_by_admin_id: admin.id,
  });

  if (error) throw new Error(error.message);
}
