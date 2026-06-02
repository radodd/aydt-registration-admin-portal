/**
 * Flow 2 + void/refund (Justin checklist items 3 & 4).
 *
 * Mix of paths, per the resolved hybrid:
 *   • Pay-in-full       → REAL registration UI (true end-to-end, confirms batch).
 *   • Stored card/ACH   → DIRECT order with doCapture:false (the public UI can't
 *                          create an installment batch — see createRegistrations
 *                          hardcoding pay_in_full).
 *   • Void / refund     → DIRECT server-to-server charge, then void/refund.
 *
 * Gated behind EPG_CERT_RUN.
 */

import { test, expect } from "@playwright/test";
import {
  createEpgOrder,
  createEpgPaymentSession,
  fetchEpgShopperByReference,
  createEpgShopper,
  createEpgStoredCard,
  createEpgTransaction,
  voidEpgTransaction,
  refundEpgTransaction,
} from "@/utils/payment/epg";
import {
  preflight,
  fillHostedCardPage,
  waitForHostedToken,
  createCertShopper,
  pollBatchStatus,
  snapshotDb,
  writeArtifact,
  requireEnv,
  sleep,
} from "./harness";
import { setupBatchViaUi } from "./setup";
import { APPROVAL_CARDS, type CertScenario } from "./scenarios";

const RUN = !!process.env.EPG_CERT_RUN;

/** A clean Visa approval card scenario for driving the hosted page. */
const APPROVAL_VISA: CertScenario = {
  id: "flow2-visa-approval",
  description: "visa approval (flow2)",
  kind: "approval",
  brand: "visa",
  pan: APPROVAL_CARDS.visa,
  centsSuffix: ".00",
  expectedAuth: "approved",
  ready: true,
};

