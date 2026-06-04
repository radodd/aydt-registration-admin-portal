"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

/**
 * Meeting-plan #25: when an admin converts a waitlist entry into a real
 * registration via the manual registration flow (Register → /admin/register
 * ?fromWaitlist=), mark the source entry "registered" so it drops off the
 * waitlist (and the Classes-tab count) instead of lingering as "waiting".
 *
 * Mirrors the terminal step of the inline Path-B action
 * (registerWaitlistEntryInPortal), minus the registration itself — here the
 * registration is created by the flow's CheckoutStep, and this only resolves
 * the entry afterward. Idempotent: a second call is a harmless no-op.
 */
export async function markWaitlistEntryRegistered(
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: "registered" })
    .eq("id", entryId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
