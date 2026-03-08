"use server";

import { createClient } from "@/utils/supabase/server";

export async function removeEmailSubscriber(subscriberId: string): Promise<void> {
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
    .from("email_subscribers")
    .delete()
    .eq("id", subscriberId);

  if (error) throw new Error(error.message);
}
