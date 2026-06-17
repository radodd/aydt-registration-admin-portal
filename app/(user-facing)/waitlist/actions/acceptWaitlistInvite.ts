"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import {
  createEpgOrder,
  createEpgPaymentSession,
} from "@/utils/payment/epg";

/**
 * Meeting-plan #5, Path A: a waitlisted family clicks the admin-sent tokenized
 * link and completes ONLY payment via Elavon hosted checkout. The parent is NOT
 * authenticated (the token IS the authorization), so this runs with the
 * service-role client and bypasses the auth-gated createEPGPaymentSession.
 *
 * It mints a pending registration_orders + enrollment row keyed to a fresh
 * batchId, then hands off to the SAME hosted-checkout the public flow uses. The
 * existing EPG webhook (confirmBatch) finalizes the enrollment + confirmation
 * email by registration_batch_id — no webhook changes required.
 *
 * Constraint: Path A requires a resolvable existing dancer. Brand-new prospects
 * (captured as raw form_data with no dancer row) must be completed by an admin
 * via Path B (registerWaitlistEntryInPortal), which creates the dancer.
 */
export type AcceptResult =
  | { ok: true; paymentSessionUrl: string }
  | { ok: false; reason: AcceptFailureReason; message: string };

export type AcceptFailureReason =
  | "invalid"
  | "not_invited"
  | "expired"
  | "full"
  | "closed"
  | "needs_admin"
  | "pricing"
  | "payment";

function uuid(): string {
  // crypto.randomUUID is available in the Node server runtime.
  return crypto.randomUUID();
}

