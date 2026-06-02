import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * reconcile-installment-setup — safety-net cron for installment stored-card setup.
 *
 * Installment hosted-page sessions are tokenize-only (doCreateTransaction:false),
 * so they fire NO `saleAuthorized` webhook. The PRIMARY trigger that stores the
 * card + charges installment 1 + confirms the batch is the returnUrl handoff
 * (the confirmation page POSTs /api/register/finalize-installment). If the family
 * closes the tab / loses connectivity before that handoff runs, the batch would
 * be stuck: a tokenized card sitting on the EPG session, but no stored card and
 * an unconfirmed order.
 *
 * This cron sweeps those orphans and re-drives the SAME idempotent endpoint, so
 * "they entered their card but we never heard back" still converges. It performs
 * NO EPG work itself — it just re-POSTs the Node finalize route, which is the one
 * place the store-and-charge logic lives (Deno can't import the Node EPG client,
 * the same boundary process-overdue-payments lives with).
 *
 * Sweeps any PENDING installment order that started a hosted session, regardless
 * of whether a card was stored yet — so it recovers BOTH "card never stored"
 * (handoff never ran) AND "card stored but installment 1 not charged" (a crash
 * between the two steps). The finalize route → helper is idempotent and bounded:
 * it reuses an already-stored card without re-tokenizing, skips paid installments,
 * and stops after the declined-attempt cap, so re-sweeping is always safe.
 *
 * Window: orders are marked 'failed' by expire_stale_registration_holds after a
 * 30-minute grace (see 20260529000001_installment_order_grace_window.sql), so we
 * only sweep PENDING installment orders between ~1 minute and 2 hours old (the
 * lower bound gives the returnUrl handoff first crack; the upper bound caps churn
 * on abandoned orders the grace cron will fail anyway).
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const siteUrl = Deno.env.get("SITE_URL") ?? "https://aydt.com";

Deno.serve(async () => {
  const nowMs = Date.now();
  const oneMinAgo = new Date(nowMs - 60 * 1000).toISOString();
  const twoHoursAgo = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();

  // 1. Candidate orders: pending installment plans, in-window. (No stored-method
  //    filter — the helper is idempotent and also handles the charge-retry case.)
  const { data: candidates, error: candErr } = await supabase
    .from("registration_orders")
    .select("id")
    .eq("payment_plan_type", "installments")
    .eq("status", "pending")
    .lt("created_at", oneMinAgo)
    .gt("created_at", twoHoursAgo);

  if (candErr) {
    console.error("[reconcile-installment-setup] candidate query failed:", candErr.message);
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const candidateIds = (candidates ?? []).map((c) => c.id);
  if (candidateIds.length === 0) {
    return new Response(JSON.stringify({ swept: 0, finalized: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Keep only the ones that actually started a hosted session — otherwise
  //    there is no card to store and finalize would be a guaranteed no-op.
  const { data: withSession } = await supabase
    .from("payments")
    .select("custom_reference, payment_session_id")
    .in("custom_reference", candidateIds)
    .not("payment_session_id", "is", null);

  const batchIds = (withSession ?? []).map((p) => p.custom_reference as string);

  let finalized = 0;
  let declined = 0;
  let other = 0;

  // 3. Re-drive the idempotent finalize route for each orphan.
  for (const batchId of batchIds) {
    try {
      const res = await fetch(`${siteUrl}/api/register/finalize-installment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        result?: string;
      };
      if (data.status === "confirmed" || data.result === "stored_and_charged") {
        finalized++;
        console.log(`[reconcile-installment-setup] finalized batch ${batchId}`);
      } else if (data.result === "declined") {
        declined++;
        console.warn(`[reconcile-installment-setup] batch ${batchId} installment-1 declined — needs manual retry`);
      } else {
        other++;
        console.log(`[reconcile-installment-setup] batch ${batchId} → status=${data.status} result=${data.result}`);
      }
    } catch (err) {
      other++;
      console.error(`[reconcile-installment-setup] finalize POST failed for batch ${batchId}:`, err);
    }
  }

  const summary = { swept: batchIds.length, finalized, declined, other };
  console.log("[reconcile-installment-setup] done:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
