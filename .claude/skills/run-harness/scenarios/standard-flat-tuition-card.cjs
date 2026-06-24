/*
 * STANDARD FLAT-TUITION DISPLAY HARNESS
 *   node .claude/skills/run-harness/harness.cjs standard-flat-tuition-card --role admin
 *
 * Verifies the fix: a standard (full_schedule) class's catalog card, the cart
 * drawer (mini-cart) row, and the full cart-page row all show the SAME admin-set
 * flat tuition (rate band 1x/week, or the per-class override) — NOT the stale
 * section_price_tiers value that used to leak (e.g. $77,593).
 *
 * Targets the priced, published "Spring 2026" semester (bba3a0a5…). Override SEM=<uuid>.
 * Read-only against the DB except cleanup of the seat_hold this run creates.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
function money(s) {
  const cleaned = String(s).replace(/[^0-9.\-−]/g, "").replace("−", "-");
  if (cleaned === "" || cleaned === "-") return null;
  return parseFloat(cleaned);
}
// Mirror computePricingQuote: these classes price via special_program_tuition,
// NOT rate bands — so they're out of scope for the rate-band flat-tuition fix.
function isSpecialProgram(cls) {
  if (cls.is_competition_track) return true;
  if (["technique", "pre_pointe", "pointe"].includes(cls.discipline)) return true;
  if (cls.division === "early_childhood") return true;
  return false;
}

module.exports = {
  name: "standard-flat-tuition-card",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const SEM = process.env.SEM || "bba3a0a5-36a5-48a8-9398-a9cbe2ce4c44";
    page.on("dialog", (d) => d.accept().catch(() => {}));

    const results = [];
    const assert = (ok, msg) => {
      results.push({ ok, msg });
      ctx.note(`${ok ? "✅" : "❌"} ${msg}`);
    };

    /* ── 0. DB: pick a standard rate-band class + derive expected flat tuition ── */
    const { data: sem } = await sb
      .from("semesters").select("id, name, status").eq("id", SEM).maybeSingle();
    if (!sem) return ctx.note(`ERROR: semester ${SEM} not found. Set SEM=<uuid>.`);
    ctx.note(`Semester: "${sem.name}" status=${sem.status}`);

    const { data: bandRows } = await sb
      .from("tuition_rate_bands")
      .select("division, weekly_class_count, base_tuition").eq("semester_id", SEM);
    const band1 = (division) =>
      (bandRows ?? []).find((b) => b.division === division && b.weekly_class_count === 1);

    const { data: admin } = await sb
      .from("users").select("id, family_id").eq("email", env.NEXT_PUBLIC_DEV_ADMIN_EMAIL).maybeSingle();

    const { data: classes } = await sb
      .from("classes")
      .select("id, name, division, discipline, is_competition_track, is_tiered, tuition_override_amount, visibility, class_sections(id, capacity, is_drop_in, days_of_week)")
      .eq("semester_id", SEM).eq("is_active", true).eq("visibility", "public").eq("is_tiered", false);

    // Standard full_schedule class: has a non-drop-in section, not special, and a
    // resolvable flat tuition (override, else a 1x rate band for its division).
    let target = null;
    let expected = null;
    for (const c of classes ?? []) {
      const secs = (c.class_sections ?? []).filter((s) => !s.is_drop_in);
      if (secs.length === 0) continue;
      if (isSpecialProgram(c)) continue;
      const flat =
        c.tuition_override_amount != null
          ? Number(c.tuition_override_amount)
          : (band1(c.division) ? Number(band1(c.division).base_tuition) : null);
      if (flat == null) continue;
      // Prefer a section with open capacity so Add-to-Cart succeeds.
      let chosen = null;
      for (const sec of secs) {
        const { count } = await sb
          .from("section_enrollments").select("id", { count: "exact", head: true })
          .eq("section_id", sec.id).neq("status", "cancelled");
        if ((count ?? 0) < (sec.capacity ?? 0)) { chosen = sec; break; }
      }
      if (!chosen) continue;
      target = { cls: c, sec: chosen };
      expected = flat;
      break;
    }

    if (!target) {
      assert(false, "No open-capacity standard rate-band class found on this semester — cannot drive flow.");
      return summarize();
    }
    const src = target.cls.tuition_override_amount != null ? "tuition_override_amount" : `rate band ${target.cls.division}/1x`;
    ctx.note(`Target class: "${target.cls.name}" [${target.cls.division}/${target.cls.discipline}]`);
    ctx.note(`Expected flat tuition = $${expected.toFixed(2)} (source: ${src})`);

    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp || !admin) return;
      cleanedUp = true;
      const { error } = await sb
        .from("seat_holds").delete().eq("section_id", target.sec.id).eq("user_id", admin.id);
      ctx.note(error ? `cleanup seat_holds err: ${error.message}` : "cleaned up seat_holds for this run.");
    };

    try {
      /* ── 1. Catalog ────────────────────────────────────────────────────── */
      await ctx.goto(`/semester/${SEM}`);
      await page.locator(".sem-class-card-top").first().waitFor({ timeout: 15000 }).catch(() => {});
      await ctx.sleep(900);
      await ctx.shot("01-catalog");

      /* ── 2. Expand the target class accordion ──────────────────────────── */
      const headers = page.locator(".sem-class-card-top");
      let opened = false;
      for (let i = 0; i < (await headers.count()); i++) {
        const txt = await headers.nth(i).innerText().catch(() => "");
        if (txt.includes(target.cls.name)) {
          await headers.nth(i).scrollIntoViewIfNeeded().catch(() => {});
          await headers.nth(i).click().catch(() => {});
          opened = true;
          break;
        }
      }
      assert(opened, opened ? `Opened class card "${target.cls.name}".` : `Could not locate class card "${target.cls.name}".`);
      await ctx.sleep(1000);
      await ctx.shot("02-card-expanded-price");

      /* ── 3. Read the card price ────────────────────────────────────────── */
      const cardPriceText = await page.locator(".sem-sc-price").first().innerText().catch(() => "");
      ctx.note(`Card price shown: "${cardPriceText}"`);
      const cardPrice = money(cardPriceText);
      assert(cardPrice != null && Math.abs(cardPrice - expected) < 0.005,
        `Card price = ${cardPriceText} (expected $${expected.toFixed(2)}).`);
      assert(cardPrice != null && cardPrice < 100000,
        `Card price is a sane tuition value, not the stale section_price_tiers leak (${cardPriceText}).`);

      /* ── 4. Add to cart → drawer auto-opens ────────────────────────────── */
      const atc = page.locator("button.sem-atc", { hasText: /Add to Cart/i }).first();
      await atc.scrollIntoViewIfNeeded().catch(() => {});
      await atc.click().catch(() => {});
      await ctx.sleep(1800);
      await page.locator(".sem-cart-drawer:not(.hidden)").first().waitFor({ timeout: 6000 }).catch(() => {});
      await ctx.shot("03-cart-drawer-row");

      const drawerRowText = await page.locator(".sem-cd-row-price").first().innerText().catch(() => "");
      ctx.note(`Cart-drawer row price: "${drawerRowText}"`);
      const drawerPrice = money(drawerRowText);
      assert(drawerPrice != null && Math.abs(drawerPrice - expected) < 0.005,
        `Cart-drawer row price = ${drawerRowText} (expected $${expected.toFixed(2)}, not "—").`);

      /* ── 5. Full cart page ─────────────────────────────────────────────── */
      await ctx.goto(`/cart`);
      await ctx.sleep(1500);
      await ctx.shot("04-cart-page");

      // Scrape any rendered currency text on the cart page; the per-row tuition
      // value should appear (and equal the expected flat tuition).
      const cartTexts = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("*").forEach((el) => {
          if (el.children.length === 0) {
            const t = (el.textContent || "").trim();
            if (/^[-−]?\$[\d,]+(\.\d{2})?$/.test(t)) out.push(t);
          }
        });
        return out;
      });
      ctx.note(`Cart-page currency values seen: ${cartTexts.join(", ") || "(none)"}`);
      const matchOnCart = cartTexts.some((t) => Math.abs((money(t) ?? -1) - expected) < 0.005);
      assert(matchOnCart, `Cart page shows the flat tuition $${expected.toFixed(2)} on the row.`);

      summarize();
    } finally {
      await cleanup();
    }

    function summarize() {
      const pass = results.filter((r) => r.ok).length;
      const fail = results.length - pass;
      ctx.note(`\n══ RESULT: ${pass}/${results.length} passed, ${fail} failed ══`);
      ctx.note(fail === 0
        ? `✅ PASS — card, cart-drawer row, and cart page all show the flat tuition $${expected != null ? expected.toFixed(2) : "?"}.`
        : "❌ FAIL — see ❌ lines above.");
    }
  },
};
