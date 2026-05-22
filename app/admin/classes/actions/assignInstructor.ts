"use server";

import { createAdminClient } from "@/utils/supabase/admin";

export async function assignInstructorToSession(
  sessionId: string,
  userId: string,
  isLead: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("class_meeting_instructors")
    .insert({ meeting_id: sessionId, user_id: userId, is_lead: isLead });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Instructor already assigned to this session." };
    }
    return { success: false, error: error.message };
  }

  return { success: true };
}