export async function acceptWaitlistInvite(token: string): Promise<AcceptResult> {
  const supabase = createAdminClient();

  // 1. Load + validate the invite (service role bypasses RLS — token is the key).
  const { data: entry, error } = await supabase
    .from("waitlist_entries")
    .select(
      `id, status, dancer_id, family_id, parent_user_id, class_id, section_id,
       meeting_id, class_tier_id, form_data, invitation_expires_at,
       classes ( name, semester_id, semesters ( name ) )`,
    )
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !entry) {
    return { ok: false, reason: "invalid", message: "This link is not valid." };
  }
  // Accept both the admin manual invite ("invited") and an auto-promotion offer
  // ("offered" — the engine reserved the seat with a waitlist_offer placeholder).
  if (entry.status !== "invited" && entry.status !== "offered") {
    return {
      ok: false,
      reason: "not_invited",
      message:
        entry.status === "registered"
          ? "This registration has already been completed."
          : "This invitation is no longer active.",
    };
  }
  if (
    entry.invitation_expires_at &&
    new Date(entry.invitation_expires_at) < new Date()
  ) {
    return {
      ok: false,
      reason: "expired",
      message: "This invitation has expired. Please contact AYDT for a new one.",
    };
  }

  const classRel = entry.classes as
    | { name?: string; semester_id?: string; semesters?: { name?: string } | { name?: string }[] }
    | { name?: string; semester_id?: string; semesters?: { name?: string } | { name?: string }[] }[]
    | null;
  const cls = Array.isArray(classRel) ? classRel[0] : classRel;
  const semesterId = cls?.semester_id;
  const semRel = Array.isArray(cls?.semesters) ? cls?.semesters[0] : cls?.semesters;
  const semesterName = semRel?.name ?? "";

  if (!semesterId) {
    return { ok: false, reason: "invalid", message: "Could not resolve the class." };
  }

  // 2. Path A needs an existing dancer. New prospects go through admin Path B.
  const dancerId = (entry.dancer_id as string | null) ?? null;
  if (!dancerId) {
    return {
      ok: false,
      reason: "needs_admin",
      message:
        "An AYDT administrator will reach out to finalize this registration. " +
        "No action is needed from you right now.",
    };
  }

  // 3. Compute the balance owed (full price — nothing collected yet). familyId is
  //    passed so the engine doesn't need an auth session.
  let amountDueNow = 0;
  let quote;
  try {
    quote = await computePricingQuote({
      semesterId,
      familyId: (entry.family_id as string | null) ?? undefined,
      enrollments: [
        {
          dancerId,
          scheduleIds: entry.section_id ? [entry.section_id as string] : undefined,
          sessionIds: entry.meeting_id ? [entry.meeting_id as string] : undefined,
          classTierIdsBySchedule:
            entry.section_id && entry.class_tier_id
              ? { [entry.section_id as string]: entry.class_tier_id as string }
              : undefined,
          classTierIdsBySession:
            entry.meeting_id && entry.class_tier_id
              ? { [entry.meeting_id as string]: entry.class_tier_id as string }
              : undefined,
        },
      ],
      paymentPlanType: "pay_in_full",
    });
    amountDueNow = quote.amountDueNow ?? quote.grandTotal ?? 0;
  } catch (err) {
    console.error("[acceptWaitlistInvite] pricing failed:", err);
    return {
      ok: false,
      reason: "pricing",
      message: "We couldn't calculate your balance. Please contact AYDT.",
    };
  }

  // 4. Mint a pending order + enrollment keyed to a fresh batchId.
  const batchId = uuid();
  const formData = (entry.form_data as Record<string, unknown> | null) ?? {};

  const { error: orderErr } = await supabase.from("registration_orders").insert({
    id: batchId,
    family_id: (entry.family_id as string | null) ?? null,
    parent_id: (entry.parent_user_id as string | null) ?? null,
    semester_id: semesterId,
    tuition_total: quote.tuitionSubtotal ?? 0,
    registration_fee_total: quote.registrationFeeTotal ?? 0,
    recital_fee_total: quote.recitalFeeTotal ?? 0,
    family_discount_amount: quote.familyDiscountAmount ?? 0,
    auto_pay_admin_fee_total: quote.autoPayAdminFeeTotal ?? 0,
    grand_total: quote.grandTotal ?? amountDueNow,
    payment_plan_type: "pay_in_full",
    amount_due_now: amountDueNow,
    cart_snapshot: [{ dancerId, classId: entry.class_id }],
    form_data: formData,
    status: "pending",
  });
  if (orderErr) {
    return { ok: false, reason: "payment", message: orderErr.message };
  }

  // Release the seat that was reserved for this claimer — a waitlist_offer
  // placeholder (auto-engine) or an admin_reserved hold (refund assignment) — so
  // capacity has room for the enrollment insert below. Restored if it fails so
  // the held seat isn't lost.
  const grainCol = entry.section_id ? "section_id" : entry.meeting_id ? "meeting_id" : null;
  const grainVal = (entry.section_id as string | null) ?? (entry.meeting_id as string | null);
  let releasedPlaceholderId: string | null = null;
  if (grainCol && grainVal) {
    const { data: ph } = await supabase
      .from("seat_holds")
      .select("id")
      .in("hold_type", ["waitlist_offer", "admin_reserved"])
      .is("released_at", null)
      .eq(grainCol, grainVal)
      .limit(1)
      .maybeSingle();
    if (ph) {
      await supabase
        .from("seat_holds")
        .update({ released_at: new Date().toISOString() })
        .eq("id", (ph as { id: string }).id);
      releasedPlaceholderId = (ph as { id: string }).id;
    }
  }
  const restorePlaceholder = async () => {
    if (releasedPlaceholderId) {
      await supabase.from("seat_holds").update({ released_at: null }).eq("id", releasedPlaceholderId);
    }
  };

  const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  if (entry.section_id) {
    const { error: enrErr } = await supabase.from("section_enrollments").insert({
      section_id: entry.section_id as string,
      batch_id: batchId,
      dancer_id: dancerId,
      price_snapshot: 0,
      status: "pending",
      class_tier_id: (entry.class_tier_id as string | null) ?? null,
    });
    if (enrErr) { await restorePlaceholder(); return { ok: false, reason: "payment", message: enrErr.message }; }
  } else if (entry.meeting_id) {
    const { error: enrErr } = await supabase.from("meeting_enrollments").insert({
      dancer_id: dancerId,
      meeting_id: entry.meeting_id as string,
      status: "pending_payment",
      total_amount: 0,
      hold_expires_at: holdExpiresAt,
      registration_batch_id: batchId,
    });
    if (enrErr) { await restorePlaceholder(); return { ok: false, reason: "payment", message: enrErr.message }; }
  } else {
    return {
      ok: false,
      reason: "invalid",
      message: "This entry has no class section or meeting to register into.",
    };
  }

  // 5. Hosted-checkout handoff (immediate sale — doCapture true, no card storage).
  const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const returnUrl = `${siteUrl}/register/confirmation?semester=${semesterId}&batch=${batchId}`;
  const cancelUrl = `${siteUrl}/waitlist/accept/${token}?cancelled=1`;

  let order;
  let session;
  try {
    order = await createEpgOrder({
      amountDollars: amountDueNow,
      currencyCode: "USD",
      description: `${semesterName} Registration (waitlist)`,
      customReference: batchId,
    });
    session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl,
      cancelUrl,
      customReference: batchId,
      doThreeDSecure: true,
      doCapture: true,
    });
  } catch (err) {
    console.error("[acceptWaitlistInvite] EPG session failed:", err);
    return {
      ok: false,
      reason: "payment",
      message: "We couldn't start checkout. Please try again or contact AYDT.",
    };
  }

  // 6. Persist the payment record so the webhook can resolve it by batchId.
  await supabase.from("payments").upsert(
    {
      registration_batch_id: batchId,
      order_id: order.id,
      payment_session_id: session.id,
      custom_reference: batchId,
      amount: amountDueNow,
      currency: "USD",
      state: "pending_authorization",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "custom_reference" },
  );

  if (!session.url) {
    return { ok: false, reason: "payment", message: "No checkout URL returned." };
  }

  // Mark the entry claimed so the auto-promotion engine stops offering/expiring
  // it while payment is in flight (the webhook finalizes pending→confirmed). The
  // seat is now held by the pending enrollment, not the released placeholder.
  await supabase
    .from("waitlist_entries")
    .update({ status: "accepted" })
    .eq("id", entry.id);

  return { ok: true, paymentSessionUrl: session.url };
}
