"use server";

import { createClient } from "@/utils/supabase/server";

export async function setPrimaryParent(
  familyId: string,
  newPrimaryUserId: string,
): Promise<void> {
  const supabase = await createClient();

  // Demote current primary
  const { error: demoteErr } = await supabase
    .from("users")
    .update({ is_primary_parent: false })
    .eq("family_id", familyId)
    .eq("is_primary_parent", true);

  if (demoteErr) throw new Error(demoteErr.message);

  // Promote new primary
  const { error: promoteErr } = await supabase
    .from("users")
    .update({ is_primary_parent: true })
    .eq("id", newPrimaryUserId);

  if (promoteErr) throw new Error(promoteErr.message);
}
