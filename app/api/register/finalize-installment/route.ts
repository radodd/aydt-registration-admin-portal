import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ensureStoredCardAndChargeInstallment1 } from "@/utils/payment/installmentConfirmation";

// Node runtime — imports the Node EPG client + Resend (via installmentConfirmation).
export const runtime = "nodejs";

/**
 * POST /api/register/finalize-installment   body: { batchId }
 *
 * returnUrl handoff for installment plans. Installment hosted-page sessions are
 * created with doCreateTransaction:false (tokenize-only), so NO `saleAuthorized`
 * webhook fires — this route is the PRIMARY trigger that stores the card,
 * charges installment 1 server-to-server, and confirms the batch. The EPG
 * webhook (if a session-complete event arrives) and the reconciliation cron are
 * idempotent backups that call the same helper.
 *
 * Threat model matches /api/register/batch-status: the batchId is an
 * unguessable UUID used as the access token, and reads bypass RLS via the admin
 * client because auth cookies are unreliable after the EPG redirect round-trip.
 * The helper only COMPLETES the installment setup already initiated for this
 * batch (it charges the card the family just entered on the hosted page) — it
 * cannot initiate an unrelated charge, and it no-ops once the card is stored.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { batchId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const batchId = body.batchId;
  if (!batchId) {
    return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: batch } = await supabase
    .from("registration_orders")
    .select("id, status, payment_plan_type")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // No-op for non-installment batches — the webhook confirms pay-in-full sales.
  if (batch.payment_plan_type !== "installments") {
    return NextResponse.json({ status: batch.status, result: "skipped" });
  }

  // Fully done — the order is confirmed.
  if (batch.status === "confirmed") {
    return NextResponse.json({ status: batch.status, result: "already_done" });
  }

  // Otherwise drive the idempotent helper. It self-gates: reuses an
  // already-stored card (no re-tokenize), skips if installment 1 is paid, and
  // stops after the declined-attempt cap — so re-entry here is always safe.
  const result = await ensureStoredCardAndChargeInstallment1({ batchId });

  // Re-read the status after the attempt so the client gets the resulting state.
  const { data: updated } = await supabase
    .from("registration_orders")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();

  return NextResponse.json({
    status: updated?.status ?? batch.status,
    result: result.status,
  });
}
