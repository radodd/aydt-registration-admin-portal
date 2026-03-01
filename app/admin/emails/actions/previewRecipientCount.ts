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

  for (const sel of selections) {
    if (sel.type === "semester") {
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
    }
  }

  for (const user of manualAdditions) {
    if (!excludedSet.has(user.userId)) userIdSet.add(user.userId);
  }

  if (userIdSet.size === 0) return 0;

  const { data: unsub } = await supabase
    .from("email_subscriptions")
    .select("user_id")
    .eq("is_subscribed", false)
    .in("user_id", Array.from(userIdSet));

  return userIdSet.size - (unsub?.length ?? 0);
}
