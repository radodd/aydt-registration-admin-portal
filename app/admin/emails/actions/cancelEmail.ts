"use server";

import { createClient } from "@/utils/supabase/server";

export async function cancelEmail(emailId: string): Promise<void> {
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

  if (adminErr || !admin || admin.role !== "super_admin") {
    throw new Error("Unauthorized: Super Admin only");
  }

  const { data: updated, error } = await supabase
    .from("emails")
    .update({ status: "cancelled", updated_by_admin_id: admin.id })
    .eq("id", emailId)
    .eq("status", "scheduled")
    .select("id");

  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0)
    throw new Error("Email is not in a scheduled state.");

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "cancelled",
    admin_id: admin.id,
  });
}
