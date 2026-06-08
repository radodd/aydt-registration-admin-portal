/*
 * PRICING-TRANSFER PARITY HARNESS — admin-configured costs → user-facing checkout.
 *   node .claude/skills/run-harness/harness.cjs pricing-transfer-spring-2026 --role admin
 *
 * Goal: prove the costs an admin assigns to classes (rate bands + fee config)
 * transfer ACCURATELY to the family-facing registration flow and are MAINTAINED
 * line-by-line all the way to the Payment step.
 *
 * computePricingQuote is the single authoritative engine used by both surfaces,
 * so the real test is: independently re-derive every expected line item straight
 * from the admin-side DB config, drive the public flow to /register/payment, scrape
 * the rendered line items + Total Due, and assert FULL line-item parity.
 *
 * Targets the priced, published "Spring 2026" semester (bba3a0a5…). Override SEM=<uuid>.
 *
 * Enrollment is deliberately a SINGLE dancer in a SINGLE 1x/week standard class so
 * the expected quote is exactly derivable (no family discount — needs 2 dancers; no
 * 3+ class discount — needs 3 classes; no auto-apply coupons — all coupons are coded).
 * The harness still reads the configured discounts/coupons and asserts they correctly
 * DON'T fire (no phantom lines), which is the "maintained throughout" guarantee.
 *
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

const NOW = new Date("2026-06-08T00:00:00Z");
function ageMonths(birthDate) {
  const b = new Date(birthDate);
  return (NOW.getFullYear() - b.getFullYear()) * 12 + (NOW.getMonth() - b.getMonth());
}
// "$1,513.06" / "-$50.00" / "−$50.00" → number
function money(s) {
  const cleaned = String(s).replace(/[^0-9.\-−]/g, "").replace("−", "-");
  if (cleaned === "" || cleaned === "-") return null;
  return parseFloat(cleaned);
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
const DIV_LABEL = { early_childhood: "Early Childhood", junior: "Junior", senior: "Senior", competition: "Competition" };

// Mirror computePricingQuote.classifySpecialProgramKey: returns the
// special_program_tuition key a class maps to (fixed-fee, bypasses rate bands),
// or null for a standard rate-band class.
function classifySpecialProgramKey(cls) {
  if (cls.is_competition_track) return cls.division === "senior" ? "competition_senior" : "competition_junior";
  if (cls.discipline === "technique") return "technique";
  if (cls.discipline === "pre_pointe") return "pre_pointe";
  if (cls.discipline === "pointe") return "pointe";
  if (cls.division === "early_childhood") return "early_childhood";
  return null;
}

module.exports = {
  name: "pricing-transfer-spring-2026",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const SEM = process.env.SEM || "bba3a0a5-36a5-48a8-9398-a9cbe2ce4c44";

    page.on("dialog", (d) => d.accept().catch(() => {}));

    const results = []; // { ok, msg }
    const assert = (ok, msg) => {
      results.push({ ok, msg });
      ctx.note(`${ok ? "✅" : "❌"} ${msg}`);
    };

    /* ── 0. Admin-side config (the source of the costs) ──────────────────── */
    const { data: sem } = await sb
      .from("semesters").select("id, name, status").eq("id", SEM).maybeSingle();
    if (!sem) return ctx.note(`ERROR: semester ${SEM} not found. Set SEM=<uuid>.`);
    ctx.note(`Semester: "${sem.name}" status=${sem.status}`);
    if (sem.status !== "published")
      ctx.note("⚠ Semester not published — the public /semester page may not show classes.");

    const { data: fcRow } = await sb
      .from("semester_fee_config").select("*").eq("semester_id", SEM).maybeSingle();
    const fc = {
      reg: Number(fcRow?.registration_fee_per_child ?? 40),
      family: Number(fcRow?.family_discount_amount ?? 50),
      seniorVideo: Number(fcRow?.senior_video_fee_per_registrant ?? 15),
      seniorCostume: Number(fcRow?.senior_costume_fee_per_class ?? 65),
      juniorCostume: Number(fcRow?.junior_costume_fee_per_class ?? 55),
      exemptKeys: (fcRow?.costume_fee_exempt_keys ??
        ["technique", "pre_pointe", "pointe", "early_childhood", "competition"]),
    };
    ctx.note(`Fee config: reg=$${fc.reg} seniorVideo=$${fc.seniorVideo} seniorCostume=$${fc.seniorCostume} juniorCostume=$${fc.juniorCostume} exempt=[${fc.exemptKeys.join(",")}]`);

    const { data: bandRows } = await sb
      .from("tuition_rate_bands").select("division, weekly_class_count, base_tuition").eq("semester_id", SEM);
    const band = (division, count) =>
      (bandRows ?? []).find((b) => b.division === division && b.weekly_class_count === count);
    ctx.note(`Rate bands configured: ${(bandRows ?? []).length}`);

    // Discounts/coupons we must prove DON'T fire for a 1-dancer/1-class cart.
    const { data: discRows } = await sb
      .from("semester_discounts")
      .select("discounts(name, is_active, discount_rules(threshold, threshold_unit, value, value_type))")
      .eq("semester_id", SEM);
    const activeDiscounts = (discRows ?? []).map((r) => r.discounts).filter((d) => d && d.is_active);
    const { data: coupRows } = await sb
      .from("semester_coupons").select("discount_coupons(name, code, is_active)").eq("semester_id", SEM);
    const autoApplyCoupons = (coupRows ?? [])
      .map((r) => r.discount_coupons).filter((c) => c && c.is_active && c.code === null);
    ctx.note(`Active discounts: ${activeDiscounts.map((d) => d.name).join("; ") || "none"}`);
    ctx.note(`Auto-apply (code-less) coupons: ${autoApplyCoupons.map((c) => c.name).join("; ") || "none"}`);

    /* ── 1. Pick a single-dancer / single 1x-week standard class ─────────── */
    const { data: admin } = await sb
      .from("users").select("id, family_id").eq("email", env.NEXT_PUBLIC_DEV_ADMIN_EMAIL).maybeSingle();
    const { data: dancers } = await sb
      .from("dancers").select("id, first_name, last_name, gender, birth_date").eq("family_id", admin.family_id);
    ctx.note(`Family dancers: ${(dancers ?? []).map((d) => `${d.first_name}(${(ageMonths(d.birth_date) / 12).toFixed(1)}y)`).join(", ")}`);

    const { data: classes } = await sb
      .from("classes")
      .select("id, name, division, discipline, is_competition_track, registration_fee_exempt, min_age, max_age, min_age_months, max_age_months, class_sections(id, capacity, is_drop_in, gender_restriction, days_of_week)")
      .eq("semester_id", SEM).eq("is_active", true).eq("visibility", "public").eq("is_tiered", false);

    function eligibleDancer(cls, sec) {
      for (const d of dancers ?? []) {
        const am = ageMonths(d.birth_date);
        const lo = cls.min_age_months ?? (cls.min_age != null ? cls.min_age * 12 : null);
        const hi = cls.max_age_months ?? (cls.max_age != null ? cls.max_age * 12 : null);
        if (lo != null && am < lo) continue;
        if (hi != null && am > hi) continue;
        const g = (sec.gender_restriction ?? "").toLowerCase();
        const unrestricted = ["", "any", "all", "none", "no_restriction"].includes(g);
        if (!unrestricted && g !== d.gender) continue;
        return d;
      }
      return null;
    }

    // Build all eligible single-section / single-day / open-capacity candidates,
    // then prefer a non-special SENIOR rate-band class (exercises base tuition +
    // video + costume + reg), then non-special junior, then anything (special).
    const candidates = [];
    for (const c of classes ?? []) {
      const secs = (c.class_sections ?? []).filter((s) => !s.is_drop_in);
      if (secs.length !== 1) continue; // single section → deterministic weekly count
      const sec = secs[0];
      const days = (sec.days_of_week ?? []).length || 1;
      if (days !== 1) continue; // single day → 1x/week
      if (!sec.capacity) continue;
      const { count } = await sb
        .from("section_enrollments").select("id", { count: "exact", head: true })
        .eq("section_id", sec.id).neq("status", "cancelled");
      if ((count ?? 0) >= sec.capacity) continue;
      const dancer = eligibleDancer(c, sec);
      if (!dancer) continue;
      candidates.push({ cls: c, sec, dancer, live: count ?? 0, special: classifySpecialProgramKey(c) });
    }
    const rank = (x) =>
      x.special == null && x.cls.division === "senior" ? 0
      : x.special == null && x.cls.division === "junior" ? 1
      : x.special == null ? 2 : 3;
    candidates.sort((a, b) => rank(a) - rank(b));
    // TARGET_CLASS=<substring> pins the class (e.g. an early-childhood class to
    // verify the special-program path); otherwise the highest-ranked is used.
    const pin = process.env.TARGET_CLASS;
    const target = (pin && candidates.find((x) => x.cls.name.toLowerCase().includes(pin.toLowerCase())))
      || candidates[0] || null;
    if (!target) {
      assert(false, "No eligible single 1x/week open-capacity standard class found — cannot drive flow.");
      summarize();
      return;
    }
    const { cls, sec, dancer } = target;
    ctx.note(`Target: "${cls.name}" [${cls.division}/${cls.discipline}] cap ${sec.capacity}, ${target.live} enrolled → dancer ${dancer.first_name}`);

    /* ── 2. Independently derive the EXPECTED quote from admin config ─────── */
    /* Mirrors computePricingQuote's classification priority for one class:     */
    /*   special-program (fixed semester_total) > rate-band (division × count). */
    const division = cls.division;
    const bandCount = 1; // single (section, day) pair
    const specialKey = target.special;

    const expected = [];
    let expBase, expCostume = 0, expVideo = 0, expReg, pricingModel;

    if (specialKey) {
      // Special-program path: fixed semester_total, no costume/video, reg = override ?? per-child.
      pricingModel = `special_program_tuition[${specialKey}]`;
      const { data: spRow } = await sb
        .from("special_program_tuition")
        .select("program_label, semester_total, registration_fee_override")
        .eq("semester_id", SEM).eq("program_key", specialKey).maybeSingle();
      if (!spRow) {
        assert(false, `No special_program_tuition row for "${specialKey}" — base cost was never assigned admin-side.`);
        summarize();
        return;
      }
      expBase = round2(Number(spRow.semester_total));
      expReg = spRow.registration_fee_override != null ? Number(spRow.registration_fee_override) : fc.reg;
      expected.push({ kind: "tuition", label: `Tuition — ${spRow.program_label}`, amount: expBase });
    } else {
      // Rate-band path: base = division × weekly-count band; junior/senior add costume/video.
      pricingModel = `tuition_rate_bands[${division}/${bandCount}x]`;
      const isExempt = fc.exemptKeys.includes(cls.discipline) ||
        (fc.exemptKeys.includes("competition") && division === "competition");
      const standardWeekly = isExempt ? 0 : bandCount;
      const rb = band(division, bandCount);
      if (!rb) {
        assert(false, `No rate band configured for ${division}/${bandCount}x — base cost was never assigned admin-side.`);
        summarize();
        return;
      }
      expBase = round2(Number(rb.base_tuition));
      const expCostumePer = division === "senior" ? fc.seniorCostume : division === "junior" ? fc.juniorCostume : 0;
      expCostume = round2(expCostumePer * standardWeekly);
      expVideo = division === "senior" && standardWeekly > 0 ? fc.seniorVideo : 0;
      const allExempt = (cls.registration_fee_exempt === true) || isExempt;
      expReg = allExempt ? 0 : fc.reg;
      expected.push({ kind: "tuition", label: `Tuition (${DIV_LABEL[division] ?? division}, ${bandCount}x/week)`, amount: expBase });
      if (expVideo > 0) expected.push({ kind: "video", label: "Video Fee (Senior)", amount: expVideo });
      if (expCostume > 0) expected.push({ kind: "costume", label: "Recital Costume Fee", amount: expCostume });
    }
    if (expReg > 0) expected.push({ kind: "reg", label: "Registration Fee", amount: expReg });
    const expGrand = round2(expBase + expCostume + expVideo + expReg);
    ctx.note(`Pricing model: ${pricingModel}`);
    ctx.note("EXPECTED (from admin config):");
    for (const e of expected) ctx.note(`   ${e.label} = $${e.amount.toFixed(2)}`);
    ctx.note(`   → expected Total Due = $${expGrand.toFixed(2)}`);

    /* ── 3. Admin-side visual evidence: the Payment-step rate-band editor ─── */
    await page.goto(`${ctx.BASE}/admin/semesters/${SEM}/edit?step=payment`, {
      waitUntil: "domcontentloaded", timeout: 30000,
    }).catch((e) => ctx.note(`admin payment goto err: ${e.message}`));
    await ctx.sleep(3200);
    await ctx.shot("01a-admin-payment-plans");
    // The assigned base costs live under the "Tuition Rates" (rate bands) and
    // "Special Programs" (fixed semester totals) sub-tabs — capture both as the
    // admin-side source of truth for the costs we assert on the user side.
    for (const tab of ["Tuition Rates", "Special Programs"]) {
      const t = page.getByText(new RegExp(`\\d+\\.\\s*${tab}`, "i")).first()
        .or(page.getByRole("tab", { name: new RegExp(tab, "i") }).first());
      if (await t.count()) { await t.click().catch(() => {}); await ctx.sleep(1400); }
      await ctx.shot(`01b-admin-${tab.toLowerCase().replace(/\s+/g, "-")}`);
    }

    /* ── 4. User-facing flow → Payment step ──────────────────────────────── */
    function pad(n) { return String(n).padStart(2, "0"); }
    let shotIdx = 2;

    try {
      await ctx.goto(`/semester/${SEM}`);
      await page.locator(".sem-class-card-top").first().waitFor({ timeout: 15000 }).catch(() => {});
      await ctx.sleep(900);
      await ctx.shot(`${pad(shotIdx++)}-semester-page`);

      const headers = page.locator(".sem-class-card-top");
      let opened = false;
      for (let i = 0; i < (await headers.count()); i++) {
        const txt = await headers.nth(i).innerText().catch(() => "");
        if (txt.includes(cls.name)) {
          await headers.nth(i).scrollIntoViewIfNeeded().catch(() => {});
          await headers.nth(i).click().catch(() => {});
          opened = true;
          break;
        }
      }
      ctx.note(opened ? `Opened class card "${cls.name}".` : "⚠ Could not locate the target class card.");
      await ctx.sleep(1100);
      await ctx.shot(`${pad(shotIdx++)}-class-card-expanded`);

      const atc = page.locator("button.sem-atc", { hasText: /Add to Cart/i }).first();
      await atc.scrollIntoViewIfNeeded().catch(() => {});
      await atc.click().catch(() => {});
      await ctx.sleep(1800);
      await ctx.shot(`${pad(shotIdx++)}-added-to-cart`);

      await ctx.goto(`/cart`);
      await ctx.sleep(1300);
      await ctx.shot(`${pad(shotIdx++)}-cart`);

      const cont = page.getByRole("link", { name: /Checkout|Continue|Register|Proceed/i })
        .or(page.getByRole("button", { name: /Checkout|Continue|Register|Proceed/i })).first();
      if (await cont.count()) await cont.click().catch(() => {});
      else await ctx.goto(`/register?semester=${SEM}`);
      await ctx.sleep(2000);

      async function fillCurrentStep() {
        const texts = page.locator('input[type="text"]:visible, input[type="email"]:visible, textarea:visible');
        for (let k = 0; k < (await texts.count()); k++) {
          const el = texts.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("N/A").catch(() => {});
        }
        const tels = page.locator('input[type="tel"]:visible, input[type="number"]:visible');
        for (let k = 0; k < (await tels.count()); k++) {
          const el = tels.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("5555555555").catch(() => {});
        }
        const dates = page.locator('input[type="date"]:visible');
        for (let k = 0; k < (await dates.count()); k++) {
          const el = dates.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("2016-04-12").catch(() => {});
        }
        const sels = page.locator("select:visible");
        for (let k = 0; k < (await sels.count()); k++) {
          const el = sels.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.selectOption({ index: 1 }).catch(() => {});
        }
        const chk = page.locator('input[type="checkbox"]:visible');
        for (let k = 0; k < (await chk.count()); k++) await chk.nth(k).check().catch(() => {});
        await ctx.sleep(400);
      }

      for (let i = 0; i < 8 && !page.url().includes("/register/payment"); i++) {
        await ctx.shot(`${pad(shotIdx++)}-register-${page.url().split("/register/")[1]?.split("?")[0] || "step"}`);
        if (page.url().includes("/participants")) {
          // Dancers are assigned by CLICKING their card under "SELECT DANCERS".
          // Eligible dancers show "Near limit"/no-warning; ineligible show
          // "Outside requirement". Click the intended dancer's card by name.
          const fullName = `${dancer.first_name} ${dancer.last_name ?? ""}`.trim();
          const card = page.getByText(fullName, { exact: false }).first()
            .or(page.getByText(dancer.first_name, { exact: false }).first());
          await card.waitFor({ timeout: 6000 }).catch(() => {});
          await card.click().catch(() => {});
          await ctx.sleep(800);
          const done = await page.getByText(/1 of 1 assignments complete|1 \/ 1 assigned/i).count();
          ctx.note(done > 0 ? `Assigned dancer ${fullName}.` : `⚠ Dancer assignment not confirmed for ${fullName}.`);
        }
        await fillCurrentStep();
        const next = page.getByRole("button", { name: /Continue|Next|Review|Proceed/i }).first();
        if (!(await next.count())) break;
        if (await next.isDisabled().catch(() => true)) {
          ctx.note(`Next disabled at ${page.url()} after fill — stopping.`);
          break;
        }
        const before = page.url();
        await next.click().catch(() => {});
        await ctx.sleep(1800);
        if (page.url() === before && !before.includes("/register/payment")) {
          await fillCurrentStep();
          await next.click().catch(() => {});
          await ctx.sleep(1800);
        }
      }

      if (!page.url().includes("/register/payment")) {
        await ctx.shot(`${pad(shotIdx++)}-stopped`);
        assert(false, `Did not reach the Payment step (stuck at ${page.url()}).`);
        summarize();
        return;
      }

      // Let the quote resolve.
      await page.getByText("Total Due", { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
      await ctx.sleep(1200);
      await ctx.shot(`${pad(shotIdx++)}-payment-step`);

      /* ── 5. Scrape rendered line items + Total Due ─────────────────────── */
      const pricingUnavailable = await page.getByText("Pricing unavailable", { exact: false }).count();
      if (pricingUnavailable > 0) {
        assert(false, "User side shows 'Pricing unavailable' — admin costs did NOT transfer.");
      }

      const scraped = await page.evaluate(() => {
        const out = { lines: [], totalDue: null };
        document.querySelectorAll("div").forEach((d) => {
          if (d.children.length === 2) {
            const a = d.children[0], b = d.children[1];
            if (a.tagName === "SPAN" && b.classList.contains("tabular-nums")) {
              out.lines.push({ label: a.textContent.trim(), amount: b.textContent.trim() });
            }
          }
        });
        const td = [...document.querySelectorAll("div")].find(
          (d) => d.children.length === 0 && d.textContent.trim() === "Total Due",
        );
        if (td) {
          const banner = td.closest("div.flex");
          if (banner) {
            const big = [...banner.querySelectorAll("div.tabular-nums")].pop();
            if (big) out.totalDue = big.textContent.trim();
          }
        }
        return out;
      });

      ctx.note("SCRAPED line items (user side):");
      for (const l of scraped.lines) ctx.note(`   ${l.label} = ${l.amount}`);
      ctx.note(`   Total Due (scraped) = ${scraped.totalDue ?? "—"}`);

      const findLine = (kind) => {
        const norm = (s) => s.toLowerCase();
        if (kind === "tuition") return scraped.lines.find((l) => norm(l.label).includes("tuition"));
        if (kind === "video") return scraped.lines.find((l) => norm(l.label).includes("video fee"));
        if (kind === "costume") return scraped.lines.find((l) => norm(l.label).includes("costume"));
        if (kind === "reg") return scraped.lines.find((l) => norm(l.label).includes("registration fee"));
        return null;
      };

      /* ── 6. FULL LINE-ITEM PARITY ASSERTIONS ───────────────────────────── */
      for (const e of expected) {
        const got = findLine(e.kind);
        if (!got) { assert(false, `Missing "${e.label}" line on user side (expected $${e.amount.toFixed(2)}).`); continue; }
        const amt = money(got.amount);
        const ok = amt != null && Math.abs(amt - e.amount) < 0.005;
        assert(ok, `${e.kind}: "${got.label}" = ${got.amount} (expected $${e.amount.toFixed(2)})`);
      }

      // Registration fee must be exactly the admin-configured per-child fee.
      const regLine = findLine("reg");
      if (expReg > 0) {
        assert(regLine != null && Math.abs(money(regLine.amount) - fc.reg) < 0.005,
          `Auto registration fee transferred exactly: ${regLine ? regLine.amount : "MISSING"} (admin config $${fc.reg}).`);
      }

      // No phantom discount/family/coupon lines (thresholds unmet, coupons coded).
      const phantom = scraped.lines.filter((l) => /discount|coupon|family|promo/i.test(l.label));
      assert(phantom.length === 0,
        phantom.length === 0
          ? `No phantom discount/coupon lines (configured: ${activeDiscounts.length} discount(s) correctly suppressed for 1 dancer/1 class).`
          : `Unexpected discount/coupon line(s): ${phantom.map((p) => `${p.label}=${p.amount}`).join(", ")}.`);
      assert(autoApplyCoupons.length === 0,
        `No code-less auto-apply coupons exist (${autoApplyCoupons.length}) — none should appear.`);

      // Total Due parity (admin-derived) + internal consistency (sum of expected lines).
      const gotTotal = money(scraped.totalDue);
      assert(gotTotal != null && Math.abs(gotTotal - expGrand) < 0.005,
        `Total Due = ${scraped.totalDue} (expected $${expGrand.toFixed(2)} from admin config).`);

      const sumExpected = round2(expected.reduce((s, e) => s + e.amount, 0));
      assert(Math.abs(sumExpected - expGrand) < 0.005,
        `Expected line items sum to grand total ($${sumExpected.toFixed(2)} == $${expGrand.toFixed(2)}).`);

      summarize();
    } finally {
      const { error } = await sb
        .from("seat_holds").delete().eq("section_id", sec.id).eq("user_id", admin.id);
      ctx.note(error ? `cleanup seat_holds err: ${error.message}` : "cleaned up seat_holds for this run.");
    }

    function summarize() {
      const pass = results.filter((r) => r.ok).length;
      const fail = results.length - pass;
      ctx.note(`\n══ PARITY RESULT: ${pass}/${results.length} passed, ${fail} failed ══`);
      ctx.note(fail === 0
        ? "✅ PASS — admin-assigned base tuition + auto registration fee transferred accurately and were maintained through to Payment."
        : "❌ FAIL — pricing did not transfer/maintain accurately; see ❌ lines above.");
    }
  },
};
