import { createClient } from "@/utils/supabase/client";
import { DraftCoupon } from "@/types";

export interface CreateCouponInput
  extends Omit<DraftCoupon, "_clientKey" | "id" | "usesCount"> {
  semesterId: string;
}

/** Creates a new coupon and links it to the given semester. Returns the new coupon id. */
export async function createCoupon(input: CreateCouponInput): Promise<string> {
  const supabase = createClient();

  const { data: coupon, error: couponError } = await supabase
    .from("discount_coupons")
    .insert({
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
    .select("id")
    .single();

  if (couponError) throw new Error(couponError.message);

  const couponId = coupon.id;

  // Link to semester
  const { error: linkError } = await supabase
    .from("semester_coupons")
    .insert({ semester_id: input.semesterId, coupon_id: couponId });

  if (linkError) throw new Error(linkError.message);

  // Session restrictions
  if (
    input.eligibleSessionsMode === "selected" &&
    (input.sessionIds ?? []).length > 0
  ) {
    const rows = (input.sessionIds ?? []).map((sessionId) => ({
      coupon_id: couponId,
      session_id: sessionId,
    }));
    const { error: sessionError } = await supabase
      .from("coupon_session_restrictions")
      .insert(rows);
    if (sessionError) throw new Error(sessionError.message);
  }

  return couponId;
}
