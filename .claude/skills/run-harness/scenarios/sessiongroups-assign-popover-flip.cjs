/*
 * Verify the "+ Assign" group popover in SessionGroupsStep flips UP when the
 * row is near the viewport bottom (the last-row clipping bug) and still opens
 * DOWN for top rows.
 *
 *   node .claude/skills/run-harness/harness.cjs sessiongroups-assign-popover-flip --role admin
 *
 * Target defaults to the seeded "Summer 2026" published semester (90 sessions →
 * a long, scrollable list). Override with SEM=<uuid>.
 */
module.exports = {
  name: "sessiongroups-assign-popover-flip",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const SEM = process.env.SEM || "9e635f72-1f47-40fd-a4b3-f47a1d1081f2";

    page.on("dialog", (d) => d.accept().catch(() => {}));
    page.on("pageerror", (e) => ctx.note(`PAGEERROR: ${e.message}`));

    // Popover bounding-box probe. Returns null if no popover is open.
    async function probePopover() {
      return page.evaluate(() => {
        const el = document.querySelector("div.fixed.z-50.min-w-40");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          height: Math.round(r.height),
          vh: window.innerHeight,
          fullyVisible: r.top >= 0 && r.bottom <= window.innerHeight,
        };
      });
    }

    // Short viewport so the session list overflows and scrolls — this is the
    // geometry where the last rows sit at the bottom edge and the old popover
    // clipped off-screen.
    await page.setViewportSize({ width: 1280, height: 500 });

    await page.goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=sessionGroups`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await ctx.sleep(3500); // table hydrate
    await ctx.shot("01-class-groups-step");

    // ── Create a few groups so the popover has real height ──────────────────
    const nameInput = page.getByPlaceholder("New group name...");
    const createBtn = page.getByRole("button", { name: /Create group/i });
    for (const gname of ["Combo A", "Combo B", "Combo C"]) {
      await nameInput.fill(gname);
      await createBtn.click();
      await ctx.sleep(400);
    }
    await ctx.shot("02-groups-created");

    const assignBtns = page.getByRole("button", { name: /\+ Assign/ });
    const n = await assignBtns.count();
    ctx.note(`Found ${n} "+ Assign" buttons (ungrouped session rows).`);
    if (n === 0) {
      ctx.note("❌ No ungrouped rows to test against.");
      return;
    }

    // ── LAST row: should flip UP and be fully visible ───────────────────────
    // Position the last ungrouped row near the BOTTOM of the scroll viewport —
    // the geometry where the old downward popover clipped off-screen.
    await page.evaluate(() => {
      const el = document.querySelector("div.h-full.overflow-y-auto");
      const btns = [...document.querySelectorAll("button")].filter((b) =>
        b.textContent.trim().startsWith("+ Assign"),
      );
      const btn = btns[btns.length - 1];
      if (el && btn) {
        const c = el.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        el.scrollTop += b.bottom - c.bottom + 8;
      }
    });
    await ctx.sleep(400);
    const lastBtn = assignBtns.nth(n - 1);
    const lastRect = await lastBtn.boundingBox();
    await lastBtn.click();
    await ctx.sleep(300);
    const lastPop = await probePopover("last");
    await ctx.shot("03-last-row-assign-popover");
    if (!lastPop) {
      ctx.note("❌ LAST row: popover did not open.");
    } else {
      const opensUp = lastRect && lastPop.top < lastRect.y;
      ctx.note(
        `LAST row: button.y=${lastRect ? Math.round(lastRect.y) : "?"} ` +
          `popover top=${lastPop.top} bottom=${lastPop.bottom} vh=${lastPop.vh} ` +
          `opensUp=${opensUp} fullyVisible=${lastPop.fullyVisible}`,
      );
      ctx.note(
        lastPop.fullyVisible
          ? "✅ PASS — last-row popover is fully within the viewport (no bottom clip)."
          : "❌ FAIL — last-row popover extends outside the viewport.",
      );
    }

    // ── TOP row: should open DOWN normally ──────────────────────────────────
    // Use a tall viewport so a top-positioned row has genuine room below for the
    // (tall) menu — this exercises the non-flipped downward path.
    await page.setViewportSize({ width: 1280, height: 900 });
    await ctx.sleep(300);
    // Position the first ungrouped row near the TOP of the scroll viewport
    // (clear of the sticky header, with ample room below). This scroll also
    // fires onScroll, which closes the previous popover.
    await page.evaluate(() => {
      const el = document.querySelector("div.h-full.overflow-y-auto");
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.trim().startsWith("+ Assign"),
      );
      if (el && btn) {
        const c = el.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        el.scrollTop += b.top - c.top - 48;
      }
    });
    await ctx.sleep(500);
    const topBtns = page.getByRole("button", { name: /\+ Assign/ });
    const topBtn = topBtns.first();
    const topRect = await topBtn.boundingBox();
    await topBtn.click();
    await ctx.sleep(300);
    const topPop = await probePopover("top");
    await ctx.shot("04-top-row-assign-popover");
    if (!topPop) {
      ctx.note("❌ TOP row: popover did not open.");
    } else {
      const opensDown = topRect && topPop.top >= topRect.y;
      ctx.note(
        `TOP row: button.y=${topRect ? Math.round(topRect.y) : "?"} ` +
          `popover top=${topPop.top} bottom=${topPop.bottom} vh=${topPop.vh} ` +
          `opensDown=${opensDown} fullyVisible=${topPop.fullyVisible}`,
      );
      ctx.note(
        opensDown && topPop.fullyVisible
          ? "✅ PASS — top-row popover opens downward and is fully visible."
          : "❌ FAIL — top-row popover behaved unexpectedly.",
      );
    }
  },
};
