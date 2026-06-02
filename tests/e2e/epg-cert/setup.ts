/**
 * EPG certification harness — batch setup via the REAL registration UI.
 *
 * Drives the actual public registration flow with Playwright so the cert
 * transaction exercises the same code path a family hits. Updated for the
 * Phase 3b tiered/drop-in family UI:
 *
 *   sign in → open a class accordion on /semester/[id] → add a session to the
 *   cart (standard "Add to Cart" or tiered "Register · {tier}") → participants
 *   (assign an ELIGIBLE dancer) → registration-info step (Continue) → payment
 *   (billing auto-loads from the profile → Proceed) → redirect to the EPG HPP.
 *
 * Returns the batchId + HPP URL so the spec can fill the hosted page and then
 * poll/snapshot by batchId.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEPENDENCIES (must exist in the cert DB before running):
 *   • A PUBLISHED semester with at least one session that has open capacity
 *     AND at least one age-eligible dancer on the cert family for that class.
 *   • A confirmed family/parent user (CERT_USER_EMAIL / CERT_USER_PASSWORD)
 *     with a COMPLETE address on its users row (so AVS data flows — item 2)
 *     and at least one dancer.
 *   • Tuition rate bands configured for the semester (else the pricing quote
 *     fails and the Proceed button stays blocked).
 *
 * SELECTOR SEAMS: the public UI has no test ids; steps below use the actual
 * class strings rendered by the Phase 3b components (ClassCard / TierPicker /
 * ParticipantsContent / PaymentContent) as of this writing. Run --headed the
 * first time and tighten if the live markup differs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { type Page, type Locator, expect } from "@playwright/test";
import { requireEnv, epgBaseUrl } from "./harness";

export interface BatchSetupResult {
  batchId: string;
  hppUrl: string;
  /** The signed-in parent's user id (for AVS / shopper assertions). */
  userId: string;
}

/** Sign in through the public /auth form (mirrors tests/e2e/shared/auth.ts). */
export async function signInCertUser(page: Page): Promise<void> {
  const email = requireEnv("CERT_USER_EMAIL");
  const password = requireEnv("CERT_USER_PASSWORD");
  await page.goto("/auth");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/auth") && !u.pathname.startsWith("/auth/login"), {
      timeout: 15_000,
    }),
    page.locator("#login-password").press("Enter"),
  ]);
}

/**
 * Open the first addable class accordion on the semester page and add a
 * session to the cart. Prefers standard ("Add to Cart") and tiered
 * ("Register · {tier}", auto-selected default tier) classes; skips drop-in
 * classes whose footer needs an explicit date selection.
 *
 * Confirms the add by waiting for the cart drawer's "Review Cart & Continue".
 */
export async function addFirstAvailableSession(page: Page, semesterId: string): Promise<void> {
  await page.goto(`/semester/${semesterId}`);

  const cards = page.locator(".sem-class-card");
  await expect(cards.first(), "no class cards rendered — seed a published semester with sessions").toBeVisible({
    timeout: 20_000,
  });

  const drawerCta = page.locator("a.sem-cd-cta"); // "Review Cart & Continue"
  const count = await cards.count();

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);

    // Expand the accordion if it isn't already open.
    if (!(await card.evaluate((el) => el.classList.contains("open")).catch(() => false))) {
      await card.locator("button.sem-class-card-top").click();
    }
    const body = card.locator(".sem-sessions-body");
    await expect(body).toBeVisible({ timeout: 5_000 });

    // Standard class: a footer "Add to Cart" button.
    const addToCart = body.getByRole("button", { name: /Add to Cart/i });
    if (await addToCart.count().catch(() => 0)) {
      await addToCart.first().click();
      if (await drawerCta.isVisible({ timeout: 8_000 }).catch(() => false)) return;
      continue;
    }

    // Tiered class: TierPicker auto-selects a default tier, enabling the
    // BookingFooter "Register · {tier}" button. (Skip if the picker is empty.)
    const tierRadio = body.locator('input[name="class-tier"]');
    if (await tierRadio.count().catch(() => 0)) {
      // Nudge a selection in case the default didn't register yet.
      await tierRadio.first().check({ force: true }).catch(() => {});
      const register = body.getByRole("button", { name: /^Register/ });
      await expect(register, "tiered Register button never enabled").toBeEnabled({ timeout: 8_000 });
      await register.click();
      if (await drawerCta.isVisible({ timeout: 8_000 }).catch(() => false)) return;
      continue;
    }

    // Otherwise it's a drop-in class (checkbox date list) — skip it; collapse
    // and move to the next class.
    await card.locator("button.sem-class-card-top").click().catch(() => {});
  }

  throw new Error(
    "[epg-cert] could not add any standard/tiered class to the cart — all classes were drop-in or unavailable",
  );
}

/**
 * Participants step: assign the first AGE-ELIGIBLE dancer to the cart's
 * class, then continue to the registration-info step.
 *
 * Eligibility: the UI marks an out-of-range dancer with
 * `.reg-dancer-eligibility.fail` ("Outside requirement") and the Continue
 * button stays disabled while any selected dancer is in error. We therefore
 * select a dancer card that is NOT marked `.fail`.
 */
