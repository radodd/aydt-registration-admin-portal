import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { refundEpgTransaction } from "@/utils/payment/epg";

export const runtime = "nodejs";

const serviceClient = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Refunds blocked after this many days from confirmed_at (standard industry limit)
const REFUND_WINDOW_DAYS = 180;

// admin_reserved placeholder holds never lapse on their own — they persist until
// an admin assigns or reopens the seat. Far-future so they always count as active.
const ADMIN_HOLD_EXPIRY = () => new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();

/**
 * Meeting-plan (2026-06-10): a FULL refund withdraws the family, which frees
 * their seat(s). Per the decision, a refund-freed seat is NOT auto-promoted and
 * does NOT silently reopen to the public — it is HELD for the admin:
 *   1. cancel the enrollment row(s) → frees capacity (also fixes the prior bug
 *      where a refund left the enrollment "confirmed" and the seat occupied);
 *   2. place an `admin_reserved` placeholder hold on each freed seat so the
 *      public cannot grab it before the admin acts;
 *   3. log a `seat_freed` event — the admin then assigns from the waitlist
 *      (queue present) or reopens to the public (no queue) from /admin/waitlist.
 *
 * Best-effort: the financial refund already succeeded, so any failure here is
 * logged (as an `error` event the admin sees in /admin/logs) but never fails the
 * response — the seat just needs manual cleanup.
 */
async function holdRefundFreedSeats(batchId: string): Promise<void> {
  const farFuture = ADMIN_HOLD_EXPIRY();

  const [{ data: sections }, { data: meetings }] = await Promise.all([
    serviceClient
      .from("section_enrollments")
      .select("id, section_id, class_sections(class_id, semester_id)")
      .eq("batch_id", batchId)
      .neq("status", "cancelled"),
    serviceClient
      .from("meeting_enrollments")
      .select("id, meeting_id, class_meetings(class_id, semester_id)")
      .eq("registration_batch_id", batchId)
      .neq("status", "cancelled"),
  ]);

  type Seat = {
    grain: "section" | "meeting";
    table: "section_enrollments" | "meeting_enrollments";
    enrollmentId: string;
    sectionId: string | null;
    meetingId: string | null;
    classId: string | null;
    semesterId: string | null;
  };
  const seats: Seat[] = [];
  for (const r of sections ?? []) {
    const rel: any = Array.isArray((r as any).class_sections) ? (r as any).class_sections[0] : (r as any).class_sections;
    seats.push({ grain: "section", table: "section_enrollments", enrollmentId: (r as any).id, sectionId: (r as any).section_id, meetingId: null, classId: rel?.class_id ?? null, semesterId: rel?.semester_id ?? null });
  }
  for (const r of meetings ?? []) {
    const rel: any = Array.isArray((r as any).class_meetings) ? (r as any).class_meetings[0] : (r as any).class_meetings;
    seats.push({ grain: "meeting", table: "meeting_enrollments", enrollmentId: (r as any).id, sectionId: null, meetingId: (r as any).meeting_id, classId: rel?.class_id ?? null, semesterId: rel?.semester_id ?? null });
  }

  for (const seat of seats) {
    try {
      // 1. cancel enrollment → frees capacity
      const { error: cancelErr } = await serviceClient
        .from(seat.table)
        .update({ status: "cancelled" })
        .eq("id", seat.enrollmentId);
      if (cancelErr) throw new Error(`cancel ${seat.table}: ${cancelErr.message}`);

      // 2. place the admin_reserved placeholder (held from the public)
      const { error: holdErr } = await serviceClient.from("seat_holds").insert({
        section_id: seat.sectionId,
        meeting_id: seat.meetingId,
        user_id: null,
        hold_type: "admin_reserved",
        semester_id: seat.semesterId,
        class_id: seat.classId,
        expires_at: farFuture,
      });
      if (holdErr) throw new Error(`placeholder hold: ${holdErr.message}`);

      // 3. queue check drives which admin action will be offered
      let queueSize = 0;
      if (seat.classId) {
        const { count } = await serviceClient
          .from("waitlist_entries")
          .select("id", { count: "exact", head: true })
          .eq("class_id", seat.classId)
          .eq("status", "waiting");
        queueSize = count ?? 0;
      }

      // 4. log the freed seat for the admin surface
      await serviceClient.from("waitlist_promotion_events").insert({
        event_type: "seat_freed",
        severity: "info",
        class_id: seat.classId,
        section_id: seat.sectionId,
        meeting_id: seat.meetingId,
        semester_id: seat.semesterId,
        batch_id: batchId,
        message:
          queueSize > 0
            ? `Seat freed by full refund — ${queueSize} on the waitlist; assign from the queue.`
            : "Seat freed by full refund — no queue; you can reopen it to the public.",
        detail: { reason: "refund_freed", grain: seat.grain, queue_size: queueSize },
      });
    } catch (e) {
      console.error("[refund-route] free/hold refund seat failed:", e);
      await serviceClient
        .from("waitlist_promotion_events")
        .insert({
          event_type: "error",
          severity: "error",
          class_id: seat.classId,
          section_id: seat.sectionId,
          meeting_id: seat.meetingId,
          semester_id: seat.semesterId,
          batch_id: batchId,
          message: "Could not free/hold a refund-freed seat — needs manual cleanup.",
          detail: { reason: "refund_freed", grain: seat.grain, error: e instanceof Error ? e.message : String(e) },
        })
        .then(() => {}, () => {});
    }
  }
}

