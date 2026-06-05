"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Meeting-plan #28: reopen ADMIN-managed freed seats for a class.
 *
 * Abandoned seat holds (added to cart, never checked out) stay "full" to the
 * public until an admin acts. This releases the FREED ones — expired + still
 * unreleased — so those seats return to the public catalog. Live holds (a family
 * actively mid-checkout) are left alone.
 *
 * Uses the service-role client because seat_holds RLS is owner-scoped (the admin
 * is not the holder); the caller's admin role is verified first.
 */
export async function reopenFreedSeats(
  classId: string,
): Promise<{ success: boolean; reopened?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["admin", "super_admin"].includes((me as { role?: string }).role ?? "")) {
    return { success: false, error: "Not authorized" };
  }

  const { data: meetings } = await supabase
    .from("class_meetings")
    .select("section_id")
    .eq("class_id", classId);
  const sectionIds = [
    ...new Set(
      (meetings ?? [])
        .map((m) => (m as { section_id: string | null }).section_id)
        .filter((id): id is string => !!id),
    ),
  ];
  if (sectionIds.length === 0) return { success: true, reopened: 0 };

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { data: released, error } = await admin
    .from("seat_holds")
    .update({ released_at: now })
    .in("section_id", sectionIds)
    .is("released_at", null)
    .lte("expires_at", now) // FREED (expired) only — never release a live hold
    .select("id");

  if (error) return { success: false, error: error.message };
  return { success: true, reopened: (released ?? []).length };
}
