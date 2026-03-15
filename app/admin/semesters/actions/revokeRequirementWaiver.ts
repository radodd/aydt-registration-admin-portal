"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Deletes a requirement_waiver row by its id.
 */
export async function revokeRequirementWaiver(waiverId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("requirement_waivers")
    .delete()
    .eq("id", waiverId);

  if (error) throw new Error(error.message);
}
