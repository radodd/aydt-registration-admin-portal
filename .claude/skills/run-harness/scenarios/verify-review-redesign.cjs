/*
 * Verify the Review & publish step redesign:
 *   - card-with-header per section (Details, Classes, etc.)
 *   - Discounts tab: Linked discounts + Coupons lists
 *   - Emails tab: Confirmation + Waitlist invitation combined sub-cards (previews intact)
 *
 *   node .claude/skills/run-harness/harness.cjs verify-review-redesign --role admin
 */
const path = require("path");

module.exports = {
  name: "verify-review-redesign",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.SEM || "00002026-0003-0000-0000-000000000001";
    page.on("pageerror", (e) => ctx.note(`PAGEERROR: ${e.message}`));
    async function cap(label, desc) {
      const f = await ctx.shot(label);
      ctx.note(`${path.basename(f)} — ${desc}`);
    }
    async function tab(name, label, desc) {
      const el = page.getByRole("button", { name }).first();
      if (await el.count()) {
        await el.click().catch(() => {});
        await ctx.sleep(1200);
        await cap(label, desc);
      } else {
        ctx.note(`tab ${name} not found (non-fatal)`);
      }
    }

    await page
      .goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=review`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => {});
    await ctx.sleep(2800);

    await cap("01-details", "Details tab — card-with-header (Semester info).");
    await tab(/Classes & Offerings/i, "02-classes", "Classes tab — card with table inside.");
    await tab(/Payment/i, "03-payment", "Payment tab — Payment plan + Fee configuration cards.");
    await tab(/^Discounts$/, "04-discounts", "Discounts tab — Linked discounts + Coupons lists in one card.");
    await tab(/^Emails$/, "05-emails", "Emails tab — Confirmation + Waitlist invitation sub-cards.");

    // scroll down within emails to capture the previews
    await page.mouse.wheel(0, 900).catch(() => {});
    await ctx.sleep(900);
    await cap("06-emails-previews", "Emails tab scrolled — desktop/mobile email previews intact.");

    ctx.note("Review redesign verification complete (read-only).");
  },
};
