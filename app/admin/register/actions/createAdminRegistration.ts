"use server";

import { createClient } from "@/utils/supabase/server";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { buildAdminInstallmentSchedule } from "@/utils/buildPaymentSchedule";
import type { AdminAdjustment } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRegistrationReceipt } from "./sendRegistrationReceipt";
import { createAdminInstallmentSession } from "./createAdminInstallmentSession";
import { createAdminAchSession } from "./createAdminAchSession";
import {
  getApplicableCredits,
  grantAccountCredits,
  markCreditsUsed,
} from "@/queries/credits";

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
  scheduleIds: string[];
  /**
   * Drop-in (per-date) registrations. Each id is a `class_meetings.id` whose
   * parent schedule has `is_drop_in=true` (or legacy `pricing_model='per_session'`).
   * Writes one row per id into `registrations` (not `section_enrollments`).
   */
  sessionIds?: string[];
  /**
   * Phase 3a: for tiered classes the admin picks one `class_tiers.id` per
   * schedule enrollment. Keyed by scheduleId from `scheduleIds`. Unselected
   * schedules (standard classes) are absent from this map.
   */
  classTierIdsBySchedule?: Record<string, string>;
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
  /** Meeting-plan #33: optional add-on option ids the admin opted into. */
  selectedAddOnIds?: string[];
  priceOverride?: number | null;
  adjustments?: AdminAdjustment[];
  creditIdsToApply?: string[];
  /**
   * Meeting-plan #17: new account credits to GRANT to the family (e.g. an
   * injury make-up credit). Unlike tuition adjustments these do NOT reduce this
   * order's total — each becomes a `family_account_credits` row the family can
   * spend on any future order. Tied to this batch via `source_batch_id`.
   */
  creditsToGrant?: { label: string; amount: number }[];
  paymentPlanType?: "pay_in_full" | "monthly";
  /**
   * Meeting-plan #7: number of installments when paymentPlanType === "monthly".
   * Super-admin only. The effective total is divided into this many auto-charged
   * installments. Ignored for pay-in-full.
   */
  installmentCount?: number;
  paymentMethod: string;
  amountCollected: number;
  /**
   * Meeting-plan #19: when a super-admin under-collects on a manual payment,
   * the date the remaining balance is due. Defaults to today when omitted.
   * Ignored when the payment covers the full effective total.
   */
  balanceDueDate?: string;
  checkNumber?: string;
  payerName?: string;
  notes?: string;
};

