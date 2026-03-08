"use server";

import { createClient } from "@/utils/supabase/server";
import { PaginatedResult, SubscriptionListRow } from "@/types";

const PAGE_SIZE = 20;

export async function listUnsubscribed(
  page: number = 0,
): Promise<PaginatedResult<SubscriptionListRow>> {
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("email_subscriptions")
    .select("*, users(email, first_name, last_name)", { count: "exact" })
    .eq("is_subscribed", false)
    .order("unsubscribed_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as SubscriptionListRow[],
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}

export async function listSubscribed(
  page: number = 0,
): Promise<PaginatedResult<SubscriptionListRow>> {
  const supabase = await createClient();

  // Fetch all explicitly unsubscribed user IDs so we can exclude them.
  // Users with no record OR is_subscribed=true are considered subscribed.
  const { data: unsubRows } = await supabase
    .from("email_subscriptions")
    .select("user_id")
    .eq("is_subscribed", false);

  const unsubIds = (unsubRows ?? []).map((r) => r.user_id as string);

  let query = supabase
    .from("users")
    .select(
      `id, email, first_name, last_name,
       email_subscriptions!left(is_subscribed, updated_at)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (unsubIds.length > 0) {
    query = query.not("id", "in", `(${unsubIds.join(",")})`);
  }

  const { data, error, count } = await query.range(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE - 1,
  );

  if (error) throw new Error(error.message);

  const mapped = (data ?? []).map((u) => {
    const sub = Array.isArray(u.email_subscriptions)
      ? u.email_subscriptions[0]
      : u.email_subscriptions;
    return {
      user_id: u.id,
      is_subscribed: sub?.is_subscribed ?? true,
      unsubscribed_at: null,
      updated_at: sub?.updated_at ?? new Date().toISOString(),
      users: {
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
      },
    } as SubscriptionListRow;
  });

  return {
    data: mapped,
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}
