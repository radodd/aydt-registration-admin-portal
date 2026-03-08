"use server";

import { createClient } from "@supabase/supabase-js";

/**
 * Public unsubscribe action — no auth required.
 * Uses service role key to bypass RLS since the user is not signed in.
 */
export async function publicUnsubscribe(userId: string): Promise<void> {
  if (!userId) throw new Error("Missing userId");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the userId corresponds to a real user before unsubscribing.
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  if (userErr || !user) throw new Error("Invalid unsubscribe link.");

  const { error } = await supabase.from("email_subscriptions").upsert(
    {
      user_id: userId,
      is_subscribed: false,
      unsubscribed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}

/**
 * Public unsubscribe for external (non-account) subscribers.
 * Uses the subscriber's id from the email_subscribers table.
 */
export async function publicUnsubscribeExternal(subscriberId: string): Promise<void> {
  if (!subscriberId) throw new Error("Missing subscriberId");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: subscriber, error: subErr } = await supabase
    .from("email_subscribers")
    .select("id")
    .eq("id", subscriberId)
    .single();

  if (subErr || !subscriber) throw new Error("Invalid unsubscribe link.");

  const { error } = await supabase
    .from("email_subscribers")
    .update({
      is_subscribed: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("id", subscriberId);

  if (error) throw new Error(error.message);
}
