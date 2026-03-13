"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export interface ClassMetaUpdate {
  name?: string;
  description?: string;
  min_age?: number | null;
  max_age?: number | null;
  min_grade?: number | null;
  max_grade?: number | null;
}

export async function updateClassMeta(
  classId: string,
  updates: ClassMetaUpdate
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("classes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", classId);

  if (error) {
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
