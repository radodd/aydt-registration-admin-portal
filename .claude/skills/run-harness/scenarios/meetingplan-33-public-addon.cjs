/*
 * Meeting-plan #33 (public) — optional add-on opt-in on the USER-FACING checkout.
 *   node .claude/skills/run-harness/harness.cjs meetingplan-33-public-addon
 *
 * Drives the family-facing flow into a Summer 2026 camp (which has the OPTIONAL
 * "Early Drop Off" add-on authored in the create-semester Add-ons tab) → cart →
 * register wizard → Payment step, and proves:
 *   (a) the optional add-on is OFF by default (not in Total Due) and rendered as
 *       an opt-in checkbox — and ONLY because it was authored on the semester;
 *   (b) opting in re-quotes and adds $20 to Total Due.
 * Stops before the EPG redirect (no real charge). Cleans up the seat_hold.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const NOW = new Date("2026-06-10T00:00:00Z");
const ageMonths = (b) => {
  const d = new Date(b);
  return (NOW.getFullYear() - d.getFullYear()) * 12 + (NOW.getMonth() - d.getMonth());
};

async function readTotalDue(page) {
  const row = page.locator("text=Total Due").first().locator("xpath=ancestor::div[2]");
  const txt = await row.innerText().catch(() => "");
  const m = txt.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d{2})?)/g);
  if (!m) return null;
  return parseFloat(m[m.length - 1].replace(/[^0-9.]/g, ""));
}

module.exports = {
  name: "meetingplan-33-public-addon",
  role: "admin", // logs in as the dev admin family (has dancers); drives the public flow
  async run(ctx) {
    const { page } = ctx;
    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const SEM = process.env.SEM || "9e635f72-1f47-40fd-a4b3-f47a1d1081f2"; // Summer 2026 camps

    page.on("dialog", (d) => d.accept().catch(() => {}));

    const { data: admin } = await sb
      .from("users").select("id, family_id").eq("email", env.NEXT_PUBLIC_DEV_ADMIN_EMAIL).maybeSingle();
    const { data: dancers } = await sb
      .from("dancers").select("id, first_name, birth_date").eq("family_id", admin.family_id);

    // Pick a public camp with the Early Drop Off add-on, open capacity, eligible dancer.
    const { data: classes } = await sb
      .from("classes")
      .select("id, name, display_name, min_age, max_age, is_tiered, tuition_override_amount, visibility, class_sections(id, capacity)")
      .eq("semester_id", SEM).eq("is_active", true).eq("visibility", "public");

    function eligible(cls) {
      const lo = cls.min_age != null ? cls.min_age * 12 : null;
      const hi = cls.max_age != null ? cls.max_age * 12 : null;
      for (const d of dancers ?? []) {
        const am = ageMonths(d.birth_date);
        if (lo != null && am < lo) continue;
        if (hi != null && am > hi + 11) continue; // allow up to the max year
        return d;
      }
      return null;
    }

    // The camp must actually PRICE, or the Payment step shows "Pricing
    // unavailable" and the add-on picker never renders. The engine's order is
    // special-program > tiered > class override > rate band; rate-band-only
    // camps with no band configured (e.g. "Week 2: Moana" in Summer 2026) fail.
    async function priceable(c) {
      if (c.is_tiered) {
        const { data: tiers } = await sb.from("class_tiers").select("price_cents").eq("class_id", c.id);
        if (tiers?.some((t) => (t.price_cents ?? 0) > 0)) return true;
      }
      if (c.tuition_override_amount != null) return true;
      const { data: spt } = await sb.from("special_program_tuition").select("semester_total").eq("class_id", c.id).limit(1);
      return !!spt?.length;
    }

    let target = null;
    for (const c of classes ?? []) {
      const sec = (c.class_sections ?? [])[0];
      if (!sec || !sec.capacity) continue; // need a real capacity (open-cap camps)
      const m = await sb.from("class_meetings").select("id").eq("section_id", sec.id).limit(1);
      const mid = m.data?.[0]?.id;
      if (!mid) continue;
      const opts = await sb.from("class_meeting_options")
        .select("name, is_required").eq("class_meeting_id", mid).eq("is_required", false);
      if (!opts.data?.length) continue; // must have an OPTIONAL add-on
      if (!(await priceable(c))) continue; // must actually price (else no quote → no picker)
      const d = eligible(c);
      if (!d) continue;
      const { count } = await sb.from("section_enrollments")
        .select("id", { count: "exact", head: true }).eq("section_id", sec.id).neq("status", "cancelled");
      if ((count ?? 0) >= sec.capacity) continue;
      target = { cls: c, sec, dancer: d };
      break;
    }
    if (!target) return ctx.note("❌ No public camp with an optional add-on + eligible dancer + open capacity.");
    const campName = (target.cls.display_name || target.cls.name || "").replace(/\s+/g, " ").trim();
    ctx.note(`Target camp: "${campName}" → dancer ${target.dancer.first_name}`);

    try {
      // ── Semester page → add the camp to cart ───────────────────────────────
      await ctx.goto(`/semester/${SEM}`);
      await page.locator(".sem-class-card-top").first().waitFor({ timeout: 15000 }).catch(() => {});
      await ctx.sleep(900);
      await ctx.shot("01-semester-page");

      const headers = page.locator(".sem-class-card-top");
      const key = campName.split(":").pop().trim().split(" ")[0]; // e.g. "Sonic"
      let opened = false;
      for (let i = 0; i < (await headers.count()); i++) {
        const txt = (await headers.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ");
        if (txt.includes(key)) {
          await headers.nth(i).scrollIntoViewIfNeeded().catch(() => {});
          await headers.nth(i).click().catch(() => {});
          opened = true;
          break;
        }
      }
      ctx.note(opened ? `Opened camp card (matched "${key}").` : `⚠ Could not find camp card for "${key}".`);
      await ctx.sleep(1100);
      await ctx.shot("02-camp-card-expanded");

      // Tiered camps render a "Register · <tier>" CTA in the expanded card's
      // BookingFooter (default tier auto-selected); standard classes use
      // "Add to Cart". Match either.
      const atc = page
        .getByRole("button", { name: /^Register ·|Add to Cart|^Update to ·/i })
        .first();
      await atc.scrollIntoViewIfNeeded().catch(() => {});
      await atc.click().catch(() => {});
      await ctx.sleep(1800);
      await ctx.shot("03-added-to-cart");

      // ── Cart → register wizard ─────────────────────────────────────────────
      await ctx.goto(`/cart`);
      await ctx.sleep(1300);
      await ctx.shot("04-cart");
      const cont = page.getByRole("link", { name: /Checkout|Continue|Register|Proceed/i })
        .or(page.getByRole("button", { name: /Checkout|Continue|Register|Proceed/i })).first();
      if (await cont.count()) await cont.click().catch(() => {});
      else await ctx.goto(`/register?semester=${SEM}`);
      await ctx.sleep(2000);

      async function fillStep() {
        const txt = page.locator('input[type="text"]:visible, input[type="email"]:visible, textarea:visible');
        for (let k = 0; k < (await txt.count()); k++) {
          const el = txt.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("N/A").catch(() => {});
        }
        const tel = page.locator('input[type="tel"]:visible, input[type="number"]:visible');
        for (let k = 0; k < (await tel.count()); k++) {
          const el = tel.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("5555555555").catch(() => {});
        }
        const dt = page.locator('input[type="date"]:visible');
        for (let k = 0; k < (await dt.count()); k++) {
          const el = dt.nth(k);
          if (!((await el.inputValue().catch(() => "")) || "").trim()) await el.fill("2018-04-12").catch(() => {});
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

      // Redesigned 6-step wizard inserts a "Reg. Info" step between Dancer Info
      // and Payment, so allow more iterations. Select the dancer by clicking the
      // NAME (the click bubbles to the card handler); clicking a broad card <div>
      // or the "Eligible" badge alone lands on dead space and selects nothing.
      async function pickDancer() {
        const nameEl = page.getByText(new RegExp(`^${target.dancer.first_name}\\b`)).first();
        if (await nameEl.count()) {
          await nameEl.scrollIntoViewIfNeeded().catch(() => {});
          await nameEl.click().catch(() => {});
          await ctx.sleep(800);
          if (await page.getByText(/1 dancer (assigned|selected)/i).count().catch(() => 0)) return;
        }
        const elig = page.getByText("Eligible", { exact: true }).first();
        if (await elig.count()) { await elig.click().catch(() => {}); await ctx.sleep(800); }
      }

      let shot = 5;
      for (let i = 0; i < 10 && !page.url().includes("/register/payment"); i++) {
        await ctx.shot(`${String(shot++).padStart(2, "0")}-${page.url().split("/register/")[1]?.split("?")[0] || "step"}`);
        if (page.url().includes("/participants")) await pickDancer();
        await fillStep();
        const next = page.getByRole("button", { name: /Continue|Next|Review|Proceed/i }).first();
        if (!(await next.count())) break;
        if (await next.isDisabled().catch(() => true)) { ctx.note(`Next disabled at ${page.url()}.`); break; }
        const before = page.url();
        await next.click().catch(() => {});
        await ctx.sleep(1800);
        if (page.url() === before && !before.includes("/register/payment")) {
          await fillStep();
          await next.click().catch(() => {});
          await ctx.sleep(1800);
        }
      }

      ctx.note(`reached ${page.url()}`);
      if (!page.url().includes("/register/payment")) {
        await ctx.shot(`${String(shot++).padStart(2, "0")}-stopped`);
        return ctx.note("⚠ Did not reach Payment — see screenshots.");
      }

      // ── Payment: optional add-on OFF by default ────────────────────────────
      await page.getByText("Add-ons", { exact: false }).first().waitFor({ timeout: 8000 }).catch(() => {});
      await ctx.sleep(800);
      await ctx.shot(`${String(shot++).padStart(2, "0")}-payment-addon-off`);
      const before = await readTotalDue(page);
      ctx.note(`Total Due (add-on OFF): ${before}`);

      const row = page.locator("label").filter({ hasText: /Early Drop Off/ }).first();
      const cb = row.locator('input[type="checkbox"]');
      const wasChecked = await cb.isChecked().catch(() => null);
      ctx.note(`"Early Drop Off" checked by default: ${wasChecked} (expect false)`);

      // ── Opt in → Total Due +$20 ────────────────────────────────────────────
      await cb.check().catch(() => {});
      await ctx.sleep(1800); // re-quote round-trip
      await ctx.shot(`${String(shot++).padStart(2, "0")}-payment-addon-on`);
      const after = await readTotalDue(page);
      ctx.note(`Total Due (add-on ON): ${after}`);
      if (before != null && after != null) {
        ctx.note(`#33 PUBLIC RESULT — opting in changed Total Due by $${Math.round((after - before) * 100) / 100} (expect +20).`);
      }
    } finally {
      const { error } = await sb.from("seat_holds").delete()
        .eq("section_id", target.sec.id).eq("user_id", admin.id);
      ctx.note(error ? `cleanup err: ${error.message}` : "cleaned up seat_holds for this run.");
    }
  },
};
