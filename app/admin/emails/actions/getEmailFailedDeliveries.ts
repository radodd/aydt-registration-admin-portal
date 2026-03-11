"use server";

import { createClient } from "@/utils/supabase/server";

export type FailedDelivery = {
  emailAddress: string;
  failureReason: string | null;
};

export async function getEmailFailedDeliveries(
  emailId: string,
): Promise<FailedDelivery[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email_deliveries")
    .select("email_address, failure_reason")
    .eq("email_id", emailId)
    .eq("status", "failed")
    .order("email_address");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    emailAddress: row.email_address,
    failureReason: row.failure_reason ?? null,
  }));
}
