"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

type AutosaveField = "registration_form" | "confirmation_email" | "waitlist_settings";

export async function autosaveSemesterField(
  semesterId: string,
  field: AutosaveField,
  value: object,
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("semesters")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", semesterId);

  if (error) throw new Error(error.message);
}
