"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export async function createSemesterDraft() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("semesters")
    .insert({
      name: "Untitled Semester",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id;
}
