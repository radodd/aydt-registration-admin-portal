"use server";

import { createClient } from "@/utils/supabase/server";
import { AppliedSemesterDiscount } from "@/types";

export async function syncSemesterDiscounts(
  semesterId: string,
  appliedDiscounts: AppliedSemesterDiscount[],
) {
  const supabase = await createClient();

  // Remove existing mappings
  const { data: deletedRows, error: deleteError } = await supabase
    .from("semester_discounts")
    .delete()
    .eq("semester_id", semesterId);

  console.log("Deleted rows:", deletedRows);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!appliedDiscounts.length) return;

  // const uniqueDiscountsIds = Array.from(
  //   new Set(appliedDiscounts.map((app) => app.discountId)),
  // );

  const rows = appliedDiscounts.map((discount) => ({
    semester_id: semesterId,
    discount_id: discount.discountId,
  }));

  console.log("Inserting rows:", rows);

  const { error: insertError } = await supabase
    .from("semester_discounts")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}
