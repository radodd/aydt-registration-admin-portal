/*
 * Verify the redesigned semester-builder chrome (new-UI port).
 * Confirms: rail brand header + done-state checkmarks, 8-step nav, Details
 * single grouped card, and the merged "Emails" step (Confirmation | Waitlist
 * switch) reusing the existing desktop/mobile previews.
 *
 *   node .claude/skills/run-harness/harness.cjs verify-new-chrome --role admin
 *
 * Wizard is shared by create + edit; driving the edit route for the seeded
 * draft renders the identical create UI. Override target with SEM=<uuid>.
 */
const path = require("path");

module.exports = {
  name: "verify-new-chrome",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.SEM || "00002026-0003-0000-0000-000000000001";

    page.on("dialog", (d) => d.accept().catch(() => {}));
    page.on("pageerror", (e) => ctx.note(`PAGEERROR: ${e.message}`));

    async function cap(label, desc) {
      const f = await ctx.shot(label);
      ctx.note(`${path.basename(f)} — ${desc}`);
    }
    async function goStep(key, settle = 3000) {
      await page
        .goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=${key}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
        .catch((e) => ctx.note(`goto ${key} err (non-fatal): ${e.message}`));
      await ctx.sleep(settle);
    }
    async function clickBtn(name, settle = 1400) {
      const b = page.getByRole("button", { name, exact: false }).first();
      if (await b.count()) {
        await b.click().catch(() => {});
        await ctx.sleep(settle);
        return true;
      }
      ctx.note(`button "${name}" not found (non-fatal).`);
      return false;
    }

    // ── 1. Details — rail brand header + single grouped card ─────────────────
    await goStep("details", 2000);
    await cap("01-details", "Details — rail shows 'AYDT ADMIN / Semester builder' brand; body is one grouped card (Basics / Enrollment display).");

    // ── 2. A later step — rail done-state checkmarks on prior steps ──────────
    await goStep("discounts");
    await cap("02-rail-done-states", "Discounts step — left rail should show ✓ checkmarks on steps 1-4 and 8 total steps ending in 'Review & publish'.");

    // ── 2b. Registration form (canvas + single +Add dropdown) ───────────────
    await goStep("registrationForm");
    await cap("02b-registration-form", "Registration form — canvas + step header, single '+ Add' dropdown, section/field rows with Required/Optional badges.");

    // ── 2c. Payment (26px title + sub-tabs) ─────────────────────────────────
    await goStep("payment");
    await cap("02c-payment", "Payment — 26px title; Plans/Tuition rates/Special programs/Fee config sub-tabs.");

    // ── 2d. Classes & offerings (browse + master-detail) ────────────────────
    await goStep("sessions");
    await cap("02d-classes", "Classes & offerings — browse list + master-detail editor; title aligned to rail label.");

    // ── 3. Merged Emails step (step 7) ───────────────────────────────────────
    await goStep("emails");
    await cap("03-emails-confirmation", "Emails step — top switch 'Confirmation email | Waitlist invitation', Confirmation active.");
    // Confirmation → Design sub-tab to reveal the reused preview
    if (await clickBtn("Design")) {
      await cap("04-emails-confirmation-design", "Emails → Confirmation → Design — EXISTING desktop/mobile email preview reused (must be intact).");
    }
    // Switch to Waitlist invitation
    if (await clickBtn("Waitlist invitation")) {
      await cap("05-emails-waitlist", "Emails → Waitlist invitation — existing waitlist step rendered under the merged switch.");
      if (await clickBtn("Design")) {
        await cap("06-emails-waitlist-design", "Emails → Waitlist → Design — existing waitlist email preview reused (must be intact).");
      }
    }

    // ── 7. Review & publish — merged Emails tab ──────────────────────────────
    await goStep("review");
    await cap("07-review-details", "Review & publish — 26px title, Step 8 of 8, checked tabs (default Details).");
    // Scope to the review tab bar (anchor on "Registration Form" — only the review
    // bar uses that exact label; the rail uses lowercase "Registration form").
    try {
      const reviewBar = page.getByRole("button", { name: /^Registration Form$/ }).first().locator("xpath=..");
      const emailsTab = reviewBar.getByRole("button", { name: /^Emails$/ }).first();
      if (await emailsTab.count()) {
        await emailsTab.click();
        await ctx.sleep(1800);
        await cap("08-review-emails-merged", "Review → merged 'Emails' tab — Confirmation Email section + Waitlist invitation section stacked (was two separate tabs).");
      } else {
        ctx.note("review 'Emails' tab not found in tab bar (non-fatal).");
      }
    } catch (e) {
      ctx.note(`review Emails tab click failed (non-fatal): ${e.message}`);
    }

    ctx.note("Chrome verification complete (read-only; nothing saved/published).");
  },
};
