/*
 * Full visual tour of the create-semester experience. Starts at the /admin
 * dashboard, then walks every wizard step AND every internal sub-tab / portion,
 * screenshotting each state. All shots + a descriptive notes.txt land in one
 * folder: tests/reports/harness-shots/create-semester-full-tour/
 *
 *   node .claude/skills/run-harness/harness.cjs create-semester-full-tour --role admin
 *
 * The wizard (SemesterForm) is shared by create and edit, so driving the edit
 * route for the seeded draft renders the identical create UI with real data.
 *
 * NOT fully read-only: per request, this run also CREATES + SAVES a coupon and
 * adds a few registration-form elements (section / text block / waiver) so the
 * create-coupon flow and the form-builder modals can be captured. It does NOT
 * publish. Target the seeded semester; override with SEM=<uuid>.
 */
const path = require("path");

module.exports = {
  name: "create-semester-full-tour",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.SEM || "00002026-0003-0000-0000-000000000001";

    page.on("dialog", (d) => d.accept().catch(() => {})); // accept any save/confirm prompts
    page.on("pageerror", (e) => ctx.note(`PAGEERROR: ${e.message}`));

    // Numbered shot + matching notes.txt line keyed to the real filename.
    async function cap(label, desc) {
      const f = await ctx.shot(label);
      ctx.note(`${path.basename(f)} — ${desc}`);
    }
    async function goStep(key, settle = 3200) {
      await page
        .goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=${key}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
        .catch((e) => ctx.note(`goto ${key} err (non-fatal): ${e.message}`));
      await ctx.sleep(settle);
    }
    // Partial, case-insensitive button click — safe for labels that don't collide.
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
    // Exact, case-sensitive, last match — for modal action buttons (Create / etc.).
    async function clickExactLast(re, settle = 1500) {
      const b = page.getByRole("button", { name: re }).last();
      if (await b.count()) {
        await b.click().catch(() => {});
        await ctx.sleep(settle);
        return true;
      }
      return false;
    }

    // ── 0. Dashboard — single source of truth for semesters ──────────────────
    await page.goto(`${ctx.BASE}/admin`, { waitUntil: "domcontentloaded" });
    await ctx.sleep(3500);
    await cap("00-dashboard", "Admin dashboard — Overview tab, Semesters card (now includes drafts).");
    try {
      const more = page
        .locator("button:has(svg.lucide-ellipsis), button:has(svg.lucide-more-horizontal)")
        .first();
      if (await more.count()) {
        await more.click();
        await ctx.sleep(900);
        await cap("01-dashboard-row-menu", "Semester row ⋯ menu — Edit / Classes & Offerings / Reports / Archive / Delete (new hard-delete).");
        await page.keyboard.press("Escape").catch(() => {});
      } else {
        ctx.note("dashboard ⋯ button not found (non-fatal).");
      }
    } catch (e) {
      ctx.note(`dashboard menu capture skipped (non-fatal): ${e.message}`);
    }

    // ── 1. Details ───────────────────────────────────────────────────────────
    await goStep("details", 1800);
    await cap("02-details", "Step 1 Details — semester name, dates, attendance & capacity settings.");

    // ── 2. Classes & offerings (+ class editor panel sub-tabs) ───────────────
    await goStep("sessions");
    await cap("03-classes-offerings", "Step 2 Classes & offerings — class/section list.");
    try {
      const classRow = page.locator("tr.cursor-pointer").first();
      if (await classRow.count()) {
        await classRow.click();
        await ctx.sleep(1600);
        await cap("04-class-panel-details", "Class editor panel — Details sub-tab.");
        for (const [name, label, desc] of [
          ["Schedule", "05-class-panel-schedule", "Class editor panel — Schedule sub-tab (meeting days/times)."],
          ["Requirements", "06-class-panel-requirements", "Class editor panel — Requirements sub-tab (age/gender/eligibility)."],
          ["Add-ons", "07-class-panel-addons", "Class editor panel — Add-ons sub-tab (optional add-on offerings)."],
        ]) {
          if (await clickBtn(name)) await cap(label, desc);
        }
      } else {
        ctx.note("no class row found to open the editor panel (non-fatal).");
      }
    } catch (e) {
      ctx.note(`class panel tour skipped (non-fatal): ${e.message}`);
    }

    // ── 3. Class groups ──────────────────────────────────────────────────────
    await goStep("sessionGroups");
    await cap("08-class-groups", "Step 3 Class groups — grouping of classes/sections.");

    // ── 4. Payment (all four sub-step tabs) ──────────────────────────────────
    await goStep("payment");
    await cap("09-payment-plans", "Step 4 Payment — sub-tab 1 'Payment Plans' (default).");
    if (await clickBtn("Tuition Rates")) await cap("10-payment-tuition-rates", "Step 4 Payment — sub-tab 2 'Tuition Rates' (standard rate bands).");
    if (await clickBtn("Special Programs")) await cap("11-payment-special-programs", "Step 4 Payment — sub-tab 3 'Special Programs' (EC/Pointe/Comp tuition).");
    if (await clickBtn("Fee Config")) await cap("12-payment-fee-config", "Step 4 Payment — sub-tab 4 'Fee Config' (registration/costume/video fees + reg-fee exemptions).");

    // ── 5. Discounts + create-coupon flow ────────────────────────────────────
    await goStep("discounts");
    await cap("13-discounts", "Step 5 Discounts — Discounts sub-tab (sibling/multi-class discounts).");
    if (await clickBtn("Coupons")) {
      await cap("14-coupons-empty", "Step 5 Discounts — Coupons sub-tab (no coupons yet).");
      if (await clickBtn("Create coupon")) {
        await ctx.fillPlaceholder("e.g. Fall Early Bird", "Summer Saver").catch(() => {});
        await ctx.fillPlaceholder("e.g. FALL2026", "SUMMER25").catch(() => {});
        try {
          const amt = page.locator('label:has-text("Discount amount")').locator("xpath=following-sibling::input").first();
          if (await amt.count()) await amt.fill("25");
        } catch {}
        await ctx.sleep(500);
        await cap("15-coupon-create-form", "Create-coupon form filled — name 'Summer Saver', code 'SUMMER25', $25 off.");
        if (await clickExactLast(/^Save changes$/, 2500)) {
          await ctx.sleep(1500);
          await cap("16-coupon-saved", "Coupon saved — now listed under the Coupons tab.");
        } else {
          await cap("16-coupon-save-result", "After clicking save on the new coupon (button label may differ).");
        }
      }
    }

    // ── 6. Registration form (seeded form + builder modals) ──────────────────
    await goStep("registrationForm");
    await cap("17-registration-form", "Step 6 Registration form — seeded standard form (questions, address, waivers).");
    // Builder add-controls are now a single "+ Add ▾" dropdown → pick item.
    async function addViaMenu(item) {
      if (!(await clickBtn("Add", 600))) return false;
      const opt = page.getByRole("button", { name: item, exact: true }).first();
      if (!(await opt.count())) { ctx.note(`add-menu item "${item}" not found (non-fatal).`); return false; }
      await opt.click().catch(() => {});
      await ctx.sleep(800);
      return true;
    }
    // + New section modal
    if (await addViaMenu("Section")) {
      await ctx.fillPlaceholder("Section title", "Health & Safety").catch(() => {});
      await cap("18-regform-new-section-modal", "Form builder — 'New section' modal (opened via + Add dropdown).");
      await clickExactLast(/^Create$/);
    }
    // + Text block modal
    if (await addViaMenu("Text block")) {
      await ctx.fillPlaceholder("Enter your text content...", "Please arrive 10 minutes before class.").catch(() => {});
      await cap("19-regform-text-block-modal", "Form builder — 'Text block' modal (opened via + Add dropdown).");
      await clickExactLast(/^Create$/);
    }
    // + Waiver modal
    if (await addViaMenu("Waiver")) {
      await cap("20-regform-waiver-modal", "Form builder — 'Waiver' modal (opened via + Add dropdown).");
      await clickExactLast(/^Add Waiver$/);
    }
    await ctx.sleep(1200);
    await cap("21-registration-form-populated", "Step 6 Registration form — after adding section / text block / waiver.");

    // ── 7. Emails (merged Confirmation + Waitlist) ───────────────────────────
    await goStep("emails");
    await cap("22-emails-confirmation-info", "Step 7 Emails — Confirmation email · Template info (subject, tokens).");
    if (await clickBtn("Design")) await cap("23-emails-confirmation-design", "Step 7 Emails — Confirmation email · Design (body + REUSED desktop/mobile preview).");
    if (await clickBtn("Waitlist invitation")) {
      await cap("24-emails-waitlist-settings", "Step 7 Emails — Waitlist invitation · Settings (behavior/hold window).");
      if (await clickBtn("Template info")) await cap("25-emails-waitlist-info", "Step 7 Emails — Waitlist invitation · Template info (offer email content).");
      if (await clickBtn("Design")) await cap("26-emails-waitlist-design", "Step 7 Emails — Waitlist invitation · Design (REUSED offer email preview).");
    }

    // ── 9. Review & publish — click EACH preview sub-tab ─────────────────────
    // Review tab labels collide with the wizard's left-nav step buttons, so scope
    // clicks to the review tab bar (anchored on "Registration Form", a label only
    // the review bar uses — the nav uses lowercase "Registration form").
    await goStep("review");
    await cap("27-review-details", "Step 9 Review & publish — Details preview (default tab).");
    const reviewBar = () =>
      page.getByRole("button", { name: /^Registration Form$/ }).first().locator("xpath=..");
    const reviewTabs = [
      [/^Classes & Offerings$/, "28-review-classes", "Review — Classes & Offerings preview."],
      [/^Class Groups$/, "29-review-groups", "Review — Class Groups preview."],
      [/^Payment$/, "30-review-payment", "Review — Payment preview."],
      [/^Discounts$/, "31-review-discounts", "Review — Discounts preview."],
      [/^Registration Form$/, "32-review-regform", "Review — Registration Form preview."],
      [/^Emails$/, "33-review-emails", "Review — merged Emails preview (Confirmation Email + Waitlist invitation stacked)."],
    ];
    for (const [re, label, desc] of reviewTabs) {
      try {
        const btn = reviewBar().getByRole("button", { name: re }).first();
        if (await btn.count()) {
          await btn.click();
          await ctx.sleep(1500);
          await cap(label, desc);
        } else {
          ctx.note(`review tab ${re} not found (non-fatal).`);
        }
      } catch (e) {
        ctx.note(`review tab ${re} click failed (non-fatal): ${e.message}`);
      }
    }

    ctx.note("Tour complete — created 1 coupon + added form elements; did NOT publish.");
  },
};
