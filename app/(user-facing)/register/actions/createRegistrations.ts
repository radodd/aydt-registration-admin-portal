"use server";

import { createClient } from "@/utils/supabase/server";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { validateEnrollment } from "@/app/actions/validateEnrollment";
import type { NewDancerDraft } from "@/types/public";
import type { PricingQuote } from "@/types";

export interface CreateRegistrationsInput {
  semesterId: string;
  participants: Array<{
    sessionId: string;
    dancerId: string;
    newDancer?: NewDancerDraft;
    /** meeting_occurrence_dates IDs selected by the parent in the cart */
    selectedDayIds?: string[];
    /**
     * Phase 3b-ii: registration mode for this participant. Drives which table
     * receives the row.
     *   - "standard"/"tiered": one row in section_enrollments (requires scheduleId).
     *   - "drop-in" (or undefined, legacy): one row in registrations.
     */
    mode?: "standard" | "tiered" | "drop-in";
    /** Required when mode = "standard" | "tiered". The class_sections.id to enroll into. */
    scheduleId?: string;
    /** Required when mode = "tiered". The class_tiers.id chosen for this dancer. */
    classTierId?: string;
    /** Optional informational — class_id, used for audit/back-fill. */
    classId?: string;
  }>;
  batchId: string;
  /** Client-visible pricing quote — server re-computes and validates it matches. */
  pricingQuote?: PricingQuote;
  /** Optional coupon code entered by the parent at checkout. */
  couponCode?: string;
  /** IDs of family_account_credits rows to apply toward this batch. */
  creditIdsToApply?: string[];
  /** Total credit amount (dollars) client computed — server validates against DB rows. */
  creditTotal?: number;
  /**
   * Payment plan chosen by the parent. "installments" routes through the
   * stored-card / recurring-charge path. NOTE the deliberate cross-vocabulary
   * mapping (see below): the pricing engine speaks "auto_pay_monthly", the
   * batch column + EPG session speak "installments". Defaults to pay_in_full.
   */
  paymentPlanType?: "pay_in_full" | "installments";
}

export interface CreateRegistrationsResult {
  success: boolean;
  registrationIds: string[];
  /** The batch ID created — needed by the client to initiate payment. */
  batchId?: string;
  error?: string;
  /** Set when server-computed price differs from client-visible quote. */
  priceChanged?: boolean;
  newQuote?: PricingQuote;
  /**
   * Set to "BATCH_STALE" when the supplied batchId points to a batch that is
   * no longer payable (failed/cancelled). The client should mint a fresh
   * batchId and retry. See app/(user-facing)/register/payment/page.tsx.
   */
  code?: "BATCH_STALE";
}

const PRICE_TOLERANCE = 0.01; // cents rounding tolerance

/**
 * Creates one registration record per (dancerId, sessionId) pair.
 * Inserts a registration_orders record with server-computed pricing totals.
 *
 * Idempotency: if a registration_orders row with the given batchId already
 * exists, the existing IDs are returned without re-inserting.
 */
