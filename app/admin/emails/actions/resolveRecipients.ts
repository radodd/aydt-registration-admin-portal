"use server";

import { createClient } from "@/utils/supabase/server";

export type ResolvedRecipient = {
  userId: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
};

interface ResolveRecipientsOptions {
  /** When true, skip the email_subscriptions filter — sends to unsubscribed users too. */
  overrideUnsubscribe?: boolean;
}

export async function resolveRecipients(
  emailId: string,
  options: ResolveRecipientsOptions = {},
): Promise<ResolvedRecipient[]> {
  const supabase = await createClient();

  const { data: selections, error: selErr } = await supabase
    .from("email_recipient_selections")
    .select("*")
    .eq("email_id", emailId)
    .eq("is_excluded", false);

  if (selErr) throw new Error(selErr.message);

  const { data: excluded } = await supabase
    .from("email_recipient_selections")
    .select("user_id")
    .eq("email_id", emailId)
    .eq("is_excluded", true);

  const excludedIds = new Set(
    (excluded ?? []).map((e) => e.user_id).filter(Boolean) as string[],
  );

  const userMap = new Map<string, ResolvedRecipient>();

  for (const sel of selections ?? []) {
    if (sel.selection_type === "manual" && sel.user_id) {
      if (excludedIds.has(sel.user_id) || userMap.has(sel.user_id)) continue;

      const { data: user } = await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("id", sel.user_id)
        .single();

      if (user) {
        userMap.set(user.id, {
          userId: user.id,
          emailAddress: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }
    } else if (sel.selection_type === "semester" && sel.semester_id) {
      const { data: registrations } = await supabase
        .from("registrations")
        .select(
          "user_id, users!registrations_user_id_fkey(id, email, first_name, last_name), class_sessions!inner(semester_id)",
        )
        .eq("class_sessions.semester_id", sel.semester_id);

      for (const reg of registrations ?? []) {
        const user = Array.isArray(reg.users) ? reg.users[0] : reg.users;
        if (!user || excludedIds.has(user.id) || userMap.has(user.id)) continue;
        userMap.set(user.id, {
          userId: user.id,
          emailAddress: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }
    } else if (sel.selection_type === "session" && sel.session_id) {
      const { data: registrations } = await supabase
        .from("registrations")
        .select(
          "user_id, users!registrations_user_id_fkey(id, email, first_name, last_name)",
        )
        .eq("session_id", sel.session_id);

      for (const reg of registrations ?? []) {
        const user = Array.isArray(reg.users) ? reg.users[0] : reg.users;
        if (!user || excludedIds.has(user.id) || userMap.has(user.id)) continue;
        userMap.set(user.id, {
          userId: user.id,
          emailAddress: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }
    }
  }

  const allUserIds = Array.from(userMap.keys());
  if (allUserIds.length === 0) return [];

  // Skip subscription filter when admin explicitly overrides (e.g. re-sending to unsubscribed)
  if (options.overrideUnsubscribe) {
    return Array.from(userMap.values());
  }

  const { data: unsubscribed } = await supabase
    .from("email_subscriptions")
    .select("user_id")
    .eq("is_subscribed", false)
    .in("user_id", allUserIds);

  const unsubIds = new Set((unsubscribed ?? []).map((u) => u.user_id));

  return Array.from(userMap.values()).filter((r) => !unsubIds.has(r.userId));
}
