/*
 * Example scenario: drive the admin registration flow end-to-end.
 *   node .claude/skills/run-harness/harness.cjs admin-register
 *
 * Exercises the searchable semester picker (+ "Change") and the consolidated
 * checkout "Pricing & Discounts" card. Uses New-dancer mode so it doesn't
 * depend on seeded dancers; picks the first published semester + first class.
 */
module.exports = {
  name: "admin-register",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;

    // Step 1: Dancer (New-dancer mode — deterministic)
    await ctx.goto("/admin/register");
    await ctx.sleep(800);
    await ctx.shot("register-landing-dancer-step");
    await ctx.clickRole("button", "New dancer");
    await ctx.sleep(400);
    await ctx.fillNth('input[type="text"]', 0, "Testy");
    await ctx.fillNth('input[type="text"]', 1, "Reviewer");
    await ctx.sleep(300);
    await ctx.shot("dancer-new-filled");
    await ctx.clickRole("button", "Continue");

    // Step 2: semester picker
    await ctx.waitText("Semester");
    await ctx.sleep(800);
    await ctx.shot("semester-picker-empty");

    const search = page.getByPlaceholder("Search semesters…");
    const semButtons = page.locator("ul li button");
    const count = await semButtons.count();
    ctx.note(`Semester list shows ${count} option(s) (published only).`);

    if (count > 0) {
      const first = (await semButtons.first().innerText()).trim().split("\n")[0];
      ctx.note(`First semester: "${first}"`);
      await search.fill(first.slice(0, 3));
      await ctx.sleep(500);
      await ctx.shot("semester-search-filtered");
      await search.fill("zzzzz");
      await ctx.sleep(400);
      await ctx.shot("semester-search-no-match");
      await search.fill("");
      await ctx.sleep(400);

      await semButtons.first().click();
      await ctx.sleep(1500);
      await ctx.shot("semester-selected-chip-and-classes");

      if (await ctx.exists("Change")) {
        await ctx.clickRole("button", "Change");
        await ctx.sleep(800);
        await ctx.shot("semester-reopened-after-change");
        await page.locator("ul li button").first().click();
        await ctx.sleep(1500);
      }
    } else {
      ctx.note("No published semesters — cannot proceed.");
      return;
    }

    // Best-effort: class -> checkout
    await ctx.shot("classes-loaded");
    if (await ctx.exists("No classes found for this semester.")) {
      ctx.note("Selected semester has no classes.");
      return;
    }
    const cont = page.getByRole("button", { name: "Continue" });
    const candidates = page.locator('div[class*="overflow-y-auto"] button, div[class*="overflow-y-auto"] [role="button"]');
    const cN = await candidates.count();
    for (let i = 0; i < Math.min(cN, 6); i++) {
      await candidates.nth(i).click().catch(() => {});
      await ctx.sleep(400);
      if (!(await cont.isDisabled().catch(() => true))) break;
    }
    await ctx.shot("classes-after-selection-attempt");
    if (await cont.isDisabled().catch(() => true)) {
      ctx.note("Could not enable Continue on Classes step (class may need drop-in date / tier).");
      return;
    }
    await cont.click();
    await ctx.sleep(1200);
    await ctx.shot("questions-step");
    const qInputs = page.locator('input[type="text"]:visible, textarea:visible');
    const qN = await qInputs.count();
    for (let i = 0; i < qN; i++) await qInputs.nth(i).fill("N/A").catch(() => {});
    const qCont = page.getByRole("button", { name: "Continue" });
    if ((await qCont.count()) && !(await qCont.isDisabled().catch(() => true))) {
      await qCont.click();
      await ctx.sleep(1500);
    }
    if (await ctx.exists("Pricing & Discounts")) {
      await ctx.shot("checkout-consolidated-pricing-discounts");
      if (await ctx.exists("Set custom total")) {
        await ctx.clickRole("button", "Set custom total");
        await ctx.sleep(400);
        await ctx.shot("checkout-custom-total-active");
      }
      if (await ctx.exists("Add adjustment")) {
        await ctx.clickRole("button", "Add adjustment");
        await ctx.sleep(300);
        await page.getByPlaceholder("e.g. Week 1 proration").fill("Scholarship").catch(() => {});
        await ctx.shot("checkout-adjustment-form");
      }
    } else {
      ctx.note("Did not reach Checkout.");
      await ctx.shot("post-questions-state");
    }
  },
};
