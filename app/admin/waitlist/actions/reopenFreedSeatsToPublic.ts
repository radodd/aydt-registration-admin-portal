"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";
import { revalidatePath } from "next/cache";

export interface ReopenFreedSeatsResult {
  success: boolean;
  reopened?: number;
  error?: string;
}

/**
 * Meeting-plan (2026-06-10): reopen REFUND-freed seats to the public.
 *
 * A refund-freed seat is held by an `admin_reserved` placeholder (see the refund
 * route). Releasing the placeholder (released_at) returns the seat to the public
 * catalog. Per the decision this is ONLY allowed when the class has NO waiting
 * queue — if people are waiting, the seat must be assigned from the queue, not
 * raced by the public. Guarded server-side as defense-in-depth (the UI only
 * offers this action for no-queue classes).
 *
 * Uses the service-role client (seat_holds is owner-scoped; an admin_reserved
 * placeholder has no owner). Admin role verified first.
 */
export async function reopenFreedSeatsToPublic(classId: string): Promise<ReopenFreedSeatsResult> {
  await requireAdmin();
  const admin = createAdminClient();

  // Guard: if anyone is waiting, reopening would jump the queue.
  const { count: queueCount } = await admin
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("status", "waiting");

  if ((queueCount ?? 0) > 0) {
    return {
      success: false,
      error: "This class has a waitlist — assign the seat from the queue instead of reopening it to the public.",
    };
  }

  // Release every admin_reserved placeholder for this class → seats return to public.
  const now = new Date().toISOString();
  const { data: released, error } = await admin
    .from("seat_holds")
    .update({ released_at: now })
    .eq("class_id", classId)
    .eq("hold_type", "admin_reserved")
    .is("released_at", null)
    .select("id, section_id, meeting_id, semester_id");

  if (error) return { success: false, error: error.message };

  const n = (released ?? []).length;
  if (n > 0) {
    const first = released![0] as { semester_id: string | null };
    await admin
      .from("waitlist_promotion_events")
      .insert({
        event_type: "reopened_to_public",
        severity: "info",
        class_id: classId,
        semester_id: first.semester_id ?? null,
        message: `Admin reopened ${n} refund-freed seat${n !== 1 ? "s" : ""} to the public.`,
        detail: { reason: "refund_freed", reopened: n },
      })
      .then(() => {}, () => {});
  }

  revalidatePath("/admin/waitlist");
  return { success: true, reopened: n };
}
