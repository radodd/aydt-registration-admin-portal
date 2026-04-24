"use server";

import { createAdminClient } from "@/utils/supabase/admin";

export async function removeInstructorFromSession(
  sessionId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("class_session_instructors")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
