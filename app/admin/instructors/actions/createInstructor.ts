"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";
import { sendInstructorInviteEmail } from "@/utils/email/sendInstructorInviteEmail";

export interface CreateInstructorInput {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Invite a new instructor.
 *
 * Flow:
 *  1. generateLink({ type: 'invite' }) creates the auth.users row and mints a
 *     setup link WITHOUT sending any email (we own the email). The
 *     handle_new_user() DB trigger fires synchronously, inserting a public.users
 *     row with role = 'instructor' (no family).
 *  2. We update that row to status = 'invited' so the admin list shows the
 *     correct pending state until the instructor completes setup.
 *  3. We send our OWN branded invite email via Resend (sendInstructorInviteEmail)
 *     — NOT the Supabase "Invite User" template (a single global slot we keep
 *     free so families can have their own email too, see sendFamilyWelcomeEmail).
 *     The link routes through /auth/confirm?type=invite&next=/instructor/setup.
 */
export async function createInstructor(input: CreateInstructorInput) {
  await requireAdmin();

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: {
      data: {
        role:       "instructor",
        first_name: input.firstName,
        last_name:  input.lastName,
      },
    },
  });

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

  // Send our own branded invite. Build the setup link from the OTP token_hash and
  // route it through /auth/confirm (rather than Supabase's /auth/v1/verify redirect,
  // which sends the session as an unreadable hash fragment).
  const hashedToken = data.properties?.hashed_token;
  if (!hashedToken) {
    throw new Error("Failed to generate the instructor setup link.");
  }
  const base = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const setupLink = `${base}/auth/confirm?token_hash=${hashedToken}&type=invite&next=${encodeURIComponent("/instructor/setup")}`;
  const res = await sendInstructorInviteEmail({
    toEmail: input.email,
    firstName: input.firstName,
    setupLink,
  });
  if (!res.ok) {
    console.error("createInstructor — invite email failed:", res.error);
    throw new Error("The instructor account was created, but the invite email failed to send.");
  }
}
