"use server";

import { createClient } from "@/utils/supabase/server";

export async function createEmailDraft(): Promise<{ emailId: string }> {
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

  const { data, error } = await supabase
    .from("emails")
    .insert({
      status: "draft",
      created_by_admin_id: admin.id,
      updated_by_admin_id: admin.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("email_activity_logs").insert({
    email_id: data.id,
    action: "created",
    admin_id: admin.id,
  });

  return { emailId: data.id };
}
