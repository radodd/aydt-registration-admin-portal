/**
 * AVS matrix (Justin checklist item 5 — AVS variations).
 *
 * The EPG hosted page collects NO billing address/ZIP (confirmed live: a HPP
 * sale returns addressPostalCode "unprovided"). So AVS Y/Z/A/N can't be driven
 * through the hosted page. Instead we drive AVS via a STORED-CARD charge whose
 * Shopper carries a billTo postal code — the postal's first character forces
 * the AVS response per the Elavon STP Test Host doc (pages 4-7).
 *
 * Per AVS code: doCapture:false HPP session → hostedCard token → Shopper with
 * billTo postal=AVS_POSTAL → Stored Card → S2S charge → assert authorized and
 * capture the transaction's verificationResults for the analyst.
 *
 * Visa only by default (the postal→AVS mapping is brand-specific; Visa's numeric
 * postals are the cleanest). Gated behind EPG_CERT_RUN.
 */

import { test, expect } from "@playwright/test";
import {
  createEpgOrder,
  fetchEpgShopperByReference,
  createEpgStoredCard,
  createEpgTransaction,
} from "@/utils/payment/epg";
import { preflight, fillHostedCardPage, waitForHostedToken, createCertSession, createCertShopper, snapshotDb, writeArtifact, requireEnv } from "./harness";
import { APPROVAL_CARDS, AVS_POSTAL, AVS_STREET, JUSTIN_AVS_CODES, type CertScenario } from "./scenarios";

const RUN = !!process.env.EPG_CERT_RUN;

/** Visa approval card for driving the hosted page (CVV match). */
const VISA_CARD: CertScenario = {
  id: "avs-visa-card",
  description: "visa card for AVS",
  kind: "approval",
  brand: "visa",
  pan: APPROVAL_CARDS.visa,
  centsSuffix: ".00",
  expectedAuth: "approved",
  ready: true,
};

/**
 * Expected verificationResults per AVS code (full=Y, zip-only=Z, addr-only=A,
 * none=N). Values are captured for the analyst; the assertion is lenient
 * (authorized) since AVS mismatch typically doesn't hard-decline.
 */
const AVS_EXPECTATION: Record<string, { postal: string; street: string }> = {
  Y: { postal: "matched", street: "matched" },
  Z: { postal: "matched", street: "notMatched" },
  A: { postal: "notMatched", street: "matched" },
  N: { postal: "notMatched", street: "notMatched" },
};

test.describe("EPG cert — AVS matrix (stored-card)", () => {
  test.skip(!RUN, "Set EPG_CERT_RUN=1 to run cert transactions against the sandbox.");

  test.beforeAll(async () => {
    await preflight();
  });

  for (const code of JUSTIN_AVS_CODES) {
    test(`avs-visa-${code} — AVS=${code} via stored card`, async ({ page }) => {
      test.setTimeout(150_000);
      // BLOCKED: the S2S stored-card charge is declined by the 3DS-enforcing
      // account (3dsEnforcedOnEcommerceSales). The API has NO per-transaction
      // MIT flag (probed: shopperInteraction enum rejects recurring/merchant/
      // moto/installment/unscheduled; credentialOnFile unrecognized). Needs
      // Justin / account-config. Setup (session→token→shopper→stored card via
      // primaryAddress) is validated; only the final charge is blocked.
      test.skip(true, "S2S recurring charge blocked by 3DS enforcement — no MIT flag; pending Justin");
      const ranAt = new Date().toISOString();
      const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
      const customReference = `cert-avs-${code}-${Date.now()}`;
      const shopperRef = `cert-avs-shopper-${code}-${Date.now()}`;
      const postalCode = AVS_POSTAL.visa[code];

      // 1. doCapture:false HPP session → hostedCard token.
      const order = await createEpgOrder({
        amountDollars: 15,
        currencyCode: "USD",
        description: `Cert AVS ${code} setup`,
        customReference,
      });
      // doCreateTransaction:false → pure tokenization, so the hosted-card token
      // is NOT consumed by an auth (and 3DS isn't triggered without a sale).
      const session = await createCertSession({
        orderHref: order.href,
        returnUrl: `${siteUrl}/register/confirmation?cert=avs-${code}`,
        cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
        customReference,
        doCreateTransaction: false,
        doThreeDSecure: false,
        doCapture: false,
      });

      await page.goto(session.url);
      await fillHostedCardPage(page, VISA_CARD);

      const hostedCardHref = await waitForHostedToken(session.href, "card");

      // 2. Shopper with billTo postal that forces the target AVS code.
      const shopper =
        (await fetchEpgShopperByReference(shopperRef).catch(() => null)) ??
        (await createCertShopper({
          customReference: shopperRef,
          fullName: "Cert AVS",
          email: "avs@example.com",
          primaryAddress: { street1: AVS_STREET, city: "New York", region: "NY", postalCode },
        }));

      // 3. Stored card → S2S charge (AVS evaluated at charge time from billTo).
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
        description: `Cert AVS ${code} charge`,
        doCapture: true,
      });

      const vr = (charge as unknown as { verificationResults?: { addressPostalCode?: string; addressStreet?: string } })
        .verificationResults;

      writeArtifact({
        scenarioId: `avs-visa-${code}`,
        description: `AVS=${code} via stored card (postal ${postalCode})`,
        ranAt,
        batchId: customReference,
        expected: { avsCode: code, postal: AVS_EXPECTATION[code], shopperPostal: postalCode },
        observed: {
          state: charge.state,
          isAuthorized: charge.isAuthorized,
          addressPostalCode: vr?.addressPostalCode ?? null,
          addressStreet: vr?.addressStreet ?? null,
        },
        epgTransaction: charge,
        dbState: await snapshotDb(customReference),
        passed: charge.isAuthorized === true,
      });

      // Lenient: AVS mismatch doesn't necessarily decline. The AVS result is
      // captured above for the analyst; we just confirm the charge processed.
      expect(charge.isAuthorized).toBe(true);
    });
  }
});
