"use server";

import { createClient } from "@/utils/supabase/server";
import { requireInstructor } from "@/utils/requireInstructor";

export async function updateInstructorPhone(
  phone: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await requireInstructor();
    const supabase   = await createClient();

    const { error } = await supabase
      .from("users")
      .update({ phone_number: phone.trim() || null })
      .eq("id", userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    return { success: false, error: "Unauthorized" };
  }
}
