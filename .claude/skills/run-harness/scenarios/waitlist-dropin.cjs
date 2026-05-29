/*
 * Meeting-plan #5 QA: PER-DATE drop-in waitlist.
 *   node .claude/skills/run-harness/harness.cjs waitlist-dropin --role admin
 *
 * Requires a drop-in class with at least one FULL date among open ones, waitlist
 * enabled (seed via _wl-seed-dropin.cjs). Verifies the date picker marks the
 * full date "Waitlist", lets the user select it, surfaces a "Join Waitlist · N"
 * action, and routes into waitlist mode.
 */
module.exports = {
  name: "waitlist-dropin",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.WL_SEM || "3b3b3b3b-0001-4000-8000-000000000001";

    await ctx.goto(`/semester/${SEM}`);
    await page.locator(".sem-class-card-top").first().waitFor({ timeout: 15000 }).catch(() => {});
    await ctx.sleep(800);
    await ctx.shot("catalog");

    // Expand the "Saturday Open Class" (or first card mentioning Waitlist/drop-in).
    const headers = page.locator(".sem-class-card-top");
    const hN = await headers.count();
    for (let i = 0; i < hN; i++) {
      const txt = await headers.nth(i).innerText().catch(() => "");
      if (/Saturday Open Class|Waitlist/i.test(txt)) {
        await headers.nth(i).click().catch(() => {});
        await ctx.sleep(900);
        break;
      }
    }
    await ctx.shot("class-expanded-datepicker");

    // The full date renders a "Waitlist" pill + checkbox. Count them.
    const waitlistPills = page.getByText("Waitlist", { exact: true });
    ctx.note(`'Waitlist' pills/labels in picker: ${await waitlistPills.count()}.`);

    // Select the waitlist date checkbox (the one whose row shows the Waitlist pill).
    // Checkboxes with the rose accent are waitlist rows; click the first enabled
    // checkbox sitting in a row that contains "Waitlist".
    const waitlistRow = page.locator("label").filter({ hasText: "Waitlist" }).first();
    const box = waitlistRow.locator('input[type="checkbox"]');
    if (await box.count()) {
      await box.check().catch(() => {});
      await ctx.sleep(600);
    } else {
      ctx.note("No waitlist-date checkbox found.");
    }
    await ctx.shot("waitlist-date-selected");

    const joinBtn = page.getByRole("button", { name: /Join Waitlist/i });
    ctx.note(`'Join Waitlist' button present after selecting a full date: ${(await joinBtn.count()) > 0}.`);
    if (!(await joinBtn.count())) {
      ctx.note("Expected a Join Waitlist button after selecting the full date.");
      return;
    }

    await joinBtn.first().click();
    await ctx.sleep(2500);
    ctx.note(`URL after Join Waitlist: ${page.url()}`);
    ctx.note(
      page.url().includes("waitlist=1")
        ? "✅ Per-date drop-in waitlist routed into waitlist mode (?waitlist=1)."
        : `WARNING: expected ?waitlist=1, got ${page.url()}`,
    );
    await ctx.shot("after-join-waitlist");
  },
};
