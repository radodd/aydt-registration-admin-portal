import { createClient } from "@/utils/supabase/client";
import { DraftCoupon } from "@/types";

export interface UpdateCouponInput
  extends Omit<DraftCoupon, "_clientKey" | "usesCount"> {
  id: string;
}

/** Updates an existing coupon using the replace pattern (delete restrictions, re-insert). */
export async function updateCoupon(input: UpdateCouponInput): Promise<void> {
  const supabase = createClient();

  const { error: updateError } = await supabase
    .from("discount_coupons")
    .update({
      name: input.name,
      code: input.code || null,
      value: input.value,
      value_type: input.valueType,
      valid_from: input.validFrom || null,
      valid_until: input.validUntil || null,
      max_total_uses: input.maxTotalUses ?? null,
      max_per_family: input.maxPerFamily,
      stackable: input.stackable,
      eligible_sessions_mode: input.eligibleSessionsMode,
      is_active: input.isActive,
      applies_to_most_expensive_only: input.appliesToMostExpensiveOnly ?? false,
      eligible_line_item_types: (input.eligibleLineItemTypes ?? []).length > 0
        ? input.eligibleLineItemTypes
        : ["tuition", "registration_fee", "recital_fee"],
    })
    .eq("id", input.id);

  if (updateError) throw new Error(updateError.message);

  // Replace session restrictions
  const { error: deleteError } = await supabase
    .from("coupon_session_restrictions")
    .delete()
    .eq("coupon_id", input.id);

  if (deleteError) throw new Error(deleteError.message);

  if (
    input.eligibleSessionsMode === "selected" &&
    (input.sessionIds ?? []).length > 0
  ) {
    const rows = (input.sessionIds ?? []).map((sessionId) => ({
      coupon_id: input.id,
      session_id: sessionId,
    }));
    const { error: insertError } = await supabase
      .from("coupon_session_restrictions")
      .insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
}
