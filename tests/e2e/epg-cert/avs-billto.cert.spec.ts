/**
 * AVS via billTo-on-session (the 2026-06-02 fix verification).
 *
 * The original avs.cert.spec.ts set the address on the Shopper's
 * `primaryAddress` and got `addressPostalCode: "unprovided"` back — Justin
 * Huffines confirmed (2026-06-02) that AVS does NOT read primaryAddress; it
 * reads the `card.billTo` captured when the hostedCard is created at the HPP.
 * Production now sends `billTo` on the tokenize-only payment-session, and the
 * account's HPP form was switched to display the billing-address fields.
 *
 * This spec proves the fix end-to-end on the cert sandbox:
 *   1. tokenize-only session WITH billTo (street=1 Test Street, postal=20001 →
 *      Visa AVS=Y per the STP Test Host doc) → HPP renders the address pre-filled.
 *   2. fillHostedCardPage enters the Visa approval card → hostedCard token (the
 *      address rides along on the token, NOT on the Shopper).
 *   3. Plain Shopper with NO primaryAddress (to prove the address comes from the
 *      hostedCard billTo, not the Shopper) → Stored Card → S2S CoF charge.
 *   4. Assert verificationResults.addressPostalCode flips from "unprovided" to an
 *      evaluated value (expected "matched" for AVS=Y). Artifact captured for Justin.
 *
 * Gated behind EPG_CERT_RUN (real sandbox transactions). Visa only.
 */

import { test, expect } from "@playwright/test";
import { createEpgOrder, createEpgStoredCard, createEpgTransaction } from "@/utils/payment/epg";
import {
  preflight,
  fillHostedCardPage,
  waitForHostedToken,
  createCertSession,
  createCertShopper,
  snapshotDb,
  writeArtifact,
  requireEnv,
} from "./harness";
import { APPROVAL_CARDS, AVS_POSTAL, AVS_STREET, type CertScenario } from "./scenarios";

const RUN = !!process.env.EPG_CERT_RUN;

/** Visa approval card (CVV match) for driving the hosted page. */
const VISA_CARD: CertScenario = {
  id: "avs-billto-visa",
  description: "visa approval card for billTo AVS",
  kind: "approval",
  brand: "visa",
  pan: APPROVAL_CARDS.visa,
  centsSuffix: ".00",
  expectedAuth: "approved",
  ready: true,
};

test.describe("EPG cert — AVS via billTo on the session", () => {
  test.skip(!RUN, "Set EPG_CERT_RUN=1 to run cert transactions against the sandbox.");

  test.beforeAll(async () => {
    await preflight();
  });

  test("avs-billto-visa-Y — address from hostedCard billTo evaluates (expect matched)", async ({ page }) => {
    test.setTimeout(180_000);
    const ranAt = new Date().toISOString();
    const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
    const stamp = Date.now();
    const customReference = `cert-avsbillto-Y-${stamp}`;
    const shopperRef = `cert-avsbillto-shopper-${stamp}`;
    const postalCode = AVS_POSTAL.visa.Y; // "20001" → AVS=Y for Visa

    // 1. Tokenize-only session WITH billTo → HPP shows the address pre-filled.
    const order = await createEpgOrder({
      amountDollars: 15,
      currencyCode: "USD",
      description: "Cert AVS billTo setup",
      customReference,
    });
    const session = await createCertSession({
      orderHref: order.href,
      returnUrl: `${siteUrl}/register/confirmation?cert=avsbillto-Y`,
      cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
      customReference,
      doCreateTransaction: false,
      doThreeDSecure: false,
      doCapture: false,
      billTo: { fullName: "Cert AVS", street1: AVS_STREET, city: "New York", region: "NY", postalCode },
    });

    // 2. Enter the card on the HPP (address is already pre-filled from billTo).
    await page.goto(session.url);
    await fillHostedCardPage(page, VISA_CARD);
    const hostedCardHref = await waitForHostedToken(session.href, "card");

    // 3. Shopper with NO address — proves AVS comes from the hostedCard billTo.
    const shopper = await createCertShopper({
      customReference: shopperRef,
      fullName: "Cert AVS billTo",
      email: "avs-billto@example.com",
    });
    const storedCard = await createEpgStoredCard({
      shopperHref: shopper.href,
      hostedCardHref,
      customReference,
    });
    const charge = await createEpgTransaction({
      storedCardHref: storedCard.href,
      shopperHref: shopper.href,
      amountDollars: 15,
      currencyCode: "USD",
      customReference: `${customReference}-charge`,
      description: "Cert AVS billTo charge",
      doCapture: true,
    });

    const vr = (charge as unknown as {
      verificationResults?: { addressPostalCode?: string; addressStreet?: string };
    }).verificationResults;

    const postalResult = vr?.addressPostalCode ?? null;
    const streetResult = vr?.addressStreet ?? null;
    // eslint-disable-next-line no-console
    console.log(`[avs-billto] addressPostalCode=${postalResult} addressStreet=${streetResult} (was 'unprovided' before the fix)`);

    writeArtifact({
      scenarioId: "avs-billto-visa-Y",
      description: `AVS=Y via billTo-on-session (postal ${postalCode}, no Shopper address)`,
      ranAt,
      batchId: customReference,
      expected: { avsCode: "Y", addressPostalCode: "matched", addressStreet: "matched" },
      observed: {
        state: charge.state,
        isAuthorized: charge.isAuthorized,
        addressPostalCode: postalResult,
        addressStreet: streetResult,
      },
      epgTransaction: charge,
      dbState: await snapshotDb(customReference),
      passed: charge.isAuthorized === true && postalResult !== null && postalResult !== "unprovided",
    });

    // The fix: AVS must now be EVALUATED (no longer "unprovided").
    expect(charge.isAuthorized).toBe(true);
    expect(postalResult).not.toBe("unprovided");
    expect(postalResult).not.toBeNull();
  });
});
