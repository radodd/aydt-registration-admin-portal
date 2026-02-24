"use server";

import { createClient } from "@/utils/supabase/server";

export async function updateSubscription(
  userId: string,
  isSubscribed: boolean,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("email_subscriptions").upsert(
    {
      user_id: userId,
      is_subscribed: isSubscribed,
      unsubscribed_at: isSubscribed ? null : new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}