export type AdminRegResult = {
  success: boolean;
  batchId?: string;
  dancerId?: string;
  /**
   * Set for installment plans (meeting-plan #7): the caller must redirect the
   * browser here so the family can enter their card on Elavon's hosted page.
   * The EPG webhook then stores the card, charges installment 1, and confirms.
   */
  paymentSessionUrl?: string;
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

  const role = (adminUser as { role?: string } | null)?.role;
  if (!role || !["admin", "super_admin"].includes(role)) {
    return { success: false, error: "Admin access required." };
  }
  const isSuperAdmin = role === "super_admin";
  const isInstallments = input.paymentPlanType === "monthly";
  // Meeting-plan #18: a one-time ACH debit is a pay-in-full order whose funds are
  // pulled on Elavon's hosted bank-entry page (redirect), not recorded as cash.
  const isAch = !isInstallments && input.paymentMethod === "ach";

  // Installment setup is a super-admin "God-tier" power (meeting-plan #7).
  if (isInstallments && !isSuperAdmin) {
    return {
      success: false,
      error: "Installment plans can only be set up by a super-admin.",
    };
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
        enrollments: [
          {
            dancerId,
            scheduleIds: input.scheduleIds,
            classTierIdsBySchedule: input.classTierIdsBySchedule,
          },
        ],
        paymentPlanType: isInstallments ? "auto_pay_monthly" : "pay_in_full",
        couponCode: input.couponCode || undefined,
        // #33: charge the optional add-ons the admin opted into at checkout.
        selectedAddOnIds: input.selectedAddOnIds,
      });
      grandTotal = quote.grandTotal;
    } catch (err) {
      console.warn("[createAdminRegistration] Pricing failed:", err);
      grandTotal = 0;
    }
  }

  // Apply admin adjustments (proration credits, scholarships, etc.)
  const adjustmentsSum = (input.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0);

  // Existing account credits the admin chose to apply. Validated server-side
  // (ownership + unused + active) via the canonical query layer — the client's
  // claimed amount is never trusted. The verified ids are marked used after the
  // order is created. This mirrors the public checkout flow.
  const { ids: verifiedCreditIds, total: verifiedCreditTotal } =
    await getApplicableCredits(supabase, {
      familyId,
      creditIds: input.creditIdsToApply,
    });

  const effectiveTotal = Math.max(
    0,
    grandTotal - adjustmentsSum - verifiedCreditTotal,
  );

  // Partial collection on a pay-in-full registration is the super-admin
  // "God-tier" override (meeting-plan #7) — it must not block a regular admin's
  // full-payment registration, but only a super-admin may under-collect.
  // ACH debits the full total on the hosted page (collected up front = 0 by
  // design), so it is never a partial payment — exclude it from the gate (#18).
  const isPartial = !isInstallments && !isAch && input.amountCollected < effectiveTotal;
  if (isPartial && !isSuperAdmin) {
    return {
      success: false,
      error:
        "Only a super-admin can complete a registration with a partial payment.",
    };
  }

  const batchId = crypto.randomUUID();

  /* ------------------------------------------------------------------------ */
  /* Path A — installment plan (auto-charged via Elavon)                       */
  /*                                                                          */
  /* Creates a PENDING order + N scheduled installments, then mints a hosted  */
  /* session. The EPG webhook stores the card, charges installment 1, links   */
  /* stored_payment_method_id, and confirms; the recurring cron auto-charges  */
  /* installments 2..N. Mirrors the public installment flow's batch creation. */
  /* ------------------------------------------------------------------------ */
  if (isInstallments) {
    // The webhook needs a parent_id to create/find the EPG Shopper that owns
    // the stored card. Without it the card can never be stored.
    if (!parentUserId) {
      return {
        success: false,
        error:
          "Installment plans require a parent account on the family (needed to store the card). Add a primary parent first.",
      };
    }

    const count = Math.floor(input.installmentCount ?? 0);
    if (!Number.isFinite(count) || count < 2) {
      return { success: false, error: "Choose at least 2 installments." };
    }
    if (effectiveTotal <= 0) {
      return { success: false, error: "Installment total must be greater than $0." };
    }

    const today = new Date().toISOString().split("T")[0];
    const schedule = buildAdminInstallmentSchedule(effectiveTotal, count, today);
    const amountDueNow = schedule[0]?.amountDue ?? 0;

    const { error: batchErr } = await supabase.from("registration_orders").insert({
      id: batchId,
      family_id: familyId,
      parent_id: parentUserId,
      semester_id: input.semesterId,
      tuition_total: quote?.tuitionSubtotal ?? effectiveTotal,
      registration_fee_total: quote?.registrationFeeTotal ?? 0,
      recital_fee_total: quote?.recitalFeeTotal ?? 0,
      family_discount_amount: quote?.familyDiscountAmount ?? 0,
      auto_pay_admin_fee_total: quote?.autoPayAdminFeeTotal ?? 0,
      grand_total: effectiveTotal,
      // Canonical batch-column value — createAdminInstallmentSession + the EPG
      // webhook gate on "installments" to set doCapture:false and store the card.
      payment_plan_type: "installments",
      // #18: installment plans are charged to a stored card.
      payment_method: "card",
      installment_count: count,
      amount_due_now: amountDueNow,
      admin_adjustments: input.adjustments?.length ? input.adjustments : null,
      form_data: input.formData ?? {},
      // PENDING until the webhook confirms after the card is stored + installment
      // 1 is charged. payment_reference_id is left unset (the webhook records the
      // EPG transaction id on confirmation).
      status: "pending",
      cart_snapshot: [
        ...input.scheduleIds.map((sid) => ({ dancerId, scheduleId: sid })),
        ...(input.sessionIds ?? []).map((sessId) => ({ dancerId, sessionId: sessId, dropIn: true })),
      ],
    });

    if (batchErr) return { success: false, error: batchErr.message };

    // Enrollment rows go in PENDING — the webhook flips them to confirmed
    // (mirrors the public installment flow).
    if (input.scheduleIds.length > 0) {
      const tierMap = input.classTierIdsBySchedule ?? {};
      const enrollRows = input.scheduleIds.map((sid) => ({
        section_id: sid,
        batch_id: batchId,
        dancer_id: dancerId,
        price_snapshot: 0,
        status: "pending",
        class_tier_id: tierMap[sid] ?? null,
      }));
      const { error: enrollErr } = await supabase
        .from("section_enrollments")
        .insert(enrollRows);
      if (enrollErr) return { success: false, error: enrollErr.message };
    }

    if (input.sessionIds && input.sessionIds.length > 0) {
      // meeting_enrollments (renamed registrations) allows 'pending_payment';
      // the webhook confirms by registration_batch_id.
      const holdExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const dropInRows = input.sessionIds.map((sessionId) => ({
        dancer_id: dancerId,
        user_id: parentUserId,
        meeting_id: sessionId,
        registration_batch_id: batchId,
        batch_id: batchId,
        status: "pending_payment",
        hold_expires_at: holdExpiresAt,
        form_data: input.formData ?? {},
      }));
      const { error: dropInErr } = await supabase
        .from("meeting_enrollments")
        .insert(dropInRows);
      if (dropInErr) return { success: false, error: dropInErr.message };
    }

    // N scheduled installment rows (status 'scheduled'). Installment 1 is marked
    // paid by the webhook once it is captured at the hosted page.
    const installmentRows = schedule.map((inst) => ({
      batch_id: batchId,
      installment_number: inst.installmentNumber,
      amount_due: inst.amountDue,
      due_date: inst.dueDate,
      status: "scheduled",
    }));
    const { error: instErr } = await supabase
      .from("order_payment_installments")
      .insert(installmentRows);
    if (instErr) return { success: false, error: instErr.message };

    await applyCouponAndCredits(supabase, {
      appliedCouponId: quote?.appliedCouponId ?? null,
      familyId,
      batchId,
      verifiedCreditIds,
      creditsToGrant: input.creditsToGrant,
      adminUserId: user.id,
    });

    // Mint the hosted session and hand the URL back for redirect.
    const session = await createAdminInstallmentSession({
      batchId,
      amountDueNow,
      semesterId: input.semesterId,
      semesterName: input.semesterName,
      dancerId,
    });
    if (session.error || !session.paymentSessionUrl) {
      return {
        success: false,
        error:
          session.error ??
          "Could not start the card-entry step. The plan was saved but no payment was taken.",
      };
    }

    return {
      success: true,
      batchId,
      dancerId,
      paymentSessionUrl: session.paymentSessionUrl,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Path A2 — one-time ACH debit (meeting-plan #18)                           */
  /*                                                                          */
  /* A pay-in-full order whose funds are pulled via Elavon ACH on a hosted    */
  /* bank-entry page, rather than recorded as already-collected cash/check.   */
  /* Like Path A it is created PENDING (order + enrollments + one scheduled   */
  /* installment) and a hosted session is minted; the EPG webhook's           */
  /* pay-in-full branch (confirmBatch) flips everything to confirmed and      */
  /* marks installment 1 paid once the debit captures.                        */
  /* ------------------------------------------------------------------------ */
  if (isAch) {
    if (effectiveTotal <= 0) {
      return { success: false, error: "ACH amount must be greater than $0." };
    }

    const today = new Date().toISOString().split("T")[0];

    const { error: batchErr } = await supabase.from("registration_orders").insert({
      id: batchId,
      family_id: familyId,
      parent_id: parentUserId,
      semester_id: input.semesterId,
      tuition_total: quote?.tuitionSubtotal ?? effectiveTotal,
      registration_fee_total: quote?.registrationFeeTotal ?? 0,
      recital_fee_total: quote?.recitalFeeTotal ?? 0,
      family_discount_amount: quote?.familyDiscountAmount ?? 0,
      auto_pay_admin_fee_total: quote?.autoPayAdminFeeTotal ?? 0,
      grand_total: effectiveTotal,
      // pay_in_full so the EPG webhook routes to confirmBatch (not the stored-card
      // installment path). The ACH method is recorded on payment_method (#18).
      payment_plan_type: "pay_in_full",
      payment_method: "ach",
      amount_due_now: effectiveTotal,
      admin_adjustments: input.adjustments?.length ? input.adjustments : null,
      form_data: input.formData ?? {},
      // PENDING until the hosted ACH debit captures + the webhook confirms.
      status: "pending",
      cart_snapshot: [
        ...input.scheduleIds.map((sid) => ({ dancerId, scheduleId: sid })),
        ...(input.sessionIds ?? []).map((sessId) => ({ dancerId, sessionId: sessId, dropIn: true })),
      ],
    });
    if (batchErr) return { success: false, error: batchErr.message };

    // PENDING enrollments — the webhook flips them to confirmed (mirrors Path A).
    if (input.scheduleIds.length > 0) {
      const tierMap = input.classTierIdsBySchedule ?? {};
      const enrollRows = input.scheduleIds.map((sid) => ({
        section_id: sid,
        batch_id: batchId,
        dancer_id: dancerId,
        price_snapshot: 0,
        status: "pending",
        class_tier_id: tierMap[sid] ?? null,
      }));
      const { error: enrollErr } = await supabase
        .from("section_enrollments")
        .insert(enrollRows);
      if (enrollErr) return { success: false, error: enrollErr.message };
    }

    if (input.sessionIds && input.sessionIds.length > 0) {
      const holdExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const dropInRows = input.sessionIds.map((sessionId) => ({
        dancer_id: dancerId,
        user_id: parentUserId,
        meeting_id: sessionId,
        registration_batch_id: batchId,
        batch_id: batchId,
        status: "pending_payment",
        hold_expires_at: holdExpiresAt,
        form_data: input.formData ?? {},
      }));
      const { error: dropInErr } = await supabase
        .from("meeting_enrollments")
        .insert(dropInRows);
      if (dropInErr) return { success: false, error: dropInErr.message };
    }

    // Single scheduled installment — confirmBatch marks it paid on capture.
    const { error: instErr } = await supabase
      .from("order_payment_installments")
      .insert({
        batch_id: batchId,
        installment_number: 1,
        amount_due: effectiveTotal,
        due_date: today,
        status: "scheduled",
      });
    if (instErr) return { success: false, error: instErr.message };

    await applyCouponAndCredits(supabase, {
      appliedCouponId: quote?.appliedCouponId ?? null,
      familyId,
      batchId,
      verifiedCreditIds,
      creditsToGrant: input.creditsToGrant,
      adminUserId: user.id,
    });

    // Mint the ACH hosted session and hand the URL back for redirect.
    const session = await createAdminAchSession({
      batchId,
      amount: effectiveTotal,
      semesterId: input.semesterId,
      semesterName: input.semesterName,
      dancerId,
    });
    if (session.error || !session.paymentSessionUrl) {
      return {
        success: false,
        error:
          session.error ??
          "Could not start the bank-entry step. The registration was saved but no payment was taken.",
      };
    }

    return {
      success: true,
      batchId,
      dancerId,
      paymentSessionUrl: session.paymentSessionUrl,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Path B — pay-in-full / manual (cash, check, card-present, comp)           */
  /*                                                                          */
  /* Synchronous: the order is confirmed immediately. A super-admin may       */
  /* under-collect (partial payment) without blocking the registration.       */
  /* ------------------------------------------------------------------------ */

  // Insert registration_orders as confirmed
  const today = new Date().toISOString().split("T")[0];

  const { error: batchErr } = await supabase.from("registration_orders").insert({
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
    payment_plan_type: "pay_in_full",
    // #18: record the manual method (cash/check/card/other) so it surfaces
    // wherever the order is read, alongside ACH.
    payment_method: input.paymentMethod || null,
    // Meeting-plan #19: amount_due_now reflects what was actually collected so a
    // partially-paid order does not read as fully settled.
    amount_due_now: isPartial ? input.amountCollected : effectiveTotal,
    admin_adjustments: input.adjustments?.length ? input.adjustments : null,
    form_data: input.formData ?? {},
    // Enrollment is real either way; the financial status reflects under-payment.
    status: isPartial ? "partial" : "confirmed",
    confirmed_at: new Date().toISOString(),
    payment_reference_id: "admin",
    cart_snapshot: [
      ...input.scheduleIds.map((sid) => ({ dancerId, scheduleId: sid })),
      ...(input.sessionIds ?? []).map((sessId) => ({ dancerId, sessionId: sessId, dropIn: true })),
    ],
  });

  if (batchErr) return { success: false, error: batchErr.message };

  // Full-schedule enrollments → section_enrollments (one row per schedule).
  if (input.scheduleIds.length > 0) {
    const tierMap = input.classTierIdsBySchedule ?? {};
    const enrollRows = input.scheduleIds.map((sid) => ({
      section_id: sid,
      batch_id: batchId,
      dancer_id: dancerId,
      price_snapshot: 0, // financial record lives on registration_orders
      status: "confirmed",
      class_tier_id: tierMap[sid] ?? null,
    }));

    const { error: enrollErr } = await supabase.from("section_enrollments").insert(enrollRows);
    if (enrollErr) return { success: false, error: enrollErr.message };
  }

  // Drop-in (per-date) registrations → registrations (one row per meeting_id).
  // Per-session capacity and time-conflict are enforced by DB triggers.
  if (input.sessionIds && input.sessionIds.length > 0) {
    const dropInRows = input.sessionIds.map((sessionId) => ({
      dancer_id: dancerId,
      user_id: parentUserId,
      meeting_id: sessionId,
      registration_batch_id: batchId,
      batch_id: batchId,
      status: "confirmed",
      form_data: input.formData ?? {},
    }));
    const { error: dropInErr } = await supabase.from("meeting_enrollments").insert(dropInRows);
    if (dropInErr) return { success: false, error: dropInErr.message };

    // Write per-session line items so registration_orders.grand_total has a
    // line-level audit trail. Best-effort: log on failure but don't block the
    // registration since the aggregate totals are already on the batch.
    const { data: sessionRows } = await supabase
      .from("class_meetings")
      .select("id, schedule_date, drop_in_price, classes(name)")
      .in("id", input.sessionIds);

    if (sessionRows && sessionRows.length > 0) {
      const lineItems = sessionRows.map((s: any) => {
        const className: string = s.classes?.name ?? "Drop-in class";
        const date: string = s.schedule_date ?? "";
        const unit = s.drop_in_price != null ? Number(s.drop_in_price) : 0;
        return {
          batch_id: batchId,
          dancer_id: dancerId,
          meeting_id: s.id as string,
          schedule_enrollment_id: null,
          item_type: "drop_in",
          label: date ? `${className} — ${date}` : className,
          unit_amount: unit,
          quantity: 1,
          amount: unit,
        };
      });
      const { error: liErr } = await supabase
        .from("order_line_items")
        .insert(lineItems);
      if (liErr) {
        console.warn("[createAdminRegistration] Drop-in line item insert failed:", liErr.message);
      }
    }
  }

  await applyCouponAndCredits(supabase, {
    appliedCouponId: quote?.appliedCouponId ?? null,
    familyId,
    batchId,
    verifiedCreditIds,
    creditsToGrant: input.creditsToGrant,
    adminUserId: user.id,
  });

  // Insert installment — paid if amount collected covers effective total
  const isPaid = input.amountCollected >= effectiveTotal;
  const payRef =
    input.paymentMethod === "check" && input.checkNumber
      ? `check-${input.checkNumber}`
      : input.paymentMethod || null;

  await supabase
    .from("order_payment_installments")
    .insert({
      batch_id: batchId,
      installment_number: 1,
      amount_due: effectiveTotal,
      // Meeting-plan #19: when under-collected, the remaining balance is owed on
      // the admin-chosen date (defaults to today); a full payment is due today.
      due_date: isPaid ? today : (input.balanceDueDate || today),
      status: isPaid ? "paid" : "scheduled",
      paid_at: isPaid ? new Date().toISOString() : null,
      // Always record what was collected so partial payments surface everywhere.
      paid_amount: input.amountCollected,
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
    scheduleIds: input.scheduleIds,
    quote,
    adjustments: input.adjustments ?? [],
    appliedCreditTotal: verifiedCreditTotal,
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

/* -------------------------------------------------------------------------- */
/* Shared: record coupon redemption + mark account credits used (best-effort) */
/* -------------------------------------------------------------------------- */

async function applyCouponAndCredits(
  supabase: SupabaseClient,
  params: {
    appliedCouponId: string | null;
    familyId: string | null;
    batchId: string;
    /** Pre-verified credit ids (from getApplicableCredits) to mark used. */
    verifiedCreditIds?: string[];
    /** Meeting-plan #17: new account credits to grant to this family. */
    creditsToGrant?: { label: string; amount: number }[];
    /** Admin issuing the grant — recorded as `issued_by_admin_id`. */
    adminUserId?: string;
  },
): Promise<void> {
  const { appliedCouponId, familyId, batchId, verifiedCreditIds, creditsToGrant, adminUserId } = params;

  if (appliedCouponId && familyId) {
    await supabase
      .from("coupon_redemptions")
      .insert({
        coupon_id: appliedCouponId,
        family_id: familyId,
        registration_batch_id: batchId,
      })
      .then(({ error }) => {
        if (error) console.warn("[createAdminRegistration] Coupon redemption failed:", error.message);
      });
    await supabase.rpc("increment_coupon_uses", { p_coupon_id: appliedCouponId });
  }

  // Consume applied credits + grant new ones — both through the canonical layer.
  if (verifiedCreditIds?.length) {
    await markCreditsUsed(supabase, { creditIds: verifiedCreditIds, batchId });
  }

  // Meeting-plan #17: grant new account credits (injury make-up, etc.). These
  // post to the family's balance and are spendable on any future order — they
  // do NOT reduce this order.
  if (creditsToGrant?.length && familyId) {
    await grantAccountCredits(supabase, {
      familyId,
      credits: creditsToGrant.map((c) => ({ amount: c.amount, reason: c.label })),
      issuedByAdminId: adminUserId ?? null,
      sourceBatchId: batchId,
    });
  }
}
