"use server";

import { createClient } from "@/utils/supabase/server";

export async function saveReferralSource(source: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return;

  await supabase
    .from("users")
    .update({ referral_source: source })
    .eq("id", authUser.id)
    .is("referral_source", null);
}
