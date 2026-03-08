"use server";

import { createClient } from "@/utils/supabase/server";
import { EmailSelectionCriteria, ManualUserEntry } from "@/types";

export async function previewRecipientCount(
  selections: EmailSelectionCriteria[],
  manualAdditions: ManualUserEntry[],
  exclusionIds: string[],
): Promise<number> {
  const supabase = await createClient();
  const userIdSet = new Set<string>();
  const excludedSet = new Set(exclusionIds);
  let externalSubscriberCount = 0;

  for (const sel of selections) {
    if (sel.type === "semester" && sel.semesterId) {
      const { data } = await supabase
        .from("registrations")
        .select("user_id, class_sessions!inner(semester_id)")
        .eq("class_sessions.semester_id", sel.semesterId);

      for (const reg of data ?? []) {
        if (!excludedSet.has(reg.user_id)) userIdSet.add(reg.user_id);
      }
    } else if (sel.type === "session" && sel.sessionId) {
      const { data } = await supabase
        .from("registrations")
        .select("user_id")
        .eq("session_id", sel.sessionId);

      for (const reg of data ?? []) {
        if (!excludedSet.has(reg.user_id)) userIdSet.add(reg.user_id);
      }
    } else if (sel.type === "subscribed_list") {
      // All portal users minus unsubscribed
      const { count: totalUsers } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true });

      const { count: unsubCount } = await supabase
        .from("email_subscriptions")
        .select("user_id", { count: "exact", head: true })
        .eq("is_subscribed", false);

      const subscribedPortalCount = (totalUsers ?? 0) - (unsubCount ?? 0);

      // Add those user IDs into the set isn't practical for large datasets;
      // we return the subscribed portal count + external count directly.
      const { count: extCount } = await supabase
        .from("email_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("is_subscribed", true);

      // Return early with combined count (subscribed_list is always the full list)
      return subscribedPortalCount + (extCount ?? 0);
    }
  }

  for (const user of manualAdditions) {
    if (user.userId && !excludedSet.has(user.userId)) userIdSet.add(user.userId);
    if (user.subscriberId) externalSubscriberCount++;
  }

  if (userIdSet.size === 0) return externalSubscriberCount;

  const { data: unsub } = await supabase
    .from("email_subscriptions")
    .select("user_id")
    .eq("is_subscribed", false)
    .in("user_id", Array.from(userIdSet));

  return userIdSet.size - (unsub?.length ?? 0) + externalSubscriberCount;
}
