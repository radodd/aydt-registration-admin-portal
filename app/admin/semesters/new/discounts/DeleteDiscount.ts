import { createClient } from "@/utils/supabase/client";

export async function deleteDiscount(discountId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("discounts")
    .delete()
    .eq("id", discountId);

  if (error) throw new Error(error.message);
}
