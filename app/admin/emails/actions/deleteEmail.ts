"use server";

import { createClient } from "@/utils/supabase/server";

export async function deleteEmail(emailId: string): Promise<void> {
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
      deleted_at: new Date().toISOString(),
      updated_by_admin_id: admin.id,
    })
    .eq("id", emailId);

  if (error) throw new Error(error.message);

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "deleted",
    admin_id: admin.id,
  });
}
