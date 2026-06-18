/*
 * Verify the Discounts step redesign:
 *   - duplicate-record warning banner + collapsed "N copies" badge
 *   - reveal-extras on badge click
 *   - Create discount opens a modal
 *   - Create coupon opens a modal
 *
 *   node .claude/skills/run-harness/harness.cjs verify-discounts-modals --role admin
 */
const path = require("path");

module.exports = {
  name: "verify-discounts-modals",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.SEM || "00002026-0003-0000-0000-000000000001";
    page.on("pageerror", (e) => ctx.note(`PAGEERROR: ${e.message}`));
    async function cap(label, desc) {
      const f = await ctx.shot(label);
      ctx.note(`${path.basename(f)} — ${desc}`);
    }

    await page
      .goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=discounts`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => {});
    await ctx.sleep(2800);

    await cap(
      "01-discounts-list",
      "Discounts tab — duplicate banner up top + one representative row per name with a 'N copies' badge.",
    );

    // Reveal the duplicates under the first cluster
    const copies = page.getByText(/\d+ copies/).first();
    if (await copies.count()) {
      await copies.click().catch(() => {});
      await ctx.sleep(800);
      await cap(
        "02-dupes-revealed",
        "After clicking a 'copies' badge — the duplicate rows are revealed indented below the representative.",
      );
    } else {
      ctx.note("no 'N copies' badge found (no duplicates in this data?)");
    }

    // Create discount modal
    const cd = page.getByRole("button", { name: /Create discount/i }).first();
    if (await cd.count()) {
      await cd.click().catch(() => {});
      await ctx.sleep(900);
      await cap("03-create-discount-modal", "Create discount opens as a modal overlay.");
      // close
      await page.getByRole("button", { name: "Close" }).first().click().catch(() => {});
      await ctx.sleep(500);
    }

    // Coupons tab
    const couponsTab = page.getByRole("button", { name: /^Coupons$/ }).first();
    if (await couponsTab.count()) {
      await couponsTab.click().catch(() => {});
      await ctx.sleep(800);
      await cap("04-coupons-list", "Coupons tab list.");
    }

    // Create coupon modal
    const cc = page.getByRole("button", { name: /Create coupon/i }).first();
    if (await cc.count()) {
      await cc.click().catch(() => {});
      await ctx.sleep(900);
      await cap("05-create-coupon-modal", "Create coupon opens as a modal overlay.");
    }

    ctx.note("Discounts modal + duplicate-collapse verification complete.");
  },
};