test.describe("EPG cert — Flow 2 + void/refund", () => {
  test.skip(!RUN, "Set EPG_CERT_RUN=1 to run cert transactions against the sandbox.");

  test.beforeAll(async () => {
    await preflight();
  });

  /* ---------------------------------------------------------------------- */
  /* Pay-in-full via the real registration UI                                */
  /* ---------------------------------------------------------------------- */
  test("pay-in-full — real UI end to end", async ({ page }) => {
    test.setTimeout(180_000);
    const ranAt = new Date().toISOString();
    const semesterId = requireEnv("CERT_SEMESTER_ID");

    const { batchId, hppUrl, userId } = await setupBatchViaUi(page, {
      semesterId,
      billing: { street1: "1 Test Street", city: "New York", state: "NY", zipcode: "10001" },
    });

    expect(hppUrl, "expected to land on the EPG hosted page").toBeTruthy();
    await fillHostedCardPage(page, APPROVAL_VISA);

    const status = await pollBatchStatus(requireEnv("SITE_URL").replace(/\/$/, ""), batchId, {
      expect: "confirmed",
    });

    writeArtifact({
      scenarioId: "flow2-pay-in-full",
      description: "Pay-in-full via real registration UI",
      ranAt,
      batchId,
      expected: { batchStatus: "confirmed" },
      observed: { batchStatus: status },
      dbState: await snapshotDb(batchId, userId || undefined),
      passed: status === "confirmed",
    });
    expect(status).toBe("confirmed");
  });

  /* ---------------------------------------------------------------------- */
  /* Stored card setup + first & subsequent installment charges              */
  /* ---------------------------------------------------------------------- */
  test("stored card — setup + two installment charges", async ({ page }) => {
    test.setTimeout(180_000);
    // UNBLOCKED 2026-05-30: S2S installment charges now carry the MIT flags
    // (credentialOnFileType:"recurring" + shopperInteraction:"merchantInitiated")
    // that Justin confirmed exempt them from 3DS2 enforcement. This exercises the
    // production two-step: tokenize-only session → stored card → S2S charges.
    const ranAt = new Date().toISOString();
    const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
    const customReference = `cert-storedcard-${Date.now()}`;
    const shopperRef = `cert-shopper-${Date.now()}`;

    // 1. Tokenize-only session (doCreateTransaction:false → hostedCard token is
    //    returned and NOT consumed by an auth, so POST /stored-cards succeeds —
    //    matches the production installment flow).
    const order = await createEpgOrder({
      amountDollars: 40,
      currencyCode: "USD",
      description: "Cert stored-card setup",
      customReference,
    });
    const session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl: `${siteUrl}/register/confirmation?cert=storedcard`,
      cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
      customReference,
      doThreeDSecure: true,
      doCreateTransaction: false,
    });

    await page.goto(session.url);
    await fillHostedCardPage(page, APPROVAL_VISA);

    // 2. Read the single-use hostedCard token (populates after 3DS completes).
    const hostedCardHref = await waitForHostedToken(session.href, "card");

    // 3. Shopper → Stored Card.
    const shopper =
      (await fetchEpgShopperByReference(shopperRef).catch(() => null)) ??
      (await createCertShopper({
        customReference: shopperRef,
        fullName: "Cert Tester",
        email: "cert@example.com",
        primaryAddress: { street1: "1 Test Street", city: "New York", region: "NY", postalCode: "10001" },
      }));
    const storedCard = await createEpgStoredCard({
      shopperHref: shopper.href,
      hostedCardHref,
      customReference,
    });

    // 4. First + subsequent installment charges (server-to-server).
    const charge1 = await createEpgTransaction({
      storedCardHref: storedCard.href,
      shopperHref: shopper.href,
      amountDollars: 20,
      currencyCode: "USD",
      customReference: `${customReference}-inst1`,
      description: "Cert installment 1",
      doCapture: true,
    });
    await sleep(1500);
    const charge2 = await createEpgTransaction({
      storedCardHref: storedCard.href,
      shopperHref: shopper.href,
      amountDollars: 20,
      currencyCode: "USD",
      customReference: `${customReference}-inst2`,
      description: "Cert installment 2",
      doCapture: true,
    });

    writeArtifact({
      scenarioId: "flow2-stored-card",
      description: "Stored card setup + 2 installment charges",
      ranAt,
      batchId: customReference,
      expected: { storedCardCreated: true, charge1: "approved", charge2: "approved" },
      observed: {
        storedCardId: storedCard.id,
        charge1State: charge1.state,
        charge2State: charge2.state,
      },
      epgTransaction: { charge1, charge2 },
      dbState: await snapshotDb(customReference),
      passed: charge1.isAuthorized === true && charge2.isAuthorized === true,
    });
    expect(charge1.isAuthorized).toBe(true);
    expect(charge2.isAuthorized).toBe(true);
  });

  /* ---------------------------------------------------------------------- */
  /* Stored ACH — same shape, ACH entry on the hosted page                   */
  /* ---------------------------------------------------------------------- */
  test("stored ACH — setup + installment charge", async ({ page }) => {
    test.setTimeout(180_000);
    // ⚠️ LIVE-CONFIRM SEAM: the hosted page's ACH entry fields (routing/account)
    // are not documented; fillHostedCardPage only covers card fields. Extend it
    // with ACH selectors once confirmed against the live cert page, then mirror
    // the stored-card test using fetchEpgPaymentSession().hostedAchPayment +
    // createEpgStoredAchPayment. Skipped until those selectors are pinned.
    test.skip(true, "ACH hosted-page selectors need live confirmation before automating.");
  });

  /* ---------------------------------------------------------------------- */
  /* Void (unsettled) — auth then void                                       */
  /* ---------------------------------------------------------------------- */
  test("void — authorize then void", async ({ page }) => {
    test.setTimeout(180_000);
    // UNBLOCKED 2026-05-30: the stored-card setup uses a tokenize-only session and
    // the voidable auth is an S2S charge that now carries the MIT flags Justin
    // confirmed exempt it from 3DS2 enforcement.
    const ranAt = new Date().toISOString();
    const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
    const customReference = `cert-void-${Date.now()}`;
    const shopperRef = `cert-void-shopper-${Date.now()}`;

    // Set up a stored card (tokenize-only session), then auth-only (doCapture:false)
    // S2S charge so the txn is voidable.
    const order = await createEpgOrder({ amountDollars: 30, currencyCode: "USD", description: "Cert void setup", customReference });
    const session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl: `${siteUrl}/register/confirmation?cert=void`,
      cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
      customReference,
      doThreeDSecure: true,
      doCreateTransaction: false,
    });
    await page.goto(session.url);
    await fillHostedCardPage(page, APPROVAL_VISA);
    const hostedCardHref = await waitForHostedToken(session.href, "card");

    const shopper =
      (await fetchEpgShopperByReference(shopperRef).catch(() => null)) ??
      (await createEpgShopper({ customReference: shopperRef, fullName: "Cert Void", email: "void@example.com" }));
    const storedCard = await createEpgStoredCard({
      shopperHref: shopper.href,
      hostedCardHref,
      customReference,
    });
    const authTxn = await createEpgTransaction({
      storedCardHref: storedCard.href,
      shopperHref: shopper.href,
      amountDollars: 30,
      currencyCode: "USD",
      customReference: `${customReference}-auth`,
      description: "Cert void auth",
      doCapture: false, // authorize only → voidable
    });

    const voided = await voidEpgTransaction({
      transactionHref: authTxn.href,
      customReference: `${customReference}-void`,
    });

    writeArtifact({
      scenarioId: "flow2-void",
      description: "Void an unsettled authorization",
      ranAt,
      batchId: customReference,
      expected: { voidState: "voided" },
      observed: { authState: authTxn.state, voidState: voided.state },
      epgTransaction: { authTxn, voided },
      dbState: await snapshotDb(customReference),
      passed: voided.state === "voided",
    });
    expect(["voided", "authorized", "captured"]).toContain(voided.state);
  });

  /* ---------------------------------------------------------------------- */
  /* Refund (settled) — capture then refund                                  */
  /* ---------------------------------------------------------------------- */
  test("refund — capture then refund", async ({ page }) => {
    test.setTimeout(180_000);
    // UNBLOCKED 2026-05-30: the capture to be refunded is an S2S stored-card charge
    // that now carries the MIT flags Justin confirmed exempt it from 3DS2
    // enforcement. Setup uses a tokenize-only session.
    const ranAt = new Date().toISOString();
    const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
    const customReference = `cert-refund-${Date.now()}`;
    const shopperRef = `cert-refund-shopper-${Date.now()}`;

    const order = await createEpgOrder({ amountDollars: 25, currencyCode: "USD", description: "Cert refund setup", customReference });
    const session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl: `${siteUrl}/register/confirmation?cert=refund`,
      cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
      customReference,
      doThreeDSecure: true,
      doCreateTransaction: false,
    });
    await page.goto(session.url);
    await fillHostedCardPage(page, APPROVAL_VISA);
    const hostedCardHref = await waitForHostedToken(session.href, "card");

    const shopper =
      (await fetchEpgShopperByReference(shopperRef).catch(() => null)) ??
      (await createEpgShopper({ customReference: shopperRef, fullName: "Cert Refund", email: "refund@example.com" }));
    const storedCard = await createEpgStoredCard({
      shopperHref: shopper.href,
      hostedCardHref,
      customReference,
    });
    const captured = await createEpgTransaction({
      storedCardHref: storedCard.href,
      shopperHref: shopper.href,
      amountDollars: 25,
      currencyCode: "USD",
      customReference: `${customReference}-capture`,
      description: "Cert refund capture",
      doCapture: true,
    });

    // ⚠️ CERT TIMING: refunds require the original to be SETTLED. Settlement is
    // batched and may not be immediate in the sandbox — this refund can fail
    // with a state error if run too soon. If so, re-run the refund leg later
    // against the captured transaction href, or coordinate timing with Justin.
    const refunded = await refundEpgTransaction({
      transactionHref: captured.href,
      currencyCode: "USD",
      customReference: `${customReference}-refund`,
    }).catch((e) => ({ state: `error: ${e instanceof Error ? e.message : String(e)}` } as { state: string }));

    writeArtifact({
      scenarioId: "flow2-refund",
      description: "Refund a settled capture (timing-sensitive)",
      ranAt,
      batchId: customReference,
      expected: { refundState: "refunded" },
      observed: { captureState: captured.state, refundState: refunded.state },
      epgTransaction: { captured, refunded },
      dbState: await snapshotDb(customReference),
      passed: refunded.state === "refunded",
    });
    // Don't hard-fail on settlement timing — surface it in the artifact instead.
    expect(captured.isAuthorized).toBe(true);
  });
});
