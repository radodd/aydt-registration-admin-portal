"use server";

import { createClient } from "@/utils/supabase/server";

export async function publishSemester(semesterId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("publish_semester", {
    p_semester_id: semesterId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
