"use server";

import { createAdminClient } from "@/utils/supabase/admin";

interface CheckParentResult {
  exists: boolean;
  parentId: string | null;
}

/**
 * Checks whether a parent record exists for the given email.
 * Returns the user's id if found, null otherwise.
 */
export async function checkParentByEmail(
  email: string,
): Promise<CheckParentResult> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (data) {
    return { exists: true, parentId: data.id };
  }

  return { exists: false, parentId: null };
}
