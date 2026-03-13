"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export async function removeParent(userId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: user, error: fetchErr } = await supabase
    .from("users")
    .select("is_primary_parent")
    .eq("id", userId)
    .single();

  if (fetchErr || !user) throw new Error("User not found");
  if (user.is_primary_parent) throw new Error("Cannot remove the primary parent");

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) throw new Error(error.message);
}
