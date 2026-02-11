"use server";

import { createClient } from "@/utils/supabase/server";

export async function createSemesterDraft() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("semesters")
    .insert({
      name: "Untitled Semester",
      is_published: false,
      is_active: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id;
}
