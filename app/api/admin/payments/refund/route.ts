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
  }

  return NextResponse.json({ ok: true, refundId: refundRecord.id }, { status: 201 });
}
