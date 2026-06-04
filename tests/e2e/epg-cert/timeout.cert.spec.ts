/**
 * Timeout / partial-write scenario (Justin checklist item 5).
 *
 * Justin confirmed (2026-05-30) the dollar-amount timeout control applies to
 * EPG / Converge: a $22.22 transaction is PROCESSED by the host, but the
 * response is BLOCKED from returning to the merchant. This is the canonical
 * "processed-but-no-response" partial write — the issuer may authorize while we
 * never see the result on the synchronous path.
 *
 * What this validates: our handling never produces a FALSE CONFIRMATION from a
 * blocked response. The hosted page is driven with a known-good approval card at
 * $22.22; we then poll the session for a resulting transaction with a bounded
 * window. The expected outcome is that NO authorized transaction surfaces on the
 * synchronous path within the window (the response is blocked).
 *
 * How production recovers (asserted by design, documented here): we NEVER trust
 * the hosted-page return or the webhook payload — the webhook GETs the
 * transaction resource by href to learn the authoritative state, and the
 * reconcile-installment-setup / process-overdue-payments crons re-drive the
 * idempotent finalize path. So a blocked synchronous response converges once the
 * resource becomes readable, without ever double-charging (customReference
 * idempotency).
 *
 * ⚠️ LIVE-CONFIRM SEAM: the exact manifestation of a blocked $22.22 through the
 * EPG HPP (page hangs? transaction never appears on the session? appears in an
 * error state?) is only observable against the live cert sandbox. This spec is
 * written defensively and captures the observed behavior in the artifact for
 * Justin / the analyst rather than asserting an exact transaction state.
 *
 * Gated behind EPG_CERT_RUN.
 */

import { test, expect } from "@playwright/test";
import { createEpgOrder } from "@/utils/payment/epg";
import {
  preflight,
  fillHostedCardPage,
  createCertSession,
  fetchEpgResource,
  waitForSessionTransaction,
  snapshotDb,
  writeArtifact,
  requireEnv,
} from "./harness";
import { buildTimeoutScenario, TIMEOUT } from "./scenarios";

const RUN = !!process.env.EPG_CERT_RUN;

test.describe("EPG cert — timeout / partial-write", () => {
  test.skip(!RUN, "Set EPG_CERT_RUN=1 to run cert transactions against the sandbox.");

  test.beforeAll(async () => {
    await preflight();
  });

  const scenario = buildTimeoutScenario();

  test(`${scenario.id} — ${scenario.description}`, async ({ page }) => {
    test.skip(!scenario.ready, "Timeout scenario gated — flip TIMEOUT.gatewayConfirmed once Justin confirms.");
    test.setTimeout(120_000);

    const ranAt = new Date().toISOString();
    const customReference = `cert-timeout-${Date.now()}`;
    const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");

    // 1. Direct order at the timeout-trigger amount ($22.22), full-sale session
    //    (the path families use — 3DS enforced, capture on).
    const order = await createEpgOrder({
      amountDollars: TIMEOUT.amountDollars,
      currencyCode: "USD",
      description: "Cert timeout / partial-write",
      customReference,
    });
    const session = await createCertSession({
      orderHref: order.href,
      returnUrl: `${siteUrl}/register/confirmation?cert=timeout`,
      cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
      customReference,
      doThreeDSecure: true,
      doCapture: true,
    });

    // 2. Drive the hosted page with a known-good approval card.
    await page.goto(session.url);
    await fillHostedCardPage(page, scenario);

    // 3. Poll the session for a resulting transaction with a SHORT bounded
    //    window. A blocked response means none surfaces synchronously; if one
    //    does appear, capture its state — the only thing we must never see is a
    //    confirmed/authorized result we would have acted on as success.
    let txnHref: string | null = null;
    let blocked = false;
    try {
      txnHref = await waitForSessionTransaction(session.href, { timeoutMs: 30_000, intervalMs: 3_000 });
    } catch {
      // Expected for a true timeout: no transaction returned to the merchant.
      blocked = true;
    }

    const txn = txnHref
      ? await fetchEpgResource<{ state?: string; isAuthorized?: boolean }>(txnHref).catch(() => null)
      : null;

    // The authoritative source is the resource GET, never the synchronous
    // response. If the resource exists and authorized, that's the partial-write
    // we must reconcile (not a synchronous "success"). The failure we guard
    // against is treating the BLOCKED synchronous path as a confirmed sale.
    const sawSynchronousSuccess = !blocked && !!txn && txn.isAuthorized === true;

    writeArtifact({
      scenarioId: scenario.id,
      description: scenario.description,
      ranAt,
      batchId: customReference,
      expected: {
        auth: "blocked",
        note: "No authorized transaction should return on the synchronous path; recovery is via resource GET + reconciliation crons.",
        amount: TIMEOUT.amountDollars,
      },
      observed: {
        blockedSynchronously: blocked,
        transactionHref: txnHref,
        state: txn?.state ?? null,
        isAuthorized: txn?.isAuthorized ?? null,
      },
      epgTransaction: txn,
      dbState: await snapshotDb(customReference),
      passed: blocked || !sawSynchronousSuccess,
    });

    // We must not have observed a synchronous success from a blocked response.
    expect(
      sawSynchronousSuccess,
      "blocked $22.22 must not surface as a synchronous authorized sale — recovery is resource-GET + reconciliation",
    ).toBe(false);
  });
});
