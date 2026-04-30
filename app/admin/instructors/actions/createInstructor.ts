"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";

export interface CreateInstructorInput {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Invite a new instructor via Supabase's built-in invite flow.
 *
 * Flow:
 *  1. Creates the auth.users row and emails the instructor a magic link.
 *     The email template is configured in Supabase Dashboard → Auth → Email Templates
 *     → Invite User to use /auth/confirm?token_hash=...&type=invite&next=/instructor/setup
 *     so the instructor lands on the dedicated password-setup page.
 *  2. The handle_new_user() DB trigger fires synchronously, inserting a
 *     public.users row with role = 'instructor' (no family).
 *  3. We update that row to status = 'invited' so the admin list shows the
 *     correct pending state until the instructor completes setup.
 */
export async function createInstructor(input: CreateInstructorInput) {
  await requireAdmin();

  const adminClient = createAdminClient();

  // No redirectTo needed — the Supabase "Invite User" email template is configured
  // to use /auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/instructor/setup
  // so the app handles OTP verification directly rather than relying on the
  // Supabase /auth/v1/verify redirect (which sends the session as an unreadable hash fragment).
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
    input.email,
    {
      data: {
        role:       "instructor",
        first_name: input.firstName,
        last_name:  input.lastName,
      },
    },
  );

  if (error) {
    if (error.message.toLowerCase().includes("already been registered")) {
      throw new Error("An account with this email already exists.");
    }
    throw new Error(error.message);
  }

  const { error: updateErr } = await adminClient
    .from("users")
    .update({ status: "invited" })
    .eq("id", data.user.id);

  if (updateErr) {
    console.error("createInstructor — failed to set status:", updateErr.message);
  }
}
