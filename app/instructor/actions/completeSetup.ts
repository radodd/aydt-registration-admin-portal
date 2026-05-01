"use server";

import { createClient } from "@/utils/supabase/server";
import { requireInstructor } from "@/utils/requireInstructor";

/**
 * Called after an invited instructor sets their password on /instructor/setup.
 * Flips status from 'invited' → 'active' so the admin list reflects the change
 * and the instructor isn't sent back to setup on future logins.
 */
export async function completeInstructorSetup(): Promise<void> {
  const { userId } = await requireInstructor();
  const supabase = await createClient();

  const { error } = await supabase
    .from("users")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("status", "invited"); // no-op if already active — safe to call twice

  if (error) {
    console.error("completeInstructorSetup:", error.message);
    throw new Error("Failed to activate account. Please contact support.");
  }
}
