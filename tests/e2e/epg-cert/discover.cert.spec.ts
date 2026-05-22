/**
 * Selector discovery helper (throwaway diagnostics — not a real test).
 *
 * The harness has "live-confirm seams" where selectors couldn't be verified
 * without a running app + live cert account: the Elavon hosted-page card fields
 * and the public registration UI controls (cart-add / dancer-assign). These
 * tests don't assert anything — they DUMP every interactive element (top-level
 * document AND any iframes) to the console so you can capture the real
 * selectors in one pass instead of one Playwright error at a time.
 *
 * Run headed so you can see the page while it dumps:
 *   EPG_CERT_RUN=1 npx playwright test tests/e2e/epg-cert/discover.cert.spec.ts --headed
 *
 * Then paste the printed JSON back and I'll tighten the locators in
 * harness.ts (fillHostedCardPage) and setup.ts.
 *
 * Gated behind EPG_CERT_RUN like the rest of the cert specs.
 */

import { test, type Page, type Frame } from "@playwright/test";
import { createEpgOrder, createEpgPaymentSession } from "@/utils/payment/epg";
import { preflight, requireEnv } from "./harness";
import { signInCertUser } from "./setup";

const RUN = !!process.env.EPG_CERT_RUN;

interface FieldInfo {
  tag: string;
  type: string | null;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  autocomplete: string | null;
  ariaLabel: string | null;
  label: string | null;
  className: string | null;
  text: string | null;
  visible: boolean;
}

/** Collect interactive elements within a single frame's document. */
async function dumpFrame(frame: Frame, label: string): Promise<void> {
  let fields: FieldInfo[] = [];
  try {
    fields = (await frame.evaluate(() => {
      const out: Record<string, unknown>[] = [];
      const els = document.querySelectorAll("input, select, textarea, button, [role='button']");
      els.forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        // Find an associated <label> if any.
        let label: string | null = null;
        const id = el.getAttribute("id");
        if (id) {
          const l = document.querySelector(`label[for='${id}']`);
          if (l) label = (l.textContent ?? "").trim() || null;
        }
        out.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"),
          name: el.getAttribute("name"),
          id,
          placeholder: el.getAttribute("placeholder"),
          autocomplete: el.getAttribute("autocomplete"),
          ariaLabel: el.getAttribute("aria-label"),
          label,
          className: (el.getAttribute("class") ?? "").slice(0, 80) || null,
          text: ((el as HTMLElement).innerText ?? "").trim().slice(0, 40) || null,
          visible: r.width > 0 && r.height > 0,
        });
      });
      return out;
    })) as unknown as FieldInfo[];
  } catch (e) {
    console.log(`[discover] frame "${label}" could not be evaluated (cross-origin?): ${e}`);
    return;
  }

  console.log(`\n[discover] ===== ${label} (${frame.url()}) — ${fields.length} elements =====`);
  console.log(JSON.stringify(fields, null, 2));
}

/** Dump the top-level document plus every child frame. */
async function dumpAllFrames(page: Page, context: string): Promise<void> {
  console.log(`\n[discover] ########## ${context} ##########`);
  console.log(`[discover] URL: ${page.url()}`);
  const frames = page.frames();
  console.log(`[discover] frame count: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    await dumpFrame(frames[i], i === 0 ? "MAIN FRAME" : `IFRAME #${i}`);
  }
}

test.describe("EPG cert — selector discovery (diagnostics only)", () => {
  test.skip(!RUN, "Set EPG_CERT_RUN=1 to run discovery against the sandbox.");

  /**
   * Dump the Elavon Hosted Payment Page fields. Creates a throwaway order/session
   * and lands on the HPP, then prints every input/select/button it finds.
   */
  test("dump HPP card fields", async ({ page }) => {
    test.setTimeout(120_000);
    await preflight();

    const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
    const customReference = `cert-discover-${Date.now()}`;
    const order = await createEpgOrder({
      amountDollars: 12,
      currencyCode: "USD",
      description: "Cert selector discovery",
      customReference,
    });
    const session = await createEpgPaymentSession({
      orderHref: order.href,
      returnUrl: `${siteUrl}/register/confirmation?cert=discover`,
      cancelUrl: `${siteUrl}/register/payment?cert_cancelled=1`,
      customReference,
      doThreeDSecure: false,
      doCapture: true,
    });

    await page.goto(session.url);
    // Give the hosted page a beat to render its fields (and any iframe).
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(2500);

    await dumpAllFrames(page, "HPP — LANDING (payment-type selector)");

    // The hosted page opens on a payment-type chooser (card vs ACH radios named
    // `paymentTypeSelector`); the card fields render only after selecting card
    // and advancing. Select the first radio (card) and re-dump.
    const radios = page.locator("input[name='paymentTypeSelector']");
    if (await radios.count().catch(() => 0)) {
      await radios.first().check({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await dumpAllFrames(page, "HPP — AFTER selecting card radio");

      // Some layouts need a Continue/Next/Proceed to reveal the card form.
      for (const name of ["Continue", "Next", "Proceed", "Pay"]) {
        const btn = page.getByRole("button", { name: new RegExp(`^${name}`, "i") }).first();
        if (await btn.count().catch(() => 0) && await btn.isEnabled().catch(() => false)) {
          await btn.click().catch(() => undefined);
          await page.waitForTimeout(2000);
          await dumpAllFrames(page, `HPP — AFTER clicking "${name}"`);
          break;
        }
      }
    }

    await page.waitForTimeout(1000);
  });

  /**
   * Dump the public registration UI controls at each step: semester page
   * (cart-add), participants (dancer-assign), payment. Requires the seeded
   * CERT_USER_* + CERT_SEMESTER_ID.
   */
  test("dump registration UI controls", async ({ page }) => {
    test.setTimeout(120_000);
    const semesterId = requireEnv("CERT_SEMESTER_ID");

    await signInCertUser(page);

    await page.goto(`/semester/${semesterId}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await dumpAllFrames(page, "SEMESTER PAGE (cart-add controls)");

    await page.goto(`/register/participants?semester=${semesterId}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1500);
    await dumpAllFrames(page, "PARTICIPANTS STEP (dancer-assign controls)");
  });
});
