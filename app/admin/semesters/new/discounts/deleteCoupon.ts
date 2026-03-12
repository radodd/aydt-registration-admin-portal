import { createClient } from "@/utils/supabase/client";

/** Deletes a coupon by id. Cascades to session restrictions and semester links. */
export async function deleteCoupon(couponId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("discount_coupons")
    .delete()
    .eq("id", couponId);

  if (error) throw new Error(error.message);
}
