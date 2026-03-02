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

  // Subscribed = is_subscribed true OR no record (outer join via users)
  const { data, error, count } = await supabase
    .from("users")
    .select(
      `id, email, first_name, last_name,
       email_subscriptions!left(is_subscribed, updated_at)`,
      { count: "exact" },
    )
    .or(
      "email_subscriptions.is_subscribed.is.null,email_subscriptions.is_subscribed.eq.true",
    )
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

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
