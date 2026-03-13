"use server";

import { createClient } from "@/utils/supabase/server";
import { AppliedSemesterDiscount } from "@/types";
import { requireAdmin } from "@/utils/requireAdmin";

export async function syncSemesterDiscounts(
  semesterId: string,
  appliedDiscounts: AppliedSemesterDiscount[],
) {
  await requireAdmin();
  const supabase = await createClient();

  // Remove existing mappings
  const { error: deleteError } = await supabase
    .from("semester_discounts")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!appliedDiscounts.length) return;

  const rows = appliedDiscounts.map((discount) => ({
    semester_id: semesterId,
    discount_id: discount.discountId,
  }));

  const { error: insertError } = await supabase
    .from("semester_discounts")
    .upsert(rows, {
      onConflict: "semester_id, discount_id",
    });

  if (insertError) {
    throw new Error(insertError.message);
  }
}
