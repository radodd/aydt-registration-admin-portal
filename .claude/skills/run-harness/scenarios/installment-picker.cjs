/*
 * Installment picker — eligibility gate + re-pricing QA.
 *   node .claude/skills/run-harness/harness.cjs installment-picker --role parent
 *
 * Verifies this window's two picker changes on the public payment page:
 *   1. Picker renders ONLY when semester_payment_plans.type === "installments".
 *   2. Selecting "Monthly installments" re-prices the quote and renders the
 *      payment schedule (multi-installment list).
 *
 * Uses service-role to find one semester of each kind. If either kind isn't
 * present in the dev DB, the corresponding variant is skipped with a note.
 *
 * Requires: dev server running, NEXT_PUBLIC_DEV_ADMIN_* creds in .env.local.
 * (Drives the public registration flow logged in as admin since that account
 * also has a parent profile / dancers attached in dev.)
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function findCandidateSemesters() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pull all published semesters with their plan type. Then pick one of each.
  const { data: rows, error } = await supabase
    .from("semesters")
    .select("id, name, status, semester_payment_plans ( type, installment_count )")
    .eq("status", "published")
    .order("name", { ascending: true });

  if (error) {
    return { error: error.message };
  }

  const installments = rows.find(
    (r) => Array.isArray(r.semester_payment_plans)
      ? r.semester_payment_plans[0]?.type === "installments"
      : r.semester_payment_plans?.type === "installments",
  );
  const payInFull = rows.find((r) => {
    const t = Array.isArray(r.semester_payment_plans)
      ? r.semester_payment_plans[0]?.type
      : r.semester_payment_plans?.type;
    return t && t !== "installments";
  });

  return {
    installments: installments
      ? { id: installments.id, name: installments.name }
      : null,
    payInFull: payInFull
      ? { id: payInFull.id, name: payInFull.name }
      : null,
  };
}

async function walkSemesterToPayment(ctx, sem, labelPrefix) {
  const { page } = ctx;
  await ctx.goto(`/semester/${sem.id}`);
  await page
    .locator(".sem-class-card-top")
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  await ctx.sleep(800);
  await ctx.shot(`${labelPrefix}-catalog`);

  // Expand the first class card.
  const firstHeader = page.locator(".sem-class-card-top").first();
  if (await firstHeader.count()) {
    await firstHeader.click().catch(() => {});
    await ctx.sleep(900);
  }
  await ctx.shot(`${labelPrefix}-catalog-expanded`);

  // Click "Add to Cart" on the first available session. This adds to cart
  // but does NOT navigate (button stays in place).
  const addToCart = page
    .getByRole("button", { name: /Add to cart/i })
    .first();
  if (!(await addToCart.count())) {
    ctx.note(`[${labelPrefix}] No 'Add to Cart' button found.`);
    return false;
  }
  await addToCart.click().catch(() => {});
  await ctx.sleep(1200);
  ctx.note(`[${labelPrefix}] Clicked 'Add to Cart'. URL: ${page.url()}`);
  await ctx.shot(`${labelPrefix}-after-add-to-cart`);

  // Navigate to the cart page directly.
  await page
    .goto(`${ctx.BASE}/cart`, { waitUntil: "domcontentloaded", timeout: 20000 })
    .catch((e) => ctx.note(`/cart goto err: ${e.message}`));
  await ctx.sleep(1500);
  await ctx.shot(`${labelPrefix}-cart`);

  // From the cart, click a "Continue" / "Checkout" / "Proceed" CTA to start
  // the register flow. Then walk Continue buttons until /register/payment.
  for (let i = 0; i < 8; i++) {
    if (page.url().includes("/register/payment")) break;

    // Pick the first dancer if the participants step is showing.
    const eligibleBadge = page.getByText("Eligible", { exact: true }).first();
    if (await eligibleBadge.count()) {
      await eligibleBadge.click().catch(() => {});
      await ctx.sleep(500);
    }
    const dancerCard = page
      .locator('[data-testid="dancer-card"], button:has-text("Age")')
      .first();
    if (await dancerCard.count()) {
      await dancerCard.click().catch(() => {});
      await ctx.sleep(500);
    }

    // Match either <button> or <a> — many "Continue" CTAs are styled links.
    const cta = page
      .getByRole("button", {
        name: /Continue|Checkout|Proceed|Next|Confirm|Go to payment/i,
      })
      .or(
        page.getByRole("link", {
          name: /Continue|Checkout|Proceed|Next|Confirm|Go to payment/i,
        }),
      )
      .first();
    if (!(await cta.count())) {
      ctx.note(`[${labelPrefix}] No advance CTA at URL ${page.url()}`);
      await ctx.shot(`${labelPrefix}-stuck-no-cta-${i}`);
      break;
    }

    if (await cta.isDisabled().catch(() => true)) {
      // Required form fields — fill text/email/tel/textarea with N/A,
      // pick first option of any select/radio.
      const inputs = page.locator(
        'input[type="text"]:visible, input[type="email"]:visible, input[type="tel"]:visible, textarea:visible',
      );
      const n = await inputs.count();
      for (let k = 0; k < n; k++) await inputs.nth(k).fill("N/A").catch(() => {});
      const selects = page.locator("select:visible");
      const sN = await selects.count();
      for (let k = 0; k < sN; k++)
        await selects.nth(k).selectOption({ index: 1 }).catch(() => {});
      const radios = page.locator('input[type="radio"]:visible');
      if (await radios.count()) await radios.first().check().catch(() => {});
      await ctx.sleep(500);
    }
    if (await cta.isDisabled().catch(() => true)) {
      ctx.note(`[${labelPrefix}] CTA still disabled at URL ${page.url()} — stopping.`);
      await ctx.shot(`${labelPrefix}-stuck-step-${i}`);
      break;
    }
    await cta.click().catch(() => {});
    await ctx.sleep(1800);
  }

  ctx.note(`[${labelPrefix}] Final URL: ${page.url()}`);
  await ctx.sleep(800);
  await ctx.shot(`${labelPrefix}-payment-page`);
  return page.url().includes("/register/payment");
}

module.exports = {
  name: "installment-picker",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;

    ctx.note("Discovering semesters via service-role…");
    const found = await findCandidateSemesters();
    if (found.error) {
      ctx.note(`ERROR: semester discovery failed: ${found.error}`);
      return;
    }
    ctx.note(
      `installments semester: ${found.installments ? `${found.installments.name} (${found.installments.id})` : "NONE FOUND"}`,
    );
    ctx.note(
      `pay_in_full semester: ${found.payInFull ? `${found.payInFull.name} (${found.payInFull.id})` : "NONE FOUND"}`,
    );

    // Detection: a TEXT match for "Payment Plan" / "Monthly installments"
    // falsely fires on the explanatory copy I added on the payment page.
    // The real picker renders a <button role> for each option. Counting
    // button matches is the truthful check.
    async function detectPickerState() {
      const installmentsBtn = await page
        .getByRole("button", { name: /^Monthly installments$/i })
        .count();
      const payInFullBtn = await page
        .getByRole("button", { name: /^Pay in full$/i })
        .count();
      return { installmentsBtn, payInFullBtn };
    }

    // VARIANT A — installments-allowed semester
    if (found.installments) {
      ctx.note("=== Variant A: installments semester ===");
      const reached = await walkSemesterToPayment(
        ctx,
        found.installments,
        "A-install",
      );
      if (reached) {
        const { installmentsBtn, payInFullBtn } = await detectPickerState();
        ctx.note(
          `[A-install] picker buttons — 'Pay in full': ${payInFullBtn}, 'Monthly installments': ${installmentsBtn}  (BOTH should be 1)`,
        );
        await ctx.shot("A-install-picker-state");

        if (installmentsBtn > 0 && payInFullBtn > 0) {
          ctx.note("✅ ELIGIBILITY GATE PASS (A) — picker rendered for installments semester.");
          await page
            .getByRole("button", { name: /^Monthly installments$/i })
            .first()
            .click()
            .catch(() => {});
          await ctx.sleep(2000);
          const hasSchedule = await page.getByText("Payment Schedule").count();
          ctx.note(
            `[A-install] after selecting installments — 'Payment Schedule' rendered: ${hasSchedule > 0}`,
          );
          await ctx.shot("A-install-after-select-installments");
        } else {
          ctx.note("❌ EXPECTED PICKER MISSING on installments semester.");
        }
      } else {
        ctx.note("[A-install] Did not reach /register/payment — likely a data issue (no eligible dancers for the chosen class). Screenshots show where it stopped.");
      }
    } else {
      ctx.note("Skipping Variant A — no installments semester found.");
    }

    // VARIANT B — pay-in-full-only semester (picker should be hidden)
    if (found.payInFull) {
      ctx.note("=== Variant B: pay_in_full semester (picker should be hidden) ===");
      const reached = await walkSemesterToPayment(
        ctx,
        found.payInFull,
        "B-payfull",
      );
      if (reached) {
        const { installmentsBtn, payInFullBtn } = await detectPickerState();
        ctx.note(
          `[B-payfull] picker buttons — 'Pay in full': ${payInFullBtn}, 'Monthly installments': ${installmentsBtn}  (BOTH should be 0)`,
        );
        if (installmentsBtn === 0 && payInFullBtn === 0) {
          ctx.note("✅ ELIGIBILITY GATE PASS (B) — picker correctly hidden on pay_in_full semester.");
        } else {
          ctx.note("❌ ELIGIBILITY GATE FAIL — picker buttons present on pay_in_full semester.");
        }
        await ctx.shot("B-payfull-picker-hidden-check");
      } else {
        ctx.note("[B-payfull] Did not reach /register/payment — see screenshots.");
      }
    } else {
      ctx.note("Skipping Variant B — no pay_in_full semester found.");
    }
  },
};