export async function assignDancerAndContinue(page: Page, semesterId: string): Promise<void> {
  await page.goto(`/register/participants?semester=${semesterId}`);

  // Standard/tiered classes render dancer cards; pick an eligible one.
  const eligibleCard = page.locator(".dancer-card:not(:has(.reg-dancer-eligibility.fail))").first();
  const anyCard = page.locator(".dancer-card").first();
  await expect(anyCard, "no dancer cards on participants step — cart did not restore or class is drop-in").toBeVisible({
    timeout: 20_000,
  });

  if (await eligibleCard.count().catch(() => 0)) {
    await eligibleCard.click();
  } else {
    // No card was pre-marked ineligible (e.g. class has no age limits) — take the first.
    await anyCard.click();
  }

  const continueBtn = page.getByRole("button", { name: /Continue to Registration Info/i });
  await expect(continueBtn, "Continue stayed disabled — selected dancer may be ineligible or in conflict").toBeEnabled({
    timeout: 10_000,
  });
  await Promise.all([
    page.waitForURL(/\/register\/form/, { timeout: 15_000 }),
    continueBtn.click(),
  ]);
}

/**
 * Registration-info step: a first-time family must answer the required
 * "How did you hear about us?" question; otherwise the step may auto-skip.
 * Fill any referral select that's present, then continue to payment.
 */
export async function completeRegistrationInfo(page: Page, semesterId: string): Promise<void> {
  // Wait for either the form's Continue button or the "no info required" one.
  const continueBtn = page.getByRole("button", { name: /Continue to Payment/i });
  await expect(continueBtn, "registration-info step never rendered a Continue button").toBeVisible({ timeout: 15_000 });

  // If a referral <select> is present (first registration), choose an option.
  const selects = page.locator("select");
  const n = await selects.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const ok = await selects
      .nth(i)
      .selectOption({ label: "Word of mouth (friend or family)" })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }

  await Promise.all([
    page.waitForURL(/\/register\/payment/, { timeout: 15_000 }),
    continueBtn.click(),
  ]);
}

/**
 * On the payment step: ensure a billing address is present (auto-loads from
 * the profile for a user with a complete address), click "Proceed to
 * Payment", and capture the redirect to the EPG Hosted Payment Page.
 *
 * The page persists batchId in sessionStorage under
 * `aydt_payment_batch_{semesterId}` and then does window.location.href = hppUrl.
 */
export async function reachPaymentAndGetHpp(
  page: Page,
  semesterId: string,
  billing?: { street1: string; city: string; state: string; zipcode: string },
): Promise<BatchSetupResult> {
  const proceed = page.getByRole("button", { name: /Proceed to Payment/i });
  await expect(proceed, "Proceed to Payment button never rendered").toBeVisible({ timeout: 20_000 });

  // Proceed is disabled until a billing address is loaded/added. The cert user
  // has an address on file, so it normally enables on its own; otherwise add one.
  const enabled = await proceed.isEnabled().catch(() => false);
  if (!enabled) {
    await addBillingAddress(page, billing);
  }
  await expect(proceed, "Proceed stayed disabled — no billing address and none provided").toBeEnabled({
    timeout: 30_000,
  });

  // Read the batchId the page will use before navigating away.
  const batchId = await page.evaluate((key) => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw).batchId as string) : null;
    } catch {
      return null;
    }
  }, `aydt_payment_batch_${semesterId}`);
  if (!batchId) throw new Error("[epg-cert] could not read batchId from sessionStorage before payment");

  // Best-effort: read the signed-in user's id from the Supabase auth token in
  // localStorage (for the shopper/AVS snapshot). Falls back to "" if unavailable.
  const userId = await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.includes("-auth-token")) {
          const v = JSON.parse(localStorage.getItem(k) ?? "null");
          return (v?.user?.id ?? v?.currentSession?.user?.id ?? null) as string | null;
        }
      }
    } catch {}
    return null;
  });

  // Click Proceed and wait for the redirect to the EPG hosted page.
  const epgHost = new URL(epgBaseUrl()).host;
  const appHost = new URL(page.url()).host;
  await Promise.all([
    page.waitForURL(
      (u) => u.host === epgHost || u.host !== appHost || u.href.includes("payment-sessions"),
      { timeout: 30_000 },
    ),
    proceed.click(),
  ]);

  return { batchId, hppUrl: page.url(), userId: userId ?? "" };
}

/** Open the billing-address editor on the payment step and fill it. */
async function addBillingAddress(
  page: Page,
  billing?: { street1: string; city: string; state: string; zipcode: string },
): Promise<void> {
  if (!billing) return;
  const opener = page.getByRole("button", { name: /Add Billing Address|Edit/ }).first();
  if (await opener.count().catch(() => 0)) await opener.click();

  await page.getByPlaceholder("123 Main St").fill(billing.street1);
  // State (maxlength 2) and ZIP (maxlength 10) are uniquely identifiable.
  await page.locator('input[maxlength="2"]').fill(billing.state);
  await page.locator('input[maxlength="10"]').fill(billing.zipcode);
  // City is the remaining text input in the 3-column grid (no maxlength).
  const cityInput: Locator = page.locator(".grid-cols-3 input:not([maxlength])").first();
  await cityInput.fill(billing.city);

  await page.getByRole("button", { name: /Save Address/ }).click();
}

/** Full setup: sign in → cart → participants → registration info → payment → HPP. */
export async function setupBatchViaUi(
  page: Page,
  opts: {
    semesterId: string;
    billing?: { street1: string; city: string; state: string; zipcode: string };
  },
): Promise<BatchSetupResult> {
  await signInCertUser(page);
  await addFirstAvailableSession(page, opts.semesterId);
  await assignDancerAndContinue(page, opts.semesterId);
  await completeRegistrationInfo(page, opts.semesterId);
  return reachPaymentAndGetHpp(page, opts.semesterId, opts.billing);
}
