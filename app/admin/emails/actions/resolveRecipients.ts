"use server";

import { createClient } from "@/utils/supabase/server";

export type ResolvedRecipient = {
  userId: string | null;
  subscriberId?: string;
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

  // userMap keyed by userId — for portal account holders
  const userMap = new Map<string, ResolvedRecipient>();
  // subscriberMap keyed by subscriberId — for external one-off subscribers
  const subscriberMap = new Map<string, ResolvedRecipient>();

  for (const sel of selections ?? []) {
    if (sel.selection_type === "manual" && sel.subscriber_id) {
      if (subscriberMap.has(sel.subscriber_id)) continue;

      const { data: sub } = await supabase
        .from("email_subscribers")
        .select("id, email, name")
        .eq("id", sel.subscriber_id)
        .single();

      if (sub) {
        const nameParts = (sub.name ?? "").trim().split(/\s+/);
        subscriberMap.set(sub.id, {
          userId: null,
          subscriberId: sub.id,
          emailAddress: sub.email,
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" "),
        });
      }
    } else if (sel.selection_type === "manual" && sel.user_id) {
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
    } else if (sel.selection_type === "subscribed_list") {
      // All portal account holders who haven't unsubscribed
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, email, first_name, last_name");

      for (const user of allUsers ?? []) {
        if (excludedIds.has(user.id) || userMap.has(user.id)) continue;
        userMap.set(user.id, {
          userId: user.id,
          emailAddress: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }

      // All active external subscribers
      const { data: externalSubs } = await supabase
        .from("email_subscribers")
        .select("id, email, name")
        .eq("is_subscribed", true);

      for (const sub of externalSubs ?? []) {
        if (subscriberMap.has(sub.id)) continue;
        const nameParts = (sub.name ?? "").trim().split(/\s+/);
        subscriberMap.set(sub.id, {
          userId: null,
          subscriberId: sub.id,
          emailAddress: sub.email,
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" "),
        });
      }
    }
  }

  const allUserIds = Array.from(userMap.keys());

  // Apply unsubscribe filter to portal account holders
  let filteredUsers: ResolvedRecipient[];
  if (allUserIds.length === 0) {
    filteredUsers = [];
  } else if (options.overrideUnsubscribe) {
    filteredUsers = Array.from(userMap.values());
  } else {
    const { data: unsubscribed } = await supabase
      .from("email_subscriptions")
      .select("user_id")
      .eq("is_subscribed", false)
      .in("user_id", allUserIds);

    const unsubIds = new Set((unsubscribed ?? []).map((u) => u.user_id));
    filteredUsers = Array.from(userMap.values()).filter(
      (r) => !unsubIds.has(r.userId!),
    );
  }

  // Deduplicate: if an external subscriber email already appears in the portal
  // user list, prefer the portal record (which has unsubscribe state)
  const seenEmails = new Set(filteredUsers.map((r) => r.emailAddress.toLowerCase()));
  const filteredSubscribers = Array.from(subscriberMap.values()).filter(
    (r) => !seenEmails.has(r.emailAddress.toLowerCase()),
  );

  return [...filteredUsers, ...filteredSubscribers];
}
