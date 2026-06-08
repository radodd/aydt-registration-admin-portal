/*
 * DISCOUNT-COVERAGE PARITY HARNESS — extends pricing-transfer to discounts.
 *   MODE=multiclass node .claude/skills/run-harness/harness.cjs pricing-discounts-spring-2026 --role admin
 *   MODE=family     node .claude/skills/run-harness/harness.cjs pricing-discounts-spring-2026 --role admin
 *
 * Verifies the two threshold discounts admins configure transfer correctly and
 * are MAINTAINED to the Payment step, asserting the INTENDED business rule (so a
 * stacking/double-dip bug shows up as a FAIL with concrete numbers):
 *
 *   MODE=multiclass — 1 dancer in 3 standard classes → progressive rate band +
 *     a single 10% "3+ Classes" discount line. (Clean, no stacking ambiguity.)
 *   MODE=family     — 2 dancers, 1 class each → exactly ONE $50 family discount.
 *     NOTE: the live "Multi-Child Family Discount" (category multi_person) is
 *     known to double-dip (per-dancer + built-in). This mode asserts the intended
 *     $50-once and will FAIL until that discount is recategorized to "family".
 *
 * Read-only against the DB except cleanup of the seat_holds this run creates.
 * Targets the priced published "Spring 2026" = bba3a0a5… (override SEM=<uuid>).
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
const ageMonths = (b) => {
  const d = new Date(b);
  return (NOW.getFullYear() - d.getFullYear()) * 12 + (NOW.getMonth() - d.getMonth());
};
const money = (s) => {
  const c = String(s).replace(/[^0-9.\-−]/g, "").replace("−", "-");
  return c === "" || c === "-" ? null : parseFloat(c);
};
const round2 = (n) => Math.round(n * 100) / 100;
const DIV_LABEL = { early_childhood: "Early Childhood", junior: "Junior", senior: "Senior", competition: "Competition" };
function classifySpecialProgramKey(c) {
  if (c.is_competition_track) return c.division === "senior" ? "competition_senior" : "competition_junior";
  if (c.discipline === "technique") return "technique";
  if (c.discipline === "pre_pointe") return "pre_pointe";
  if (c.discipline === "pointe") return "pointe";
  if (c.division === "early_childhood") return "early_childhood";
  return null;
}

module.exports = {
  name: "pricing-discounts-spring-2026",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const SEM = process.env.SEM || "bba3a0a5-36a5-48a8-9398-a9cbe2ce4c44";
    const MODE = (process.env.MODE || "multiclass").toLowerCase();
    page.on("dialog", (d) => d.accept().catch(() => {}));

    const results = [];
    const assert = (ok, msg) => { results.push({ ok, msg }); ctx.note(`${ok ? "✅" : "❌"} ${msg}`); };
    const heldSections = [];

    function summarize() {
      const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
      ctx.note(`\n══ ${MODE.toUpperCase()} PARITY: ${pass}/${results.length} passed, ${fail} failed ══`);
      ctx.note(fail === 0 ? "✅ PASS — discount transferred accurately and was maintained to Payment."
        : "❌ FAIL — see ❌ lines (for MODE=family a fail likely = the known Multi-Child double-dip).");
    }
    async function cleanup(admin) {
      for (const sid of heldSections) {
        const { error } = await sb.from("seat_holds").delete().eq("section_id", sid).eq("user_id", admin.id);
        if (error) ctx.note(`cleanup err ${sid}: ${error.message}`);
      }
      ctx.note(`cleaned up ${heldSections.length} seat_hold section(s).`);
    }

    /* ── Admin config ──────────────────────────────────────────────────── */
    const { data: sem } = await sb.from("semesters").select("name,status").eq("id", SEM).maybeSingle();
    ctx.note(`Semester "${sem?.name}" status=${sem?.status} | MODE=${MODE}`);
    const { data: fcRow } = await sb.from("semester_fee_config").select("*").eq("semester_id", SEM).maybeSingle();
    const fc = {
      reg: Number(fcRow?.registration_fee_per_child ?? 40),
      family: Number(fcRow?.family_discount_amount ?? 50),
      seniorVideo: Number(fcRow?.senior_video_fee_per_registrant ?? 15),
      seniorCostume: Number(fcRow?.senior_costume_fee_per_class ?? 65),
      juniorCostume: Number(fcRow?.junior_costume_fee_per_class ?? 55),
      exemptKeys: fcRow?.costume_fee_exempt_keys ?? ["technique", "pointe", "competition"],
    };
    const { data: bandRows } = await sb.from("tuition_rate_bands").select("division,weekly_class_count,base_tuition").eq("semester_id", SEM);
    const band = (d, n) => (bandRows ?? []).find((b) => b.division === d && b.weekly_class_count === n);

    const { data: admin } = await sb.from("users").select("id, family_id").eq("email", env.NEXT_PUBLIC_DEV_ADMIN_EMAIL).maybeSingle();
    const { data: dancers } = await sb.from("dancers").select("id, first_name, last_name, gender, birth_date").eq("family_id", admin.family_id);
    const { data: classes } = await sb.from("classes")
      .select("id, name, division, discipline, is_competition_track, registration_fee_exempt, min_age, max_age, min_age_months, max_age_months, class_sections(id, capacity, is_drop_in, gender_restriction, days_of_week)")
      .eq("semester_id", SEM).eq("is_active", true).eq("visibility", "public").eq("is_tiered", false);

    const eligible = (cls, sec, d) => {
      const am = ageMonths(d.birth_date);
      const lo = cls.min_age_months ?? (cls.min_age != null ? cls.min_age * 12 : null);
      const hi = cls.max_age_months ?? (cls.max_age != null ? cls.max_age * 12 : null);
      if (lo != null && am < lo) return false;
      if (hi != null && am > hi) return false;
      const g = (sec.gender_restriction ?? "").toLowerCase();
      if (!["", "any", "all", "none", "no_restriction"].includes(g) && g !== d.gender) return false;
      return true;
    };
    async function openSingleSection(cls) {
      const secs = (cls.class_sections ?? []).filter((s) => !s.is_drop_in);
      if (secs.length !== 1) return null;
      const sec = secs[0];
      if (((sec.days_of_week ?? []).length || 1) !== 1 || !sec.capacity) return null;
      const { count } = await sb.from("section_enrollments").select("id", { count: "exact", head: true }).eq("section_id", sec.id).neq("status", "cancelled");
      if ((count ?? 0) >= sec.capacity) return null;
      return sec;
    }

    /* ── Build the per-mode plan: [{cls, sec, dancer}] + intended expected ── */
    const plan = [];
    const expected = []; // {kind,label,amount}
    let intendedTotal = 0;

    if (MODE === "multiclass") {
      const dancer = dancers.find((d) => d.first_name === "Sophia") ?? dancers[0];
      const juniors = [];
      for (const c of classes ?? []) {
        if (c.division !== "junior" || classifySpecialProgramKey(c)) continue;
        if (!eligible(c, (c.class_sections ?? [])[0] ?? {}, dancer)) continue;
        const sec = await openSingleSection(c);
        if (sec) juniors.push({ cls: c, sec, dancer });
        if (juniors.length === 3) break;
      }
      if (juniors.length < 3) { assert(false, `Need 3 eligible junior classes for ${dancer.first_name}; found ${juniors.length}.`); summarize(); return; }
      plan.push(...juniors);
      const n = 3;
      const rb = band("junior", n);
      if (!rb) { assert(false, `No junior/${n}x rate band configured.`); summarize(); return; }
      const base = round2(Number(rb.base_tuition));
      const costume = round2(fc.juniorCostume * n);
      const pct = round2((base + costume) * 0.10);
      expected.push({ kind: "tuition", label: `Tuition (Junior, ${n}x/week)`, amount: base });
      expected.push({ kind: "costume", label: `Recital Costume Fee (${n} classes)`, amount: costume });
      expected.push({ kind: "discount", label: "Discount: 3+ Classes Enrollment Discount", amount: -pct });
      expected.push({ kind: "reg", label: "Registration Fee", amount: fc.reg });
      intendedTotal = round2(base + costume - pct + fc.reg);
    } else if (MODE === "family") {
      const sophia = dancers.find((d) => d.first_name === "Sophia");
      const wade = dancers.find((d) => d.first_name === "Wade");
      // Sophia → a junior standard class; Wade → an early-childhood class.
      let sophiaPick = null, wadePick = null;
      for (const c of classes ?? []) {
        const sk = classifySpecialProgramKey(c);
        const sec = await openSingleSection(c);
        if (!sec) continue;
        if (!sophiaPick && c.division === "junior" && !sk && eligible(c, sec, sophia)) sophiaPick = { cls: c, sec, dancer: sophia };
        else if (!wadePick && sk === "early_childhood" && eligible(c, sec, wade)) wadePick = { cls: c, sec, dancer: wade };
      }
      if (!sophiaPick || !wadePick) { assert(false, `Family mode needs a junior class for Sophia + an EC class for Wade (got sophia=${!!sophiaPick}, wade=${!!wadePick}).`); summarize(); return; }
      plan.push(sophiaPick, wadePick);
      // Sophia (junior 1x): base + costume + reg
      const sb1 = round2(Number(band("junior", 1).base_tuition));
      const sCost = round2(fc.juniorCostume * 1);
      const sophiaSub = round2(sb1 + sCost + fc.reg);
      // Wade (EC special program): tuition-only total + reg
      const { data: ec } = await sb.from("special_program_tuition").select("semester_total, registration_fee_override").eq("semester_id", SEM).eq("program_key", "early_childhood").maybeSingle();
      const ecTuition = round2(Number(ec.semester_total));
      const ecReg = ec.registration_fee_override != null ? Number(ec.registration_fee_override) : fc.reg;
      const wadeSub = round2(ecTuition + ecReg);
      // INTENDED: exactly ONE $50 family discount (NO per-dancer multi-child line).
      intendedTotal = round2(sophiaSub + wadeSub - fc.family);
      expected.push({ kind: "family", label: "Family Discount", amount: -fc.family });
      ctx.note(`INTENDED per-dancer: ${sophia.first_name} $${sophiaSub.toFixed(2)} + ${wade.first_name} $${wadeSub.toFixed(2)} − family $${fc.family} = $${intendedTotal.toFixed(2)}`);
    } else { assert(false, `Unknown MODE="${MODE}" (use multiclass|family).`); summarize(); return; }

    ctx.note(`Plan: ${plan.map((p) => `${p.cls.name}→${p.dancer.first_name}`).join(", ")}`);
    ctx.note("EXPECTED (intended business rule):");
    for (const e of expected) ctx.note(`   ${e.label} = ${e.amount < 0 ? "-" : ""}$${Math.abs(e.amount).toFixed(2)}`);
    ctx.note(`   → intended Total Due = $${intendedTotal.toFixed(2)}`);
    for (const p of plan) heldSections.push(p.sec.id);

    const pad = (n) => String(n).padStart(2, "0");
    let shotIdx = 1;
    try {
      /* ── Add each class to cart ──────────────────────────────────────── */
      await ctx.goto(`/semester/${SEM}`);
      await page.locator(".sem-class-card-top").first().waitFor({ timeout: 15000 }).catch(() => {});
      await ctx.sleep(900);
      await ctx.shot(`${pad(shotIdx++)}-semester-page`);
      for (const p of plan) {
        const card = page.locator(".sem-class-card", { has: page.locator(".sem-class-card-top", { hasText: p.cls.name }) }).first();
        await card.locator(".sem-class-card-top").click().catch(() => {});
        await ctx.sleep(800);
        const atc = card.locator("button.sem-atc", { hasText: /Add to Cart/i }).first();
        await atc.scrollIntoViewIfNeeded().catch(() => {});
        await atc.click().catch(() => {});
        await ctx.sleep(1600);
        ctx.note(`added "${p.cls.name}" to cart.`);
        await card.locator(".sem-class-card-top").click().catch(() => {}); // collapse
        await ctx.sleep(400);
      }
      await ctx.shot(`${pad(shotIdx++)}-added`);

      await ctx.goto(`/cart`);
      await ctx.sleep(1300);
      await ctx.shot(`${pad(shotIdx++)}-cart`);
      const cont = page.getByRole("link", { name: /Checkout|Continue|Register|Proceed/i })
        .or(page.getByRole("button", { name: /Checkout|Continue|Register|Proceed/i })).first();
      if (await cont.count()) await cont.click().catch(() => {});
      else await ctx.goto(`/register?semester=${SEM}`);
      await ctx.sleep(2000);

      async function fillCurrentStep() {
        for (const sel of ['input[type="text"]:visible', 'input[type="email"]:visible', "textarea:visible"]) {
          const els = page.locator(sel);
          for (let k = 0; k < (await els.count()); k++) { const el = els.nth(k); if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("N/A").catch(() => {}); }
        }
        const tels = page.locator('input[type="tel"]:visible, input[type="number"]:visible');
        for (let k = 0; k < (await tels.count()); k++) { const el = tels.nth(k); if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("5555555555").catch(() => {}); }
        const dates = page.locator('input[type="date"]:visible');
        for (let k = 0; k < (await dates.count()); k++) { const el = dates.nth(k); if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("2016-04-12").catch(() => {}); }
        const sels = page.locator("select:visible");
        for (let k = 0; k < (await sels.count()); k++) { const el = sels.nth(k); if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.selectOption({ index: 1 }).catch(() => {}); }
        const chk = page.locator('input[type="checkbox"]:visible');
        for (let k = 0; k < (await chk.count()); k++) await chk.nth(k).check().catch(() => {});
        await ctx.sleep(400);
      }
      async function assignDancers() {
        for (const p of plan) {
          const section = page.locator(".reg-class-section", { has: page.locator(".reg-class-section-title", { hasText: p.cls.name }) }).first();
          const dancerCard = section.locator(".dancer-card", { hasText: p.dancer.first_name }).first();
          await dancerCard.waitFor({ timeout: 6000 }).catch(() => {});
          const cls = await dancerCard.getAttribute("class").catch(() => "");
          if (!(cls || "").includes("selected")) await dancerCard.click().catch(() => {});
          ctx.note(`assigned ${p.dancer.first_name} → ${p.cls.name}.`);
          await ctx.sleep(400);
        }
      }

      for (let i = 0; i < 8 && !page.url().includes("/register/payment"); i++) {
        await ctx.shot(`${pad(shotIdx++)}-register-${page.url().split("/register/")[1]?.split("?")[0] || "step"}`);
        if (page.url().includes("/participants")) await assignDancers();
        await fillCurrentStep();
        const next = page.getByRole("button", { name: /Continue|Next|Review|Proceed/i }).first();
        if (!(await next.count())) break;
        if (await next.isDisabled().catch(() => true)) { ctx.note(`Next disabled at ${page.url()} — stopping.`); break; }
        const before = page.url();
        await next.click().catch(() => {});
        await ctx.sleep(1800);
        if (page.url() === before && !before.includes("/register/payment")) { await fillCurrentStep(); await next.click().catch(() => {}); await ctx.sleep(1800); }
      }

      if (!page.url().includes("/register/payment")) {
        await ctx.shot(`${pad(shotIdx++)}-stopped`);
        assert(false, `Did not reach Payment (stuck at ${page.url()}).`);
        summarize(); await cleanup(admin); return;
      }
      await page.getByText("Total Due", { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
      await ctx.sleep(1200);
      await ctx.shot(`${pad(shotIdx++)}-payment-step`);

      /* ── Scrape + assert ─────────────────────────────────────────────── */
      const scraped = await page.evaluate(() => {
        const out = { lines: [], totalDue: null };
        document.querySelectorAll("div").forEach((d) => {
          if (d.children.length === 2) {
            const a = d.children[0], b = d.children[1];
            if (a.tagName === "SPAN" && b.classList.contains("tabular-nums")) out.lines.push({ label: a.textContent.trim(), amount: b.textContent.trim() });
          }
        });
        const td = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "Total Due");
        if (td) { const banner = td.closest("div.flex"); if (banner) { const big = [...banner.querySelectorAll("div.tabular-nums")].pop(); if (big) out.totalDue = big.textContent.trim(); } }
        // Family discount banner ("$50 off when 2+ dancers") renders outside the row pattern.
        const fam = [...document.querySelectorAll("*")].find((e) => /Family Discount applied/i.test(e.textContent || "") && e.children.length < 6);
        out.familyBanner = fam ? true : false;
        return out;
      });
      ctx.note("SCRAPED line items (user side):");
      for (const l of scraped.lines) ctx.note(`   ${l.label} = ${l.amount}`);
      ctx.note(`   Total Due (scraped) = ${scraped.totalDue ?? "—"}`);

      const findByText = (re) => scraped.lines.find((l) => re.test(l.label));
      if (MODE === "multiclass") {
        for (const e of expected) {
          let got;
          if (e.kind === "tuition") got = findByText(/tuition.*\d+x\/week/i) || findByText(/tuition/i);
          else if (e.kind === "costume") got = findByText(/costume/i);
          else if (e.kind === "discount") got = findByText(/3\+\s*classes|enrollment discount/i);
          else if (e.kind === "reg") got = findByText(/registration fee/i);
          if (!got) { assert(false, `Missing "${e.label}" (expected ${e.amount < 0 ? "-" : ""}$${Math.abs(e.amount).toFixed(2)}).`); continue; }
          const amt = money(got.amount);
          assert(amt != null && Math.abs(Math.abs(amt) - Math.abs(e.amount)) < 0.01, `${e.kind}: "${got.label}" = ${got.amount} (expected ${e.amount < 0 ? "-" : ""}$${Math.abs(e.amount).toFixed(2)})`);
        }
        const gt = money(scraped.totalDue);
        assert(gt != null && Math.abs(gt - intendedTotal) < 0.01, `Total Due ${scraped.totalDue} (expected $${intendedTotal.toFixed(2)})`);
      } else {
        // FAMILY: assert exactly ONE $50 family discount and NO per-dancer multi-child line.
        const famLine = findByText(/family discount/i);
        const famVal = famLine ? Math.abs(money(famLine.amount)) : (scraped.familyBanner ? fc.family : null);
        assert(famVal != null && Math.abs(famVal - fc.family) < 0.01, `Family Discount present = $${famVal ?? "MISSING"} (expected $${fc.family}).`);
        const multiChild = scraped.lines.filter((l) => /multi-?child|multi person/i.test(l.label));
        assert(multiChild.length === 0, multiChild.length === 0
          ? "No per-dancer 'Multi-Child' discount lines (no double-dip)."
          : `DOUBLE-DIP: per-dancer line(s) ${multiChild.map((m) => `${m.label}=${m.amount}`).join(", ")} stack on top of the family discount.`);
        const gt = money(scraped.totalDue);
        assert(gt != null && Math.abs(gt - intendedTotal) < 0.01, `Total Due ${scraped.totalDue} (intended $${intendedTotal.toFixed(2)})${gt != null && gt < intendedTotal ? ` — undercharged by $${(intendedTotal - gt).toFixed(2)}` : ""}`);
      }
      summarize();
      await cleanup(admin);
    } catch (e) {
      assert(false, `harness error: ${e.message}`);
      summarize();
      await cleanup(admin);
    }
  },
};
