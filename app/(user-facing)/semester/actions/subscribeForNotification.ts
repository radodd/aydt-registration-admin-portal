"use server";

import { createClient } from "@/utils/supabase/server";

export async function subscribeForNotification(params: {
  email: string;
  name?: string;
}): Promise<{ success: boolean; alreadySubscribed?: boolean }> {
  const email = params.email.trim().toLowerCase();
  const name = params.name?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false };
  }

  const supabase = await createClient();

  // Upsert — if the email already exists, the unique constraint fires and we
  // handle it gracefully without throwing.
  const { error } = await supabase.from("email_subscribers").upsert(
    { email, name, is_subscribed: true },
    { onConflict: "email", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[subscribeForNotification] error:", error.message);
    return { success: false };
  }

  // Check whether the row was already present (ignoreDuplicates means no rows
  // affected on conflict, but the insert still "succeeds").
  const { count } = await supabase
    .from("email_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("email", email);

  return { success: true, alreadySubscribed: count === 0 };
}
