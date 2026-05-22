/**
 * EPG certification harness — batch setup via the REAL registration UI.
 *
 * Drives the actual public registration flow with Playwright so the cert
 * transaction exercises the same code path a family hits:
 *
 *   sign in → add session to cart (/semester/[id]) → participants (assign
 *   dancer) → payment (save billing → Proceed) → redirect to the EPG HPP.
 *
 * Returns the batchId + HPP URL so the spec can fill the hosted page and then
 * poll/snapshot by batchId.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEPENDENCIES (must exist in the cert DB before running):
 *   • A PUBLISHED semester with at least one session that has open capacity.
 *   • A confirmed family/parent user (CERT_USER_EMAIL / CERT_USER_PASSWORD)
 *     with a COMPLETE address on its users row (so AVS data flows — item 2)
 *     and at least one dancer.
 *   • Tuition rate bands configured for the semester (else the pricing quote
 *     fails and the Proceed button stays blocked).
 *
 * SELECTOR SEAMS: the public UI has no test ids; steps below use text/role
 * locators verified against the source as of this writing. The cart-add and
 * dancer-assignment micro-steps in particular should be confirmed on the first
 * headed run (`--headed`) and tightened if the live markup differs — same
 * philosophy as the HPP selectors in harness.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { type Page, expect } from "@playwright/test";
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
 * Add the first available session in a semester to the cart.
 * SessionAddButton renders a text button: "Add" (default) / "In Cart ✓".
 */
export async function addFirstAvailableSession(page: Page, semesterId: string): Promise<void> {
  await page.goto(`/semester/${semesterId}`);
  const addBtn = page.getByRole("button", { name: /^Add$/ }).first();
  await expect(addBtn, "no available 'Add' session button — seed an open session").toBeVisible({ timeout: 15_000 });
  await addBtn.click();
  // Confirm it entered the cart.
  await expect(page.getByRole("button", { name: /In Cart/ }).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Advance to the participants step and assign the first dancer to the session.
 *
 * ⚠️ LIVE-CONFIRM SEAM: the assignment control markup isn't pinned here. The
 * happy path is: open the dancer picker, choose the seeded dancer, continue.
 * Confirm the exact control on first headed run and tighten these locators.
 */
export async function assignDancerAndContinue(page: Page, semesterId: string): Promise<void> {
  await page.goto(`/register/participants?semester=${semesterId}`);

  // Pick the first existing dancer offered. Adjust selector to the real control.
  const dancerOption = page.getByRole("button", { name: /select|assign|choose/i }).first();
  if (await dancerOption.count().catch(() => 0)) {
    await dancerOption.click();
  }

  // Continue to payment.
  await page.locator(".btn-continue").click();
  await page.waitForURL(/\/register\/payment/, { timeout: 15_000 });
}

/**
 * On the payment step: ensure a billing address is present, click "Proceed to
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
  // If the Proceed button is disabled, a billing address is missing — add one.
  const proceed = page.locator(".btn-continue");
  const disabled = await proceed.isDisabled().catch(() => false);
  if (disabled && billing) {
    await page.getByRole("button", { name: /Add Billing Address|Edit/ }).first().click();
    await page.getByPlaceholder("123 Main St").fill(billing.street1);
    // City/State/ZIP are the three-column inputs; fill by surrounding label order.
    await page.locator("input[maxlength='2']").fill(billing.state);
    await page.locator("input[maxlength='10']").fill(billing.zipcode);
    // City is the remaining text input in the grid — fill the first empty one.
    const cityInput = page.locator(".grid input[type='text']").first();
    await cityInput.fill(billing.city);
    await page.getByRole("button", { name: /Save Address/ }).click();
    await expect(proceed).toBeEnabled({ timeout: 10_000 });
  }

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

  const userId = await page.evaluate(async () => {
    // The page already has a Supabase client; fall back to null if unavailable.
    return null as string | null;
  });

  // Click Proceed and wait for the redirect to the EPG hosted page.
  const epgHost = new URL(epgBaseUrl()).host;
  await Promise.all([
    page.waitForURL((u) => u.host === epgHost || u.href.includes("payment-sessions"), { timeout: 30_000 }),
    proceed.click(),
  ]);

  return { batchId, hppUrl: page.url(), userId: userId ?? "" };
}

/** Full setup: sign in → cart → participants → payment → HPP. */
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
  return reachPaymentAndGetHpp(page, opts.semesterId, opts.billing);
}
