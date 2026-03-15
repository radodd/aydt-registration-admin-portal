"use server";

import { createClient } from "@/utils/supabase/server";

export interface RequirementWaiverRow {
  id: string;
  dancer_id: string;
  dancer_name: string;
  notes: string | null;
  granted_at: string;
}

/**
 * Fetches all requirement_waivers for a given class_requirement, joined with
 * dancer first/last name for display in the admin UI.
 */
export async function getRequirementWaivers(
  classRequirementId: string,
): Promise<RequirementWaiverRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("requirement_waivers")
    .select("id, dancer_id, notes, granted_at, dancers(first_name, last_name)")
    .eq("class_requirement_id", classRequirementId)
    .order("granted_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => {
    const dancer = Array.isArray(row.dancers) ? row.dancers[0] : row.dancers;
    return {
      id: row.id,
      dancer_id: row.dancer_id,
      dancer_name: dancer
        ? `${dancer.first_name} ${dancer.last_name}`
        : row.dancer_id,
      notes: row.notes ?? null,
      granted_at: row.granted_at,
    };
  });
}
