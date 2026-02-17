"use server";

import { createClient } from "@/utils/supabase/server";
import { DiscountApplication } from "@/types";

export async function syncSemesterDiscounts(
  semesterId: string,
  applications: DiscountApplication[],
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

  if (!applications.length) return;

  const uniqueDiscountsIds = Array.from(
    new Set(applications.map((app) => app.discountId)),
  );

  const rows = uniqueDiscountsIds.map((discountId) => ({
    semester_id: semesterId,
    discount_id: discountId,
  }));

  const { error: insertError } = await supabase
    .from("semester_discounts")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}
