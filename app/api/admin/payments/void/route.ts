import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { voidEpgTransaction } from "@/utils/payment/epg";

export const runtime = "nodejs";

const serviceClient = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/admin/payments/void
 *
 * Voids an unsettled EPG transaction. Only callable by authenticated admins.
 * Only valid when payments.state is "authorized" or "captured".
 *
 * Body: { paymentId: string; reason: string }
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
  let body: { paymentId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { paymentId, reason } = body;
  if (!paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  if (!reason?.trim() || reason.trim().length < 10) {
    return NextResponse.json({ error: "Reason must be at least 10 characters" }, { status: 400 });
  }

  // Fetch payment record
  const { data: payment } = await serviceClient
    .from("payments")
    .select("id, transaction_id, state, amount, currency, registration_batch_id, raw_transaction")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  // Business rule: void only for pre-settlement states
  const voidableStates = ["authorized", "captured"];
  if (!voidableStates.includes(payment.state)) {
    return NextResponse.json(
      { error: `Cannot void a payment in state "${payment.state}". Void is only available for authorized or captured transactions.` },
      { status: 422 },
    );
  }

  if (!payment.transaction_id) {
    return NextResponse.json({ error: "No EPG transaction ID on record — cannot void" }, { status: 422 });
  }

  // Create pending refund record for audit trail
  const { data: refundRecord, error: insertErr } = await serviceClient
    .from("payment_refunds")
    .insert({
      payment_id: payment.id,
      batch_id: payment.registration_batch_id,
      type: "void",
      amount: payment.amount,
      reason: reason.trim(),
      initiated_by: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !refundRecord) {
    console.error("[void-route] Failed to insert payment_refunds record:", insertErr);
    return NextResponse.json({ error: "Failed to record void attempt" }, { status: 500 });
  }

  // Get transaction href from raw_transaction or construct it
  const transactionHref =
    (payment.raw_transaction as any)?.href ??
    `${process.env.EPG_BASE_URL}/transactions/${payment.transaction_id}`;

  // Call EPG
  let epgResult;
  try {
    epgResult = await voidEpgTransaction({
      transactionHref,
      customReference: refundRecord.id,
    });
  } catch (err) {
    console.error("[void-route] EPG void failed:", err);
    await serviceClient
      .from("payment_refunds")
      .update({ status: "failed", failure_reason: err instanceof Error ? err.message : "EPG error" })
      .eq("id", refundRecord.id);
    return NextResponse.json({ error: "EPG void request failed" }, { status: 502 });
  }

  const succeeded = epgResult.state === "voided" || epgResult.isAuthorized;

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
      { error: `Void was rejected by the processor (state: ${epgResult.state})` },
      { status: 422 },
    );
  }

  // Update payments state
  await serviceClient
    .from("payments")
    .update({ state: "voided", updated_at: new Date().toISOString() })
    .eq("id", payment.id);

  // Update batch status
  await serviceClient
    .from("registration_orders")
    .update({ status: "refunded" })
    .eq("id", payment.registration_batch_id);

  return NextResponse.json({ ok: true, refundId: refundRecord.id }, { status: 201 });
}
