/*
 * Meeting-plan #5 QA: public "Join Waitlist" path (end-to-end).
 *   node .claude/skills/run-harness/harness.cjs waitlist-public --role parent
 *
 * Requires a FULL + waitlist-enabled class (seed one with
 *   node .claude/skills/run-harness/seed-waitlist-fixture.cjs).
 * Runs as parent so the /register auth gate passes. Clicks Join Waitlist,
 * verifies it routes into waitlist mode (?waitlist=1), then walks
 * participants -> form -> the /register/waitlist/confirm terminal step.
 */
module.exports = {
  name: "waitlist-public",
  role: "parent",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.WL_SEM || "bba3a0a5-36a5-48a8-9398-a9cbe2ce4c44";

    await ctx.goto(`/semester/${SEM}`);
    // Class cards load client-side; wait for the accordion headers to render.
    await page.locator(".sem-class-card-top").first().waitFor({ timeout: 15000 }).catch(() => {});
    await ctx.sleep(800);
    await ctx.shot("catalog-collapsed");
    ctx.note(
      (await ctx.exists("Waitlist"))
        ? "Header badge mentions 'Waitlist'."
        : "No 'Waitlist' header badge visible (check seed / fullness).",
    );

    // Expand the class accordion whose header badge reads "Waitlist".
    const headers = page.locator(".sem-class-card-top");
    const hN = await headers.count();
    for (let i = 0; i < hN; i++) {
      const txt = await headers.nth(i).innerText().catch(() => "");
      if (/Waitlist/i.test(txt)) {
        await headers.nth(i).click().catch(() => {});
        await ctx.sleep(900);
        break;
      }
    }
    await ctx.shot("catalog-expanded");

    const joinButtons = page.getByRole("button", { name: /Join Waitlist/i });
    const jbN = await joinButtons.count();
    ctx.note(`'Join Waitlist' buttons found: ${jbN}.`);
    if (jbN === 0) {
      ctx.note("No Join Waitlist CTA — seed a full+waitlist class first.");
      return;
    }

    await joinButtons.first().click();
    await ctx.sleep(2500);
    ctx.note(`URL after Join Waitlist: ${page.url()}`);
    ctx.note(
      page.url().includes("waitlist=1")
        ? "✅ Routed into registration flow in waitlist mode (?waitlist=1)."
        : `WARNING: expected ?waitlist=1, got ${page.url()}`,
    );
    await ctx.shot("after-join-waitlist-click");

    /* Walk participants -> form -> waitlist confirm. */
    await ctx.sleep(800);
    await ctx.shot("participants-step");
    // Select an AGE-ELIGIBLE dancer. Eligible dancer cards carry an "Eligible"
    // badge; clicking it bubbles to the card's select handler. (Out-of-range
    // dancers show "Outside requirement" and won't enable Continue.)
    const eligibleBadge = page.getByText("Eligible", { exact: true }).first();
    if (await eligibleBadge.count()) {
      await eligibleBadge.click().catch(() => {});
    } else {
      await page.getByText(/Age \d/i).first().click().catch(() => {});
    }
    await ctx.sleep(800);
    await ctx.shot("participants-dancer-selected");

    // Advance through Continue buttons (participants -> form -> confirm).
    for (let i = 0; i < 5; i++) {
      if (page.url().includes("/register/waitlist/confirm")) break;
      const cont = page.getByRole("button", { name: /Continue|Next|Review|Submit/i }).first();
      if (!(await cont.count())) break;
      if (await cont.isDisabled().catch(() => true)) {
        // Form step: fill visible text/long inputs, pick first option of any
        // select/radio (e.g. the "how did you hear about us" referral question).
        const inputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input[type="tel"]:visible, textarea:visible');
        const n = await inputs.count();
        for (let k = 0; k < n; k++) await inputs.nth(k).fill("N/A").catch(() => {});
        const selects = page.locator("select:visible");
        const sN = await selects.count();
        for (let k = 0; k < sN; k++) await selects.nth(k).selectOption({ index: 1 }).catch(() => {});
        const radios = page.locator('input[type="radio"]:visible');
        if (await radios.count()) await radios.first().check().catch(() => {});
        await ctx.sleep(400);
      }
      if (await cont.isDisabled().catch(() => true)) {
        await ctx.shot(`step-${i + 2}-blocked`);
        break;
      }
      await cont.click().catch(() => {});
      await ctx.sleep(1600);
      await ctx.shot(`step-${i + 2}`);
    }

    ctx.note(`Final URL: ${page.url()}`);
    const onConfirm = page.url().includes("/register/waitlist/confirm");
    const success = await ctx.exists("You're on the waitlist");
    ctx.note(
      onConfirm || success
        ? `✅ Reached waitlist confirm step (success text present: ${success}).`
        : "Did not reach the waitlist confirm step — see screenshots for where it stopped.",
    );
    await ctx.sleep(1500);
    await ctx.shot("final-state");
  },
};
