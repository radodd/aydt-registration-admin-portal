"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { revalidatePath } from "next/cache";

/**
 * Mark one waitlist-promotion event as triaged. Mirrors markWarningReviewed.
 */
export async function markPromotionEventReviewed(eventId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase
    .from("waitlist_promotion_events")
    .update({
      is_reviewed: true,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  revalidatePath("/admin/logs");
}

/**
 * Mark all unreviewed error/warn events as triaged (info events are never
 * "unreviewed" in the badge, but the bulk action clears everything outstanding).
 */
export async function markAllPromotionEventsReviewed() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase
    .from("waitlist_promotion_events")
    .update({
      is_reviewed: true,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("is_reviewed", false);

  revalidatePath("/admin/logs");
}
