"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { validateEnrollment } from "@/app/actions/validateEnrollment";
import { getApplicableCredits, markCreditsUsed } from "@/queries/credits";
import { joinWaitlist } from "./joinWaitlist";
import type { NewDancerDraft } from "@/types/public";
import type { PricingQuote } from "@/types";
import { logPaymentError } from "@/utils/payment/logPaymentError";

/**
 * The capacity triggers (check_session_capacity / check_schedule_enrollment_capacity)
 * RAISE with a message containing "at capacity" when a seat is gone. This
 * distinguishes a genuine last-seat race (→ route to waitlist) from any other
 * insert failure (→ hard error). See supabase/migrations — the message is
 * "Session/Section is at capacity — N enrolled, capacity is M.".
 */
function isCapacityError(error: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!error) return false;
  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /at capacity/i.test(haystack);
}

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
  /** Meeting-plan #33: optional add-on option ids the family opted into. */
  selectedAddOnIds?: string[];
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
  /**
   * Meeting-plan #26: set when a last-seat race sent one or more dancers to the
   * waitlist instead of enrolling them. `error` carries a friendly message the
   * UI already surfaces; `allWaitlisted` is true when the WHOLE cart was routed
   * (nothing to pay). The UI may use these to render a waitlist confirmation
   * rather than the generic error styling.
   */
  waitlisted?: Array<{ dancerId: string; classId: string }>;
  allWaitlisted?: boolean;
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
      supabase.from("meeting_enrollments").select("id").eq("registration_batch_id", input.batchId),
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
    .select("id, class_id")
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

  // meeting_id → class_id, for routing a contended drop-in participant to the
  // correct per-class waitlist if its seat is gone (see step 8).
  const meetingToClass = new Map<string, string>(
    (sessions as { id: string; class_id: string | null }[]).flatMap((s) =>
      s.class_id ? [[s.id, s.class_id] as [string, string]] : [],
    ),
  );
  // section_id → class_id, populated alongside the section ownership check below.
  const sectionToClass = new Map<string, string>();

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
      .select("id, class_id, classes!inner(semester_id)")
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
      if (row.class_id) sectionToClass.set(row.id as string, row.class_id as string);
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
  // Partition each dancer's participants by mode so the pricing engine reads
  // the right table for each enrollment:
  //   - standard / tiered → schedule path (scheduleIds + classTierIdsBySchedule)
  //   - drop-in (or legacy unset mode) → session path (sessionIds)
  // The schedule path reads section.days_of_week directly, so a single class
  // meeting Mon+Wed correctly bands as 2/WK. The session path only sees the
  // representative sessionId and would undercount to 1/WK.
  const enrollmentMap = new Map<
    string,
    {
      dancerName?: string;
      scheduleIds: string[];
      classTierIdsBySchedule: Record<string, string>;
      sessionIds: string[];
    }
  >();
  for (const p of input.participants) {
    if (!enrollmentMap.has(p.dancerId)) {
      enrollmentMap.set(p.dancerId, {
        scheduleIds: [],
        classTierIdsBySchedule: {},
        sessionIds: [],
      });
    }
    const entry = enrollmentMap.get(p.dancerId)!;
    const usesSchedulePath =
      (p.mode === "standard" || p.mode === "tiered") && !!p.scheduleId;
    if (usesSchedulePath) {
      entry.scheduleIds.push(p.scheduleId!);
      if (p.mode === "tiered" && p.classTierId) {
        entry.classTierIdsBySchedule[p.scheduleId!] = p.classTierId;
      }
    } else {
      entry.sessionIds.push(p.sessionId);
    }
    if (p.newDancer && !entry.dancerName) {
      entry.dancerName = `${p.newDancer.firstName} ${p.newDancer.lastName}`;
    }
  }

  const enrollments = Array.from(enrollmentMap.entries()).map(
    ([
      dancerId,
      { dancerName, scheduleIds, classTierIdsBySchedule, sessionIds },
    ]) => ({
      dancerId,
      dancerName,
      scheduleIds: scheduleIds.length > 0 ? scheduleIds : undefined,
      classTierIdsBySchedule:
        Object.keys(classTierIdsBySchedule).length > 0
          ? classTierIdsBySchedule
          : undefined,
      sessionIds: sessionIds.length > 0 ? sessionIds : undefined,
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
      // #33: must match the client quote (which included these) or the
      // price-change guard below would reject the registration.
      selectedAddOnIds: input.selectedAddOnIds,
    });
  } catch (err) {
    // Pricing failed — still allow registration but with zero totals
    pricingError =
      err instanceof Error ? err.message : "Pricing computation failed";
    console.warn("[createRegistrations] Pricing failed:", pricingError);
    // Application-internal: pricing computation threw, so the order proceeds with
    // ZERO totals — a real money bug that was previously silent. Dev-actionable.
    // (orderId is null here — the registration_orders row isn't inserted yet.)
    await logPaymentError({
      origin: "application",
      source: "app_internal",
      category: "bad_state",
      familyId: earlyFamilyId,
      errorMessage: `Pricing computation failed on public registration: ${pricingError}`,
      rawPayload: { batchId: input.batchId, semesterId: input.semesterId },
    });
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
        .from("meeting_enrollments")
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

  // Server-validate credits (ownership + unused + active) via the canonical
  // query layer — single source of truth shared with the admin checkout.
  const { ids: verifiedCreditIds, total: verifiedCreditTotal } =
    await getApplicableCredits(supabase, {
      familyId,
      creditIds: input.creditIdsToApply,
    });
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

  // 7.6. Mark account credits as used (non-fatal) — canonical query layer.
  // Runs via the service-role client: under RLS a parent has SELECT-only access
  // to their own credits (they may not UPDATE, which would let them re-spend a
  // consumed credit). The ids were already validated server-side above.
  if (verifiedCreditIds.length > 0) {
    await markCreditsUsed(createAdminClient(), {
      creditIds: verifiedCreditIds,
      batchId: input.batchId,
    });
  }

  // 8. Insert rows — split by mode (Phase 3b-ii).
  //   - standard/tiered participants → section_enrollments (one row per participant)
  //   - drop-in (or legacy unset) participants → registrations (one row per participant)
  const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const dropInParticipants = input.participants.filter(
    (p) => p.mode !== "standard" && p.mode !== "tiered",
  );

  // 8. Convert the caller's seat holds (Meeting-plan #28) into pending enrollments.
  // ONE atomic RPC: for each participant it deletes the caller's matching
  // `seat_holds` row and inserts the SAME pending enrollment the old direct insert
  // produced — identical batch_id / status / columns — so the EPG webhook +
  // confirmBatch are unaffected (see PAYMENTS-CHANGELOG-seat-holds.md). The RPC is
  // a single transaction: if any seat was lost (a hold lapsed and was taken), the
  // whole call RAISEs + rolls back, and we route the cart to the waitlist (#26).
  // It also works when NO hold exists (capacity permitting), so non-hold callers
  // still function. `contendedParticipants` drives the all-or-nothing fallback.
  const contendedParticipants: CreateRegistrationsInput["participants"] = [];
  let allRegistrationIds: string[] = [];
  let created: { id: string; meeting_id: string; dancer_id: string }[] = [];

  const sectionPayload = scheduleEnrollmentParticipants.map((p) => ({
    section_id: p.scheduleId,
    dancer_id: p.dancerId,
    class_tier_id: p.mode === "tiered" ? (p.classTierId ?? null) : null,
  }));
  const meetingPayload = dropInParticipants.map((p) => ({
    meeting_id: p.sessionId,
    dancer_id: p.dancerId,
  }));

  if (sectionPayload.length > 0 || meetingPayload.length > 0) {
    const { data: converted, error: convertErr } = await supabase.rpc(
      "convert_holds_to_enrollments",
      {
        p_batch_id: input.batchId,
        p_sections: sectionPayload,
        p_meetings: meetingPayload,
        // Drop-in enrollments keep the legacy 30-min hold_expires_at field.
        p_meeting_hold_expires: holdExpiresAt,
      },
    );

    if (convertErr) {
      if (isCapacityError(convertErr)) {
        // A held seat lapsed and was taken before checkout. The RPC rolled back
        // entirely, so nothing was created — route the whole cart to the waitlist.
        contendedParticipants.push(...input.participants);
      } else {
        return {
          success: false,
          registrationIds: [],
          error: convertErr.message,
        };
      }
    } else {
      const convRows = (converted ?? []) as { kind: string; enrollment_id: string }[];
      const sectionIds = convRows.filter((r) => r.kind === "section").map((r) => r.enrollment_id);
      const meetingIds = convRows.filter((r) => r.kind === "meeting").map((r) => r.enrollment_id);
      allRegistrationIds = [...sectionIds, ...meetingIds];
      // Step 9 (registration_days) needs meeting_id + dancer_id. The RPC returns
      // meeting rows in `meetingPayload` (= dropInParticipants) input order, so zip.
      created = meetingIds.map((id, i) => ({
        id,
        meeting_id: dropInParticipants[i].sessionId,
        dancer_id: dropInParticipants[i].dancerId,
      }));
    }
  }

  // 8c. Meeting-plan #26 — last-seat race resolution.
  // If any seat in the cart was gone, treat the whole batch as unpurchasable:
  //   1. Roll back any sibling rows that DID insert (so no seat is held and the
  //      order can't be paid for a partial cart — avoids overcharging).
  //   2. Route the contended dancers to the per-class manual waitlist (#5),
  //      reusing joinWaitlist (capacity-neutral, sends the "you're on the
  //      waitlist" email). Survivors are not waitlisted — their classes had room,
  //      so the family can simply re-register them.
  //   3. Fail the batch and return a friendly message (no hard Postgres error).
  // NOTE (coarseness, intentional MVP): because the inserts are bulk/atomic per
  // table, one full section waitlists every standard/tiered dancer in the cart,
  // and one full drop-in date waitlists every drop-in dancer. The realistic #26
  // scenario (one dancer racing for one seat) routes exactly that dancer.
  if (contendedParticipants.length > 0) {
    // 1. Roll back any rows that survived in the non-contended table.
    if (allRegistrationIds.length > 0) {
      await Promise.all([
        supabase.from("section_enrollments").delete().eq("batch_id", input.batchId),
        supabase
          .from("meeting_enrollments")
          .delete()
          .eq("registration_batch_id", input.batchId),
      ]);
    }

    // 2. Route contended dancers to their per-class waitlist.
    const waitlisted: NonNullable<CreateRegistrationsResult["waitlisted"]> = [];
    for (const p of contendedParticipants) {
      const isSection = p.mode === "standard" || p.mode === "tiered";
      const classId =
        p.classId ??
        (isSection ? sectionToClass.get(p.scheduleId ?? "") : meetingToClass.get(p.sessionId)) ??
        null;
      if (!classId) {
        // Without an authoritative class we can't queue them — log and skip.
        console.warn(
          `[createRegistrations] could not resolve classId to waitlist dancer ${p.dancerId}`,
        );
        continue;
      }
      await joinWaitlist({
        semesterId: input.semesterId,
        classId,
        sectionId: isSection ? p.scheduleId ?? null : null,
        meetingId: isSection ? null : p.sessionId,
        classTierId: p.mode === "tiered" ? p.classTierId ?? null : null,
        dancerId: p.dancerId,
      });
      waitlisted.push({ dancerId: p.dancerId, classId });
    }

    // 3. Fail the batch; nothing is charged.
    await supabase
      .from("registration_orders")
      .update({ status: "failed" })
      .eq("id", input.batchId);

    return {
      success: false,
      registrationIds: [],
      allWaitlisted: true,
      waitlisted,
      error:
        waitlisted.length > 1
          ? "These classes just filled up. The dancers have been added to the waitlist — we'll email you if spots open."
          : "This class just filled up. You've been added to the waitlist — we'll email you if a spot opens.",
    };
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
