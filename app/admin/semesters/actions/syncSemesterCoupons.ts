"use server";

import { createClient } from "@/utils/supabase/server";
import { DraftCoupon } from "@/types";
import { requireAdmin } from "@/utils/requireAdmin";

/**
 * Syncs the list of coupons linked to a semester.
 * Uses upsert — new coupons are inserted, existing ones preserved.
 * Orphaned links (coupons removed from the semester) are deleted.
 */
export async function syncSemesterCoupons(
  semesterId: string,
  coupons: DraftCoupon[],
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  // Remove all existing semester → coupon links for this semester
  const { error: deleteError } = await supabase
    .from("semester_coupons")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) throw new Error(deleteError.message);

  const savedCoupons = coupons.filter((c) => c.id);
  if (!savedCoupons.length) return;

  const rows = savedCoupons.map((c) => ({
    semester_id: semesterId,
    coupon_id: c.id!,
  }));

  const { error: insertError } = await supabase
    .from("semester_coupons")
    .upsert(rows, { onConflict: "semester_id, coupon_id" });

  if (insertError) throw new Error(insertError.message);
}
