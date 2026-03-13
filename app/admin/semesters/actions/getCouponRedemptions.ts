"use server";

import { createClient } from "@/utils/supabase/server";
import type { CouponRedemptionRecord } from "@/types";

/** Fetches the redemption history for a single coupon, newest first. */
export async function getCouponRedemptions(
  couponId: string,
): Promise<CouponRedemptionRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("coupon_redemptions")
    .select("id, redeemed_at, registration_batch_id, family_id, families(family_name)")
    .eq("coupon_id", couponId)
    .order("redeemed_at", { ascending: false });

  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any): CouponRedemptionRecord => ({
    id: row.id as string,
    redeemedAt: row.redeemed_at as string,
    familyId: row.family_id as string,
    familyName:
      (Array.isArray(row.families) ? row.families[0] : row.families)
        ?.family_name ?? null,
    registrationBatchId: (row.registration_batch_id as string | null) ?? null,
  }));
}
