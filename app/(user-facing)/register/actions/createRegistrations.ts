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
    /** session_occurrence_dates IDs selected by the parent in the cart */
    selectedDayIds?: string[];
  }>;
  batchId: string;
  /** Client-visible pricing quote — server re-computes and validates it matches. */
  pricingQuote?: PricingQuote;
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
}

const PRICE_TOLERANCE = 0.01; // cents rounding tolerance

/**
 * Creates one registration record per (dancerId, sessionId) pair.
 * Inserts a registration_batches record with server-computed pricing totals.
 *
 * Idempotency: if a registration_batches row with the given batchId already
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
    .from("registration_batches")
    .select("id")
    .eq("id", input.batchId)
    .maybeSingle();

  if (existingBatch) {
    const { data: existingRegs } = await supabase
      .from("registrations")
      .select("id")
      .eq("registration_batch_id", input.batchId);
    return {
      success: true,
      batchId: input.batchId,
      registrationIds: (existingRegs ?? []).map((r) => r.id as string),
    };
  }

  // 3. Validate that all sessionIds belong to the given semester
  const sessionIds = input.participants.map((p) => p.sessionId);
  const { data: sessions, error: sessionError } = await supabase
    .from("class_sessions")
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

  // 3.5 Server-side enrollment validation (Phase 3 — Layer 2)
  const validationResult = await validateEnrollment({
    semesterId: input.semesterId,
    participants: input.participants.map((p) => ({
      dancerId: p.dancerId,
      sessionId: p.sessionId,
    })),
  });

  if (validationResult.hasHardBlock) {
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
      paymentPlanType: "pay_in_full",
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

  // 6. Look up user's family_id
  const { data: userProfile } = await supabase
    .from("users")
    .select("family_id")
    .eq("id", user.id)
    .maybeSingle();

  const familyId = (userProfile as any)?.family_id ?? null;

  // 6.5. Cancel any stale pending batches for this parent+semester
  // This prevents the time-conflict trigger from firing when the user retries
  // with a different cart (new batchId) while old registrations hold seats.
  const { data: staleBatches } = await supabase
    .from("registration_batches")
    .select("id")
    .eq("parent_id", user.id)
    .eq("semester_id", input.semesterId)
    .eq("status", "pending")
    .neq("id", input.batchId);

  if (staleBatches?.length) {
    const staleIds = staleBatches.map((b) => b.id as string);
    await supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .in("registration_batch_id", staleIds)
      .eq("status", "pending_payment");
    await supabase
      .from("registration_batches")
      .update({ status: "failed" })
      .in("id", staleIds);
  }

  // 7. Insert registration_batches record
  const grandTotal = serverQuote?.grandTotal ?? 0;
  const amountDueNow = serverQuote?.amountDueNow ?? grandTotal;

  const { error: batchInsertError } = await supabase
    .from("registration_batches")
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
      payment_plan_type: "pay_in_full",
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

  // 8. Insert one registration per participant
  const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const rows = input.participants.map((p) => ({
    dancer_id: p.dancerId,
    session_id: p.sessionId,
    status: "pending_payment",
    total_amount: 0,
    hold_expires_at: holdExpiresAt,
    registration_batch_id: input.batchId,
  }));

  const { data: created, error: insertError } = await supabase
    .from("registrations")
    .insert(rows)
    .select("id, session_id, dancer_id");

  if (insertError) {
    return {
      success: false,
      registrationIds: [],
      error: insertError.message,
    };
  }

  // 9. Insert registration_days — one row per (registration, selected occurrence date)
  const createdById: Record<string, string> = {};
  for (const r of created ?? []) {
    createdById[`${r.session_id}:${r.dancer_id}`] = r.id as string;
  }

  const allSelectedDayIds = input.participants.flatMap((p) => p.selectedDayIds ?? []);
  if (allSelectedDayIds.length > 0) {
    const { data: occurrenceRows } = await supabase
      .from("session_occurrence_dates")
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
      .from("batch_payment_installments")
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

  return {
    success: true,
    batchId: input.batchId,
    registrationIds: (created ?? []).map((r) => r.id as string),
  };
}
