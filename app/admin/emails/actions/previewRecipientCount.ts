"use server";

import { createClient } from "@/utils/supabase/server";
import { EmailSelectionCriteria, ManualUserEntry } from "@/types";

export async function previewRecipientCount(
  selections: EmailSelectionCriteria[],
  manualAdditions: ManualUserEntry[],
  excludedFamilyIds: string[],
): Promise<number> {
  const supabase = await createClient();
  const familyIdSet = new Set<string>();
  const excludedSet = new Set(excludedFamilyIds);
  let externalSubscriberCount = 0;

  for (const sel of selections) {
    if (sel.type === "semester" && sel.semesterId) {
      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("semester_id", sel.semesterId);

      const sessionIds = (sessions ?? []).map((s) => s.id);

      if (sessionIds.length === 0) continue;

      const { data } = await supabase
        .from("registrations")
        .select("dancers!inner(family_id)")
        .in("session_id", sessionIds)
        .eq("status", "confirmed");

      for (const reg of data ?? []) {
        const dancer = Array.isArray(reg.dancers)
          ? reg.dancers[0]
          : reg.dancers;
        const familyId = dancer?.family_id as string | undefined;
        if (familyId && !excludedSet.has(familyId)) familyIdSet.add(familyId);
      }
    } else if (sel.type === "class" && sel.classId) {
      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("class_id", sel.classId);

      const sessionIds = (sessions ?? []).map((s) => s.id);

      const { data } = await supabase
        .from("registrations")
        .select("dancers!inner(family_id)")
        .in("session_id", sessionIds)
        .eq("status", "confirmed");
      for (const reg of data ?? []) {
        const dancer = Array.isArray(reg.dancers)
          ? reg.dancers[0]
          : reg.dancers;
        const familyId = dancer?.family_id as string | undefined;
        if (familyId && !excludedSet.has(familyId)) familyIdSet.add(familyId);
      }
    } else if (sel.type === "session" && sel.sessionId) {
      const { data } = await supabase
        .from("registrations")
        .select("dancers!inner(family_id)")
        .eq("session_id", sel.sessionId)
        .eq("status", "confirmed");

      for (const reg of data ?? []) {
        const dancer = Array.isArray(reg.dancers)
          ? reg.dancers[0]
          : reg.dancers;

        const familyId = dancer?.family_id as string | undefined;

        if (familyId && !excludedSet.has(familyId)) {
          familyIdSet.add(familyId);
        }
      }
    } else if (sel.type === "subscribed_list") {
      // Count distinct families with a primary parent that has an active subscription
      const { count: totalFamilies } = await supabase
        .from("users")
        .select("family_id", { count: "exact", head: true })
        .eq("is_primary_parent", true);

      const { count: unsubCount } = await supabase
        .from("email_subscriptions")
        .select("user_id", { count: "exact", head: true })
        .eq("is_subscribed", false);

      const subscribedFamilyCount = (totalFamilies ?? 0) - (unsubCount ?? 0);

      const { count: extCount } = await supabase
        .from("email_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("is_subscribed", true);

      return subscribedFamilyCount + (extCount ?? 0);
    }
  }

  // Manual portal user additions
  for (const user of manualAdditions) {
    if (user.userId) {
      const { data } = await supabase
        .from("users")
        .select("family_id")
        .eq("id", user.userId)
        .single();
      const familyId = (data as { family_id: string } | null)?.family_id;
      if (familyId && !excludedSet.has(familyId)) familyIdSet.add(familyId);
    }
    if (user.subscriberId) externalSubscriberCount++;
  }

  if (familyIdSet.size === 0) return externalSubscriberCount;

  // Get primary parent user IDs for the family set to check unsubscribes
  const { data: primaryUsers } = await supabase
    .from("users")
    .select("id, family_id")
    .eq("is_primary_parent", true)
    .in("family_id", Array.from(familyIdSet));

  const primaryUserIds = (primaryUsers ?? []).map((u: { id: string }) => u.id);

  const { data: unsub } = primaryUserIds.length
    ? await supabase
        .from("email_subscriptions")
        .select("user_id")
        .eq("is_subscribed", false)
        .in("user_id", primaryUserIds)
    : { data: [] };

  return familyIdSet.size - (unsub?.length ?? 0) + externalSubscriberCount;
}
