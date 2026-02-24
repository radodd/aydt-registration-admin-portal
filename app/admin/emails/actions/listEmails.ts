"use server";

import { createClient } from "@/utils/supabase/server";
import { EmailStatus, PaginatedResult, EmailListRow, EmailAnalyticsRow } from "@/types";

const PAGE_SIZE = 20;

export async function listEmails(
  status: EmailStatus,
  page: number = 0,
): Promise<PaginatedResult<EmailListRow>> {
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("emails")
    .select(
      `*,
       recipient_count:email_recipients(count),
       created_by:users!emails_created_by_admin_id_fkey(first_name, last_name),
       updated_by:users!emails_updated_by_admin_id_fkey(first_name, last_name)`,
      { count: "exact" },
    )
    .eq("status", status)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as EmailListRow[],
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}

export async function listSentEmails(
  page: number = 0,
): Promise<PaginatedResult<EmailAnalyticsRow>> {
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("email_analytics")
    .select("*", { count: "exact" })
    .order("sent_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as EmailAnalyticsRow[],
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}
