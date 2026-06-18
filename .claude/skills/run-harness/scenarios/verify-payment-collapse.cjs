/*
 * Verify the Payment step "unused rate bands / programs" collapse toggle.
 *   node .claude/skills/run-harness/harness.cjs verify-payment-collapse --role admin
 */
const path = require("path");

module.exports = {
  name: "verify-payment-collapse",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.SEM || "00002026-0003-0000-0000-000000000001";
    page.on("pageerror", (e) => ctx.note(`PAGEERROR: ${e.message}`));
    async function cap(label, desc) { const f = await ctx.shot(label); ctx.note(`${path.basename(f)} — ${desc}`); }
    async function clickText(re, settle = 1200) {
      const el = page.getByText(re).first();
      if (await el.count()) { await el.click().catch(() => {}); await ctx.sleep(settle); return true; }
      ctx.note(`text ${re} not found (non-fatal)`); return false;
    }

    await page.goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=payment`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
    await ctx.sleep(2500);

    // Tuition rates tab — unused bands collapsed
    const tr = page.getByRole("button", { name: /Tuition rates/i }).first();
    if (await tr.count()) { await tr.click().catch(() => {}); await ctx.sleep(1200); }
    await cap("01-tuition-collapsed", "Tuition rates — unused bands collapsed by default behind a 'Show N unused rate bands' toggle.");
    if (await clickText(/Show \d+ unused rate band/)) {
      await cap("02-tuition-expanded", "Tuition rates — after clicking the toggle, unused bands revealed.");
    }

    // Special programs tab
    const sp = page.getByRole("button", { name: /Special programs/i }).first();
    if (await sp.count()) { await sp.click().catch(()=>{}); await ctx.sleep(1200); }
    await cap("03-programs-collapsed", "Special programs — unused programs collapsed by default.");
    if (await clickText(/Show \d+ unused program/)) {
      await cap("04-programs-expanded", "Special programs — after clicking the toggle, unused programs revealed.");
    }

    ctx.note("Payment collapse verification complete (read-only).");
  },
};
