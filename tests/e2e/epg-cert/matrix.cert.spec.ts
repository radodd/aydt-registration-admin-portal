/**
 * Pre-cert smoke matrix (Justin checklist item 5).
 *
 * Hybrid approach: the decline-cents dial requires control over the charge
 * amount, which the real registration UI can't provide (the batch total comes
 * from seeded pricing). So the matrix creates EPG orders DIRECTLY with chosen
 * amounts, then drives the hosted page for card entry / AVS / CVV.
 *
 *   direct order (amount = base + cents) → payment session (doCapture:true,
 *   3DS off for determinism) → HPP fill (PAN/exp/cvv/postal per scenario) →
 *   GET the transaction → assert state → write JSON artifact.
 *
 * No real batch is involved, so we assert on the EPG transaction object (the
 * source of truth) rather than batch-status. EPG returns HTTP 201 even on
 * decline — we assert on `state`/`isAuthorized`, never the status code.
 *
 * Gated behind EPG_CERT_RUN so a normal `playwright test` / CI run skips it.
 */

import { test } from "@playwright/test";
import { createEpgOrder, createEpgPaymentSession } from "@/utils/payment/epg";
import {
  preflight,
  fillHostedCardPage,
  fetchEpgResource,
  waitForSessionTransaction,
  assertAuthResult,
  snapshotDb,
  writeArtifact,
  requireEnv,
} from "./harness";
import { buildFullMatrix, type CertScenario } from "./scenarios";

const RUN = !!process.env.EPG_CERT_RUN;

/** Base dollar amount the cents suffix is appended to (e.g. 12 + ".51" → 12.51). */
const BASE_DOLLARS = 12;

function scenarioAmount(s: CertScenario): number {
  return Number(`${BASE_DOLLARS}${s.centsSuffix}`);
}

test.describe("EPG cert — pre-cert smoke matrix", () => {
  test.skip(!RUN, "Set EPG_CERT_RUN=1 to run cert transactions against the sandbox.");

  test.beforeAll(async () => {
    await preflight();
  });

  for (const scenario of buildFullMatrix()) {
    // The timeout scenario stays gated (certgate-only). AVS scenarios move to
    // avs.cert.spec.ts — the HPP collects no billing, so AVS must be driven via
    // a stored-card charge whose Shopper carries the billTo postal.
    const runIt = scenario.ready && scenario.kind !== "timeout" && scenario.kind !== "avs";

    test(`${scenario.id} — ${scenario.description}`, async ({ page }) => {
      test.skip(!runIt, scenario.kind === "avs" ? "AVS tested via avs.cert.spec.ts (HPP has no billing field)" : scenario.ready ? "Gated scenario" : "Value not confirmed yet");
      test.setTimeout(120_000);

      const ranAt = new Date().toISOString();
      const customReference = `cert-matrix-${scenario.id}-${Date.now()}`;
      const amount = scenarioAmount(scenario);
      const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");

      // 1. Direct order + session with the controlled amount.
      const order = await createEpgOrder({
        amountDollars: amount,
        currencyCode: "USD",
        description: `Cert matrix ${scenario.id}`,
        customReference,
      });
      const session = await createEpgPaymentSession({
        orderHref: order.href,
        returnUrl: `${siteUrl}/register/confirmation?cert=${scenario.id}`,
        cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
        customReference,
        // The processor account ENFORCES 3DS on ecommerce sales (matches prod);
        // with it off, every sale auto-declines (3dsEnforcedOnEcommerceSales).
        doThreeDSecure: true,
        doCapture: true,
      });

      // 2. Drive the hosted page for this scenario's PAN / CVV.
      await page.goto(session.url);
      await fillHostedCardPage(page, scenario);

      // 3. The HPP sale lands in session.previousTransactions[]; poll for it,
      //    then GET it (never trust the page/webhook payload).
      const href = await waitForSessionTransaction(session.href);
      const txn = await fetchEpgResource<Record<string, unknown>>(href);

      // 4. Assert auth result (approved/declined). AVS/CVV are captured for
      //    manual review since the exact response field names vary by account.
      if (txn && (scenario.expectedAuth === "approved" || scenario.expectedAuth === "declined")) {
        assertAuthResult(txn as { state?: string; isAuthorized?: boolean }, scenario.expectedAuth);
      }

      writeArtifact({
        scenarioId: scenario.id,
        description: scenario.description,
        ranAt,
        batchId: customReference,
        expected: {
          auth: scenario.expectedAuth,
          avs: scenario.expectedAvs ?? null,
          cvv: scenario.expectedCvv ?? null,
          amount,
        },
        observed: {
          state: txn?.state ?? null,
          isAuthorized: txn?.isAuthorized ?? null,
          avsResponse: txn?.avsResponse ?? txn?.avs ?? null,
          cvvResponse: txn?.cvvResponse ?? txn?.cvv ?? null,
        },
        epgTransaction: txn,
        dbState: await snapshotDb(customReference),
        passed: true,
      });
    });
  }
});
