"use server";

import { createClient } from "@/utils/supabase/server";
import { EmailSubscriber, PaginatedResult } from "@/types";

const PAGE_SIZE = 20;

export async function listEmailSubscribers(
  page: number = 0,
  search: string = "",
): Promise<PaginatedResult<EmailSubscriber>> {
  const supabase = await createClient();

  let query = supabase
    .from("email_subscribers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (search.trim()) {
    query = query.or(
      `email.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%`,
    );
  }

  const { data, error, count } = await query.range(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE - 1,
  );

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as EmailSubscriber[],
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}
