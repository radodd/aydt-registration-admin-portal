"use server";

import { createClient } from "@/utils/supabase/server";
import { DiscountApplication } from "@/types";

export async function syncSemesterDiscounts(
  semesterId: string,
  applications: DiscountApplication[],
) {
  const supabase = await createClient();

  // Remove existing mappings
  const { error: deleteError } = await supabase
    .from("semester_discounts")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!applications.length) return;

  const rows = applications.map((app) => ({
    semester_id: semesterId,
    discount_id: app.discountId,
  }));

  const { error: insertError } = await supabase
    .from("semester_discounts")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}
