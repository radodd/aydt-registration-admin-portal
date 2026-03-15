"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Creates (or updates) a requirement_waiver row for a specific dancer + requirement.
 * Idempotent — if a waiver already exists for the pair, the notes are updated.
 */
export async function grantRequirementWaiver(
  classRequirementId: string,
  dancerId: string,
  notes?: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("requirement_waivers")
    .upsert(
      {
        class_requirement_id: classRequirementId,
        dancer_id: dancerId,
        granted_by_admin_id: user?.id ?? null,
        notes: notes ?? null,
      },
      { onConflict: "class_requirement_id,dancer_id" },
    );

  if (error) throw new Error(error.message);
}
