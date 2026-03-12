"use server";

import { createClient } from "@/utils/supabase/server";
import { CouponValidationResult, DraftCoupon } from "@/types";

interface ValidateCouponInput {
  semesterId: string;
  familyId: string;
  /** Code entered by the parent. Omit to check for auto-apply coupons only. */
  couponCode?: string;
  /** Session IDs the family is enrolling in (for eligibleSessionsMode=selected check). */
  sessionIds: string[];
}

/**
 * Validates a coupon code (or finds an auto-apply coupon) for a given semester + family.
 * Returns either a valid coupon or a failure reason.
 */
export async function validateCoupon(
  input: ValidateCouponInput,
): Promise<CouponValidationResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Build the query: find the coupon linked to this semester
  let query = supabase
    .from("semester_coupons")
    .select(
      `
      coupon:discount_coupons (
        id,
        name,
        code,
        value,
        value_type,
        valid_from,
        valid_until,
        max_total_uses,
        uses_count,
        max_per_family,
        stackable,
        eligible_sessions_mode,
        is_active,
        coupon_session_restrictions ( session_id )
      )
    `,
    )
    .eq("semester_id", input.semesterId);

  if (input.couponCode) {
    // Code-based: filter by code (case-insensitive)
    query = query.ilike("coupon.code", input.couponCode.trim());
  } else {
    // Auto-apply: code must be null
    query = query.is("coupon.code", null);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  // Flatten — Supabase returns an array of junction rows each with a coupon object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coupons: any[] = (data ?? [])
    .map((row: any) => row.coupon)
    .filter(Boolean)
    // When filtering by code via ilike on a joined column, Supabase may return nulls
    .filter((c: any) =>
      input.couponCode
        ? c.code?.toLowerCase() === input.couponCode!.trim().toLowerCase()
        : c.code === null,
    );

  if (coupons.length === 0) {
    return { valid: false, reason: "not_found" };
  }

  // If there are multiple auto-apply coupons, pick the first active one
  const raw = coupons.find((c: any) => c.is_active) ?? coupons[0];

  if (!raw.is_active) {
    return { valid: false, reason: "inactive" };
  }

  // Date window checks
  if (raw.valid_from && now < raw.valid_from) {
    return { valid: false, reason: "not_yet_valid" };
  }
  if (raw.valid_until && now > raw.valid_until) {
    return { valid: false, reason: "expired" };
  }

  // Usage cap
  if (raw.max_total_uses !== null && raw.uses_count >= raw.max_total_uses) {
    return { valid: false, reason: "cap_reached" };
  }

  // Per-family redemption check
  const { count: redemptionCount, error: redemptionError } = await supabase
    .from("coupon_redemptions")
    .select("*", { count: "exact", head: true })
    .eq("coupon_id", raw.id)
    .eq("family_id", input.familyId);

  if (redemptionError) throw new Error(redemptionError.message);

  if ((redemptionCount ?? 0) >= raw.max_per_family) {
    return { valid: false, reason: "already_used" };
  }

  // Session eligibility check
  if (raw.eligible_sessions_mode === "selected") {
    const restrictedSessionIds: string[] = (
      raw.coupon_session_restrictions ?? []
    ).map((r: { session_id: string }) => r.session_id);

    const hasMatch = input.sessionIds.some((id) =>
      restrictedSessionIds.includes(id),
    );
    if (!hasMatch) {
      return { valid: false, reason: "not_applicable" };
    }
  }

  const coupon: DraftCoupon = {
    _clientKey: raw.id,
    id: raw.id,
    name: raw.name,
    code: raw.code,
    value: Number(raw.value),
    valueType: raw.value_type as "flat" | "percent",
    validFrom: raw.valid_from ?? null,
    validUntil: raw.valid_until ?? null,
    maxTotalUses: raw.max_total_uses ?? null,
    usesCount: raw.uses_count,
    maxPerFamily: raw.max_per_family,
    stackable: raw.stackable,
    eligibleSessionsMode: raw.eligible_sessions_mode as "all" | "selected",
    sessionIds: (raw.coupon_session_restrictions ?? []).map(
      (r: { session_id: string }) => r.session_id,
    ),
    isActive: raw.is_active,
  };

  return { valid: true, coupon };
}
