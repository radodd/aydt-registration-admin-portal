"use server";

import { createClient } from "@/utils/supabase/server";

export async function archiveClass(
  classId: string,
  archive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("classes")
    .update({ is_active: !archive })
    .eq("id", classId);

  if (error) {
    // DB trigger fires when semester is published + has registrations
    if (error.message.includes("published")) {
      return {
        success: false,
        error:
          "Cannot modify this class — the semester is published and has active registrations.",
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true };
}
