"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export type RemoveDancerResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function removeDancer(
  dancerId: string,
): Promise<RemoveDancerResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { count, error: regErr } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("dancer_id", dancerId)
    .neq("status", "cancelled");

  if (regErr) throw new Error(regErr.message);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      reason: "This dancer has active registrations and cannot be removed.",
    };
  }

  const { error } = await supabase
    .from("dancers")
    .delete()
    .eq("id", dancerId);

  if (error) throw new Error(error.message);

  return { ok: true };
}
