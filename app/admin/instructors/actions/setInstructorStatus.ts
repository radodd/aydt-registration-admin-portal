"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";

/**
 * Activate or deactivate an instructor.
 *
 * Sets public.users.status to 'active' or 'inactive'.
 * The instructor's auth session remains intact so historical records
 * (attendance, notes) are preserved with the correct marked_by reference.
 *
 * TODO: When AYDT needs stricter access control, also call:
 *   adminClient.auth.admin.updateUserById(userId, { ban_duration: '87600h' })
 *   to fully block login at the Supabase auth level.
 */
export async function setInstructorStatus(
  instructorId: string,
  status: "active" | "inactive",
) {
  await requireAdmin();

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("users")
    .update({ status })
    .eq("id", instructorId)
    .eq("role", "instructor"); // Guard: only affects instructor rows

  if (error) throw new Error(error.message);
}
