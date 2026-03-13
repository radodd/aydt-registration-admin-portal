"use server";

import { createClient } from "@/utils/supabase/server";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import type { AdminAdjustment } from "@/types";
import { sendRegistrationReceipt } from "./sendRegistrationReceipt";

export type NewDancerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  grade: string;
  familyId?: string | null;
  newFamilyName?: string | null;
};

export type AdminRegInput = {
  semesterId: string;
  semesterName: string;
  sessionIds: string[];
  // Existing dancer
  dancerId?: string | null;
  dancerName: string;
  familyId?: string | null;
  parentUserId?: string | null;
  // New dancer (mutually exclusive with dancerId)
  newDancer?: NewDancerInput | null;
  // Form answers
  formData: Record<string, unknown>;
  // Payment
  couponCode?: string;
  priceOverride?: number | null;
  adjustments?: AdminAdjustment[];
  paymentPlanType?: "pay_in_full" | "monthly";
  paymentMethod: string;
  amountCollected: number;
  checkNumber?: string;
  payerName?: string;
  notes?: string;
};

export type AdminRegResult = {
  success: boolean;
  batchId?: string;
  dancerId?: string;
  error?: string;
};

export async function createAdminRegistration(
  input: AdminRegInput
): Promise<AdminRegResult> {
  const supabase = await createClient();

  // Auth + admin role check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: adminUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminUser || !["admin", "super_admin"].includes((adminUser as any).role)) {
    return { success: false, error: "Admin access required." };
  }

  // Create dancer if new
  let dancerId = input.dancerId ?? null;
  let familyId = input.familyId ?? null;
  let parentUserId = input.parentUserId ?? null;

  if (!dancerId && input.newDancer) {
    const nd = input.newDancer;

    // Create family if needed
    if (!familyId) {
      const { data: newFam, error: famErr } = await supabase
        .from("families")
        .insert({ family_name: nd.newFamilyName || `${nd.lastName} Family` })
        .select("id")
        .single();
      if (famErr || !newFam) {
        return { success: false, error: `Failed to create family: ${famErr?.message}` };
      }
      familyId = (newFam as any).id as string;
    }

    // Create dancer
    const { data: newDancer, error: dancerErr } = await supabase
      .from("dancers")
      .insert({
        family_id: familyId,
        first_name: nd.firstName,
        last_name: nd.lastName,
        birth_date: nd.birthDate || null,
        gender: nd.gender || null,
        grade: nd.grade || null,
      })
      .select("id")
      .single();

    if (dancerErr || !newDancer) {
      return { success: false, error: `Failed to create dancer: ${dancerErr?.message}` };
    }
    dancerId = (newDancer as any).id as string;
  }

  if (!dancerId) return { success: false, error: "No dancer selected." };

  // Resolve familyId from dancer if still missing
  if (!familyId) {
    const { data: dancer } = await supabase
      .from("dancers")
      .select("family_id")
      .eq("id", dancerId)
      .single();
    familyId = (dancer as any)?.family_id ?? null;
  }

  // Resolve primary parent user for the family
  if (!parentUserId && familyId) {
    const { data: primaryParent } = await supabase
      .from("users")
      .select("id")
      .eq("family_id", familyId)
      .eq("is_primary_parent", true)
      .maybeSingle();
    parentUserId = (primaryParent as any)?.id ?? null;
  }

  // Compute pricing (or use admin override)
  let grandTotal: number;
  let quote = null;

  if (input.priceOverride != null) {
    grandTotal = input.priceOverride;
  } else {
    try {
      quote = await computePricingQuote({
        semesterId: input.semesterId,
        familyId: familyId ?? undefined,
        enrollments: [{ dancerId, sessionIds: input.sessionIds }],
        paymentPlanType: "pay_in_full",
        couponCode: input.couponCode || undefined,
      });
      grandTotal = quote.grandTotal;
    } catch (err) {
      console.warn("[createAdminRegistration] Pricing failed:", err);
      grandTotal = 0;
    }
  }

  // Apply admin adjustments (proration credits, scholarships, etc.)
  const adjustmentsSum = (input.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0);
  const effectiveTotal = Math.max(0, grandTotal - adjustmentsSum);

  // Insert registration_batch as confirmed
  const batchId = crypto.randomUUID();
  const today = new Date().toISOString().split("T")[0];

  const { error: batchErr } = await supabase.from("registration_batches").insert({
    id: batchId,
    family_id: familyId,
    parent_id: parentUserId,
    semester_id: input.semesterId,
    tuition_total: quote?.tuitionSubtotal ?? grandTotal,
    registration_fee_total: quote?.registrationFeeTotal ?? 0,
    recital_fee_total: quote?.recitalFeeTotal ?? 0,
    family_discount_amount: quote?.familyDiscountAmount ?? 0,
    auto_pay_admin_fee_total: quote?.autoPayAdminFeeTotal ?? 0,
    grand_total: effectiveTotal,
    payment_plan_type: input.paymentPlanType ?? "pay_in_full",
    amount_due_now: effectiveTotal,
    admin_adjustments: input.adjustments?.length ? input.adjustments : null,
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    payment_reference_id: "admin",
    cart_snapshot: input.sessionIds.map((sid) => ({ dancerId, sessionId: sid })),
  });

  if (batchErr) return { success: false, error: batchErr.message };

  // Insert one registration per session — status confirmed
  const regRows = input.sessionIds.map((sid) => ({
    dancer_id: dancerId,
    session_id: sid,
    status: "confirmed",
    total_amount: 0,
    registration_batch_id: batchId,
    form_data: input.formData,
  }));

  const { error: regErr } = await supabase.from("registrations").insert(regRows);
  if (regErr) return { success: false, error: regErr.message };

  // Record coupon redemption if applicable
  if (quote?.appliedCouponId && familyId) {
    await supabase
      .from("coupon_redemptions")
      .insert({
        coupon_id: quote.appliedCouponId,
        family_id: familyId,
        registration_batch_id: batchId,
      })
      .then(({ error }) => {
        if (error) console.warn("[createAdminRegistration] Coupon redemption failed:", error.message);
      });
    await supabase.rpc("increment_coupon_uses", { p_coupon_id: quote.appliedCouponId });
  }

  // Insert installment — paid if amount collected covers effective total
  const isPaid = input.amountCollected >= effectiveTotal;
  const payRef =
    input.paymentMethod === "check" && input.checkNumber
      ? `check-${input.checkNumber}`
      : input.paymentMethod || null;

  await supabase
    .from("batch_payment_installments")
    .insert({
      batch_id: batchId,
      installment_number: 1,
      amount_due: effectiveTotal,
      due_date: today,
      status: isPaid ? "paid" : "scheduled",
      paid_at: isPaid ? new Date().toISOString() : null,
      paid_amount: isPaid ? input.amountCollected : null,
      payment_reference_id: payRef,
    })
    .then(({ error }) => {
      if (error) console.warn("[createAdminRegistration] Installment insert failed:", error.message);
    });

  // Send email receipt — fire and forget; never block registration on email failure
  const resolvedDancerName = input.dancerName ||
    (input.newDancer ? `${input.newDancer.firstName} ${input.newDancer.lastName}` : "Student");

  sendRegistrationReceipt({
    supabase,
    batchId,
    dancerName: resolvedDancerName,
    semesterId: input.semesterId,
    semesterName: input.semesterName,
    sessionIds: input.sessionIds,
    quote,
    adjustments: input.adjustments ?? [],
    effectiveTotal,
    amountCollected: input.amountCollected,
    paymentMethod: input.paymentMethod,
    paymentPlanType: input.paymentPlanType ?? "pay_in_full",
    notes: input.notes,
    familyId,
    parentUserId,
  }).catch((err) => console.warn("[createAdminRegistration] Receipt send failed:", err));

  return { success: true, batchId, dancerId };
}
