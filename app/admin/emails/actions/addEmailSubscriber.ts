"use server";

import { createClient } from "@/utils/supabase/server";

export type AddSubscriberResult =
  | { status: "added" }
  | { status: "conflict"; message: string }
  | { status: "already_exists" };

export async function addEmailSubscriber(
  email: string,
  name: string,
  phone: string,
  /**
   * When true, the admin has acknowledged the email belongs to an account
   * holder and wants to add it anyway.
   */
  forceAdd = false,
): Promise<AddSubscriberResult> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || !["admin", "super_admin"].includes(admin.role)) {
    throw new Error("Unauthorized");
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if already in external subscribers list
  const { data: existing } = await supabase
    .from("email_subscribers")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing) {
    return { status: "already_exists" };
  }

  // Check if the email belongs to a portal account holder (warn admin)
  if (!forceAdd) {
    const { data: portalUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (portalUser) {
      return {
        status: "conflict",
        message:
          "This email address is registered to an account holder in the portal. Would you still like to add them as an external subscriber?",
      };
    }
  }

  const { error } = await supabase.from("email_subscribers").insert({
    email: normalizedEmail,
    name: name.trim() || null,
    phone: phone.trim() || null,
    is_subscribed: true,
    created_by: admin.id,
  });

  if (error) throw new Error(error.message);

  return { status: "added" };
}
