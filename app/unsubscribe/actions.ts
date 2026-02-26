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
