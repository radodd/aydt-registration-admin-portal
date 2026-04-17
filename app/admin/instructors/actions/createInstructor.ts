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
 *  1. Creates the auth.users row and emails the instructor a magic link
 *     to set their own password.
 *  2. The handle_new_user() DB trigger fires synchronously, inserting a
 *     public.users row with role = 'instructor' (no family).
 *  3. We update that row to ensure status = 'active'.
 */
export async function createInstructor(input: CreateInstructorInput) {
  await requireAdmin();

  const adminClient = createAdminClient();

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
    // Surface a readable message for the most common failure (duplicate email).
    if (error.message.toLowerCase().includes("already been registered")) {
      throw new Error("An account with this email already exists.");
    }
    throw new Error(error.message);
  }

  // The trigger creates the public.users row synchronously, but doesn't set
  // status. Update it to 'active' so the instructor appears correctly in the UI.
  const { error: updateErr } = await adminClient
    .from("users")
    .update({ status: "active" })
    .eq("id", data.user.id);

  if (updateErr) {
    console.error("createInstructor — failed to set status:", updateErr.message);
  }
}