export async function createRegistrations(
  input: CreateRegistrationsInput,
): Promise<CreateRegistrationsResult> {
  const supabase = await createClient();

  // 1. Verify the caller is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      registrationIds: [],
      error: "You must be signed in to register.",
    };
  }

  // 2. Idempotency check — return existing IDs if this batch was already submitted
  const { data: existingBatch } = await supabase
    .from("registration_orders")
    .select("id, status")
    .eq("id", input.batchId)
    .maybeSingle();

  if (existingBatch) {
    // If the cached batchId points to a batch that's no longer payable
    // (failed/cancelled — e.g. cleaned up by a prior stale-batch sweep), signal
    // the client to mint a fresh batchId and retry rather than reusing the dead
    // row (which would later fail with "not in a payable state").
    if (existingBatch.status === "failed" || existingBatch.status === "cancelled") {
      console.log(
        `[createRegistrations] ⚠️ TEMP - batch ${input.batchId} is ${existingBatch.status} — returning BATCH_STALE for client regeneration`,
      ); // TODO: DELETE
      return {
        success: false,
        registrationIds: [],
        code: "BATCH_STALE",
        error: "This registration session expired. Restarting checkout…",
      };
    }

    // Phase 3b-ii: a batch may produce rows in either/both tables. Merge both.
    const [{ data: existingRegs }, { data: existingEnrolls }] = await Promise.all([
      supabase.from("registrations").select("id").eq("registration_batch_id", input.batchId),
      supabase.from("section_enrollments").select("id").eq("batch_id", input.batchId),
    ]);
    return {
      success: true,
      batchId: input.batchId,
      registrationIds: [
        ...(existingRegs ?? []).map((r) => r.id as string),
        ...(existingEnrolls ?? []).map((r) => r.id as string),
      ],
    };
  }

  // 2.5. Look up family_id early so it's available for warning logging
  const { data: userProfileEarly } = await supabase
    .from("users")
    .select("family_id")
    .eq("id", user.id)
    .maybeSingle();
  const earlyFamilyId = (userProfileEarly as any)?.family_id ?? null;

  // 3. Validate that all sessionIds belong to the given semester
  const sessionIds = [...new Set(input.participants.map((p) => p.sessionId))];
  const { data: sessions, error: sessionError } = await supabase
    .from("class_meetings")
    .select("id")
    .in("id", sessionIds)
    .eq("semester_id", input.semesterId);

  if (sessionError || !sessions || sessions.length !== sessionIds.length) {
    return {
      success: false,
      registrationIds: [],
      error:
        "One or more sessions are invalid or do not belong to this semester.",
    };
  }

  // 3.1 Phase 3b-ii: validate section_id ownership for standard/tiered participants
  const scheduleEnrollmentParticipants = input.participants.filter(
    (p) => p.mode === "standard" || p.mode === "tiered",
  );
  const scheduleIds = [
    ...new Set(
      scheduleEnrollmentParticipants
        .map((p) => p.scheduleId)
        .filter((id): id is string => !!id),
    ),
  ];
  if (scheduleEnrollmentParticipants.length > 0 && scheduleIds.length > 0) {
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("class_sections")
      .select("id, classes!inner(semester_id)")
      .in("id", scheduleIds);
    if (scheduleError || !scheduleRows || scheduleRows.length !== scheduleIds.length) {
      return {
        success: false,
        registrationIds: [],
        error: "One or more class schedules are invalid.",
      };
    }
    for (const row of scheduleRows as any[]) {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      if (cls?.semester_id !== input.semesterId) {
        return {
          success: false,
          registrationIds: [],
          error: "One or more schedules do not belong to this semester.",
        };
      }
    }
  }
  for (const p of scheduleEnrollmentParticipants) {
    if (!p.scheduleId) {
      return {
        success: false,
        registrationIds: [],
        error: "Internal error: scheduleId missing for full-term enrollment.",
      };
    }
    if (p.mode === "tiered" && !p.classTierId) {
      return {
        success: false,
        registrationIds: [],
        error: "Internal error: classTierId missing for tiered enrollment.",
      };
    }
  }

  // 3.5 Server-side enrollment validation (Phase 3 — Layer 2)
  const validationResult = await validateEnrollment({
    semesterId: input.semesterId,
    participants: input.participants.map((p) => ({
      dancerId: p.dancerId,
      sessionId: p.sessionId,
    })),
  });

  if (validationResult.hasHardBlock) {
    // Log the block so admins can see which families are hitting hard blocks.
    const blockRows = validationResult.issues
      .filter((i) => i.enforcement === "hard_block")
      .map((issue) => ({
        batch_id: null,
        family_id: earlyFamilyId,
        dancer_id: issue.dancerId || null,
        meeting_id: issue.sessionId ?? null,
        semester_id: input.semesterId,
        warning_type: issue.type,
        enforcement: "hard_block",
        message: issue.message,
        requirement_id: (issue as any).requirementId ?? null,
      }));
    if (blockRows.length > 0) {
      await supabase.from("enrollment_warnings").insert(blockRows as any[]);
    }
    const firstBlock = validationResult.issues.find(
      (i) => i.enforcement === "hard_block",
    );
    return {
      success: false,
      registrationIds: [],
      error: firstBlock?.message ?? "Enrollment validation failed.",
    };
  }

  // 4. Server-side pricing computation
  // Group session IDs by dancer
  const enrollmentMap = new Map<
    string,
    { dancerName?: string; sessionIds: string[] }
  >();
  for (const p of input.participants) {
    if (!enrollmentMap.has(p.dancerId)) {
      enrollmentMap.set(p.dancerId, { sessionIds: [] });
    }
    const entry = enrollmentMap.get(p.dancerId)!;
    entry.sessionIds.push(p.sessionId);
    if (p.newDancer && !entry.dancerName) {
      entry.dancerName = `${p.newDancer.firstName} ${p.newDancer.lastName}`;
    }
  }

  const enrollments = Array.from(enrollmentMap.entries()).map(
    ([dancerId, { dancerName, sessionIds: sids }]) => ({
      dancerId,
      dancerName,
      sessionIds: sids,
    }),
  );

  let serverQuote: PricingQuote | null = null;
  let pricingError: string | null = null;

  try {
    serverQuote = await computePricingQuote({
      semesterId: input.semesterId,
      enrollments,
      // Pricing engine vocabulary: installments → "auto_pay_monthly" (the only
      // value buildPaymentSchedule splits + reduces amountDueNow for).
      paymentPlanType:
        input.paymentPlanType === "installments"
          ? "auto_pay_monthly"
          : "pay_in_full",
      couponCode: input.couponCode,
    });
  } catch (err) {
    // Pricing failed — still allow registration but with zero totals
    pricingError =
      err instanceof Error ? err.message : "Pricing computation failed";
    console.warn("[createRegistrations] Pricing failed:", pricingError);
  }

  // 5. Validate client quote matches server quote (if both available)
  if (serverQuote && input.pricingQuote) {
    const diff = Math.abs(
      serverQuote.grandTotal - input.pricingQuote.grandTotal,
    );
    if (diff > PRICE_TOLERANCE) {
      return {
        success: false,
        registrationIds: [],
        error: "Pricing has changed since you last viewed the quote.",
        priceChanged: true,
        newQuote: serverQuote,
      };
    }
  }

  // 6. family_id already fetched above (earlyFamilyId)
  const familyId = earlyFamilyId;

  // 6.5. Cancel any stale pending batches for this parent+semester
  // This prevents the time-conflict trigger from firing when the user retries
  // with a different cart (new batchId) while old registrations hold seats.
  const { data: staleBatches } = await supabase
    .from("registration_orders")
    .select("id")
    .eq("parent_id", user.id)
    .eq("semester_id", input.semesterId)
    .eq("status", "pending")
    .neq("id", input.batchId);

  if (staleBatches?.length) {
    const staleIds = staleBatches.map((b) => b.id as string);
    // Phase 3b-ii: stale batches may have rows in either table.
    // `registrations` is soft-cancelled (no unique constraint conflict).
    // `section_enrollments` is hard-deleted because its UNIQUE (section_id, dancer_id)
    // constraint ignores status — a soft-cancelled row would block the retry insert with
    // "duplicate key value violates unique constraint schedule_enrollments_schedule_id_dancer_id_key".
    // The parent registration_orders row stays as 'failed' for audit.
    const [regsResult, enrollResult] = await Promise.all([
      supabase
        .from("registrations")
        .update({ status: "cancelled" })
        .in("registration_batch_id", staleIds)
        .eq("status", "pending_payment"),
      supabase
        .from("section_enrollments")
        .delete()
        .in("batch_id", staleIds)
        .eq("status", "pending"),
    ]);
    console.log(
      `[createRegistrations] ⚠️ TEMP - stale batch cleanup parent=${user.id} semester=${input.semesterId} staleBatchCount=${staleIds.length} regsErr=${regsResult.error?.message ?? "ok"} enrollErr=${enrollResult.error?.message ?? "ok"}`,
    ); // TODO: DELETE
    await supabase
      .from("registration_orders")
      .update({ status: "failed" })
      .in("id", staleIds);
  }

  // 7. Insert registration_orders record
  const grandTotal = serverQuote?.grandTotal ?? 0;
  const baseAmountDueNow = serverQuote?.amountDueNow ?? grandTotal;

  // Server-validate credits: fetch rows to verify they belong to this family and are unused
  let verifiedCreditTotal = 0;
  let verifiedCreditIds: string[] = [];
  if (input.creditIdsToApply?.length && familyId) {
    const { data: creditRows } = await supabase
      .from("family_account_credits")
      .select("id, amount")
      .in("id", input.creditIdsToApply)
      .eq("family_id", familyId)
      .is("used_in_batch_id", null)
      .eq("is_active", true);
    if (creditRows?.length) {
      verifiedCreditTotal = creditRows.reduce((sum, c) => sum + Number(c.amount), 0);
      verifiedCreditIds = creditRows.map((c) => c.id as string);
    }
  }
  const amountDueNow = Math.max(0, baseAmountDueNow - verifiedCreditTotal);

  const { error: batchInsertError } = await supabase
    .from("registration_orders")
    .insert({
      id: input.batchId,
      family_id: familyId,
      parent_id: user.id,
      semester_id: input.semesterId,
      tuition_total: serverQuote?.tuitionSubtotal ?? 0,
      registration_fee_total: serverQuote?.registrationFeeTotal ?? 0,
      recital_fee_total: serverQuote?.recitalFeeTotal ?? 0,
      family_discount_amount: serverQuote?.familyDiscountAmount ?? 0,
      auto_pay_admin_fee_total: serverQuote?.autoPayAdminFeeTotal ?? 0,
      grand_total: grandTotal,
      // Batch-column / EPG vocabulary: literal "installments" is what
      // createEPGPaymentSession + the webhook gate on to set doCapture:false
      // and store the card. Do NOT write "auto_pay_monthly" here.
      payment_plan_type:
        input.paymentPlanType === "installments" ? "installments" : "pay_in_full",
      amount_due_now: amountDueNow,
      cart_snapshot: input.participants.map((p) => ({
        dancerId: p.dancerId,
        sessionId: p.sessionId,
      })),
      status: "pending",
    });

  if (batchInsertError) {
    return {
      success: false,
      registrationIds: [],
      error: batchInsertError.message,
    };
  }

  // 7.5. Record coupon redemption and increment uses_count (non-fatal)
  if (serverQuote?.appliedCouponId && familyId) {
    await supabase
      .from("coupon_redemptions")
      .insert({
        coupon_id: serverQuote.appliedCouponId,
        family_id: familyId,
        registration_batch_id: input.batchId,
      })
      .then(({ error }) => {
        if (error) {
          console.warn("[createRegistrations] Failed to record coupon redemption:", error.message);
        }
      });

    await supabase.rpc("increment_coupon_uses", {
      p_coupon_id: serverQuote.appliedCouponId,
    });
  }

  // 7.6. Mark account credits as used (non-fatal)
  if (verifiedCreditIds.length > 0) {
    await supabase
      .from("family_account_credits")
      .update({ used_in_batch_id: input.batchId, used_at: new Date().toISOString() })
      .in("id", verifiedCreditIds)
      .then(({ error }) => {
        if (error) {
          console.warn("[createRegistrations] Failed to mark credits as used:", error.message);
        }
      });
  }

  // 8. Insert rows — split by mode (Phase 3b-ii).
  //   - standard/tiered participants → section_enrollments (one row per participant)
  //   - drop-in (or legacy unset) participants → registrations (one row per participant)
  const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const dropInParticipants = input.participants.filter(
    (p) => p.mode !== "standard" && p.mode !== "tiered",
  );

  // 8a. section_enrollments — for standard/tiered participants.
  let allRegistrationIds: string[] = [];
  if (scheduleEnrollmentParticipants.length > 0) {
    const enrollRows = scheduleEnrollmentParticipants.map((p) => ({
      section_id: p.scheduleId!,
      batch_id: input.batchId,
      dancer_id: p.dancerId,
      price_snapshot: 0, // financial record lives on registration_orders
      // section_enrollments.status CHECK allows ('pending', 'confirmed', 'cancelled') —
      // distinct from registrations.status which uses 'pending_payment'. The EPG
      // webhook flips this to 'confirmed' alongside the registrations update.
      status: "pending",
      class_tier_id: p.mode === "tiered" ? p.classTierId : null,
    }));
    const { data: enrollCreated, error: enrollErr } = await supabase
      .from("section_enrollments")
      .insert(enrollRows)
      .select("id");
    if (enrollErr) {
      return {
        success: false,
        registrationIds: [],
        error: enrollErr.message,
      };
    }
    allRegistrationIds = allRegistrationIds.concat(
      (enrollCreated ?? []).map((r: any) => r.id as string),
    );
  }

  // 8b. registrations — for drop-in / legacy participants.
  const rows = dropInParticipants.map((p) => ({
    dancer_id: p.dancerId,
    meeting_id: p.sessionId,
    status: "pending_payment",
    total_amount: 0,
    hold_expires_at: holdExpiresAt,
    registration_batch_id: input.batchId,
  }));

  let created: { id: string; meeting_id: string; dancer_id: string }[] = [];
  if (rows.length > 0) {
    const { data, error: insertError } = await supabase
      .from("registrations")
      .insert(rows)
      .select("id, meeting_id, dancer_id");

    if (insertError) {
      return {
        success: false,
        registrationIds: [],
        error: insertError.message,
      };
    }
    created = (data ?? []) as any;
    allRegistrationIds = allRegistrationIds.concat(created.map((r) => r.id));
  }

  // 9. Insert registration_days — one row per (registration, selected occurrence date)
  const createdById: Record<string, string> = {};
  for (const r of created ?? []) {
    createdById[`${r.meeting_id}:${r.dancer_id}`] = r.id as string;
  }

  const allSelectedDayIds = input.participants.flatMap((p) => p.selectedDayIds ?? []);
  if (allSelectedDayIds.length > 0) {
    const { data: occurrenceRows } = await supabase
      .from("meeting_occurrence_dates")
      .select("id, date")
      .in("id", [...new Set(allSelectedDayIds)]);

    const dateById = new Map<string, string>(
      (occurrenceRows ?? []).map((o) => [o.id as string, o.date as string]),
    );

    const dayRows = input.participants.flatMap((p) => {
      const registrationId = createdById[`${p.sessionId}:${p.dancerId}`];
      if (!registrationId) return [];
      return (p.selectedDayIds ?? []).flatMap((dayId) => {
        const date = dateById.get(dayId);
        if (!date) return [];
        return [{ registration_id: registrationId, available_day_id: dayId, day: date }];
      });
    });

    if (dayRows.length > 0) {
      // Non-fatal: day tracking failure should not block the registration
      await supabase
        .from("registration_days")
        .insert(dayRows)
        .then(({ error }) => {
          if (error) {
            console.warn("[createRegistrations] Failed to insert registration_days:", error.message);
          }
        });
    }
  }

  // 10. Insert payment schedule installments
  if (serverQuote && serverQuote.paymentSchedule.length > 0) {
    const installmentRows = serverQuote.paymentSchedule.map((inst) => ({
      batch_id: input.batchId,
      installment_number: inst.installmentNumber,
      amount_due: inst.amountDue,
      due_date: inst.dueDate,
      status: "scheduled",
    }));

    // Non-fatal: if installment insert fails, registration is still confirmed
    await supabase
      .from("order_payment_installments")
      .insert(installmentRows)
      .then(({ error }) => {
        if (error) {
          console.warn(
            "[createRegistrations] Failed to insert installments:",
            error.message,
          );
        }
      });
  }

  // 11. Log any soft warnings so admins can review flagged enrollments.
  const softWarnings = validationResult.issues.filter(
    (i) => i.enforcement === "soft_warn",
  );
  if (softWarnings.length > 0) {
    const warnRows = softWarnings.map((issue) => ({
      batch_id: input.batchId,
      family_id: familyId,
      dancer_id: issue.dancerId || null,
      meeting_id: issue.sessionId ?? null,
      semester_id: input.semesterId,
      warning_type: issue.type,
      enforcement: "soft_warn",
      message: issue.message,
      requirement_id: (issue as any).requirementId ?? null,
    }));
    await supabase
      .from("enrollment_warnings")
      .insert(warnRows as any[])
      .then(({ error }) => {
        if (error) {
          console.warn("[createRegistrations] Failed to log enrollment warnings:", error.message);
        }
      });
  }

  return {
    success: true,
    batchId: input.batchId,
    registrationIds: allRegistrationIds,
  };
}
