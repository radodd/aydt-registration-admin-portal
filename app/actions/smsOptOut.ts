"use server";

import { createClient } from "@/utils/supabase/server";

/** Opt the current user out of SMS notifications. */
export async function smsOptOut(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("users")
    .update({ sms_opt_in: false, sms_verified: false })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return {};
}
