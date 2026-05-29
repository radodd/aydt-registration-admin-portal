/*
 * Meeting-plan #5 QA: admin-side waitlist surfaces.
 *   node .claude/skills/run-harness/harness.cjs waitlist-admin
 *
 * Captures: the new /admin/waitlist view + empty state, the sidebar nav item,
 * and the per-class "Enable waitlist" toggle inside Edit Class Details.
 * Does not depend on seeded waitlist rows.
 */
module.exports = {
  name: "waitlist-admin",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;

    /* 1. New admin waitlist view */
    await ctx.goto("/admin/waitlist");
    await ctx.sleep(1200);
    await ctx.shot("waitlist-view");
    const empty = await ctx.exists("No one is currently on a waitlist.");
    ctx.note(
      empty
        ? "Waitlist view rendered: EMPTY state (no active entries)."
        : "Waitlist view rendered: has class groups / entries.",
    );
    ctx.note(
      (await ctx.exists("Waitlist"))
        ? "Sidebar 'Waitlist' nav item is visible."
        : "WARNING: 'Waitlist' nav item not found.",
    );

    /* 2. Per-class waitlist toggle (Edit Class Details modal) */
    await ctx.goto("/admin/classes");
    await ctx.sleep(1500);
    await ctx.shot("classes-list");

    // Select the first class card in the scrollable list -> detail panel (?id=).
    const cards = page.locator('div[class*="overflow-y-auto"] [role="button"], div[class*="overflow-y-auto"] > div[onclick], div[class*="overflow-y-auto"] > div');
    let opened = false;
    const n = await cards.count();
    ctx.note(`Class list shows ~${n} candidate row(s).`);
    for (let i = 0; i < Math.min(n, 5); i++) {
      await cards.nth(i).click().catch(() => {});
      await ctx.sleep(1200);
      if (await ctx.exists("Edit Details")) {
        opened = true;
        break;
      }
    }
    await ctx.shot("class-detail-panel");

    if (!opened) {
      ctx.note("Could not open a class detail panel ('Edit Details' not found).");
      return;
    }

    await ctx.clickText("Edit Details");
    await ctx.sleep(700);
    await ctx.shot("edit-class-modal");
    ctx.note(
      (await ctx.exists("Enable waitlist"))
        ? "✅ 'Enable waitlist' toggle present in Edit Class Details."
        : "WARNING: 'Enable waitlist' toggle NOT found in the modal.",
    );

    // Toggle it on so the checkbox + helper text are captured checked.
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.count()) {
      await checkbox.check().catch(() => {});
      await ctx.sleep(300);
      await ctx.shot("edit-class-modal-waitlist-checked");
    }
  },
};