/**
 * POST /api/admin/payments/refund
 *
 * Issues a full or partial refund on a settled EPG transaction.
 * Only callable by authenticated admins.
 * Only valid when payments.state is "settled".
 *
 * Body:
 *   paymentId: string
 *   reason: string          — required, min 10 chars
 *   amount?: number         — partial refund amount in dollars; omit for full refund
 *   lineItems?: Array<{     — optional line-item breakdown for partial refunds
 *     registrationId: string;
 *     className: string;
 *     amount: number;
 *   }>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse body
  let body: { paymentId?: string; reason?: string; amount?: number; lineItems?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { paymentId, reason, amount, lineItems } = body;
  if (!paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  if (!reason?.trim() || reason.trim().length < 10) {
    return NextResponse.json({ error: "Reason must be at least 10 characters" }, { status: 400 });
  }

  // Fetch payment + batch
  const { data: payment } = await serviceClient
    .from("payments")
    .select("id, transaction_id, state, amount, currency, registration_batch_id, raw_transaction")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  // Business rule: refund only for settled transactions
  if (payment.state !== "settled") {
    return NextResponse.json(
      { error: `Cannot refund a payment in state "${payment.state}". Refund is only available for settled transactions.` },
      { status: 422 },
    );
  }

  if (!payment.transaction_id) {
    return NextResponse.json({ error: "No EPG transaction ID on record — cannot refund" }, { status: 422 });
  }

  // Business rule: 180-day refund window
  const { data: batch } = await serviceClient
    .from("registration_orders")
    .select("confirmed_at")
    .eq("id", payment.registration_batch_id)
    .maybeSingle();

  if (batch?.confirmed_at) {
    const confirmedAt = new Date(batch.confirmed_at);
    const daysSince = (Date.now() - confirmedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > REFUND_WINDOW_DAYS) {
      return NextResponse.json(
        { error: `Refund window has expired. Refunds are only available within ${REFUND_WINDOW_DAYS} days of the original payment.` },
        { status: 422 },
      );
    }
  }

  // Business rule: partial refund cannot exceed original amount minus prior refunds
  if (amount != null) {
    if (amount <= 0) {
      return NextResponse.json({ error: "Refund amount must be greater than $0" }, { status: 400 });
    }

    const { data: priorRefunds } = await serviceClient
      .from("payment_refunds")
      .select("amount")
      .eq("payment_id", paymentId)
      .eq("status", "succeeded")
      .eq("type", "refund");

    const totalPriorRefunded = (priorRefunds ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const maxRefundable = Number(payment.amount) - totalPriorRefunded;

    if (amount > maxRefundable) {
      return NextResponse.json(
        { error: `Refund amount $${amount.toFixed(2)} exceeds the refundable balance of $${maxRefundable.toFixed(2)}` },
        { status: 422 },
      );
    }
  }

  // Create pending refund record
  const { data: refundRecord, error: insertErr } = await serviceClient
    .from("payment_refunds")
    .insert({
      payment_id: payment.id,
      batch_id: payment.registration_batch_id,
      type: "refund",
      amount: amount ?? payment.amount,
      reason: reason.trim(),
      line_items: lineItems ?? null,
      initiated_by: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !refundRecord) {
    console.error("[refund-route] Failed to insert payment_refunds record:", insertErr);
    return NextResponse.json({ error: "Failed to record refund attempt" }, { status: 500 });
  }

  const transactionHref =
    (payment.raw_transaction as any)?.href ??
    `${process.env.EPG_BASE_URL}/transactions/${payment.transaction_id}`;

  // Call EPG
  let epgResult;
  try {
    epgResult = await refundEpgTransaction({
      transactionHref,
      amountDollars: amount,
      currencyCode: payment.currency ?? "USD",
      customReference: refundRecord.id,
    });
  } catch (err) {
    console.error("[refund-route] EPG refund failed:", err);
    await serviceClient
      .from("payment_refunds")
      .update({ status: "failed", failure_reason: err instanceof Error ? err.message : "EPG error" })
      .eq("id", refundRecord.id);
    return NextResponse.json({ error: "EPG refund request failed" }, { status: 502 });
  }

  const succeeded = epgResult.state === "authorized" || epgResult.isAuthorized;

  // Update refund record
  await serviceClient
    .from("payment_refunds")
    .update({
      status: succeeded ? "succeeded" : "failed",
      epg_transaction_id: epgResult.id,
      raw_response: epgResult as unknown as Record<string, unknown>,
      failure_reason: succeeded ? null : `EPG state: ${epgResult.state}`,
    })
    .eq("id", refundRecord.id);

  if (!succeeded) {
    return NextResponse.json(
      { error: `Refund was rejected by the processor (state: ${epgResult.state})` },
      { status: 422 },
    );
  }

  // Update payments state — partial refund keeps "settled"; full refund → "refunded"
  const isFullRefund = amount == null || Math.abs(amount - Number(payment.amount)) < 0.01;
  if (isFullRefund) {
    await serviceClient
      .from("payments")
      .update({ state: "refunded", updated_at: new Date().toISOString() })
      .eq("id", payment.id);

    await serviceClient
      .from("registration_orders")
      .update({ status: "refunded" })
      .eq("id", payment.registration_batch_id);

    // Free the seat(s) and hold them for admin assignment / reopen (best-effort).
    if (payment.registration_batch_id) {
      await holdRefundFreedSeats(payment.registration_batch_id as string);
    }
  }

  return NextResponse.json({ ok: true, refundId: refundRecord.id }, { status: 201 });
}
