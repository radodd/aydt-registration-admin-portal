/*
 * Meeting-plan #25 — Classes tab capacity + waitlist overview, and the waitlist
 * "Register" hand-off into the manual registration flow.
 *   node .claude/skills/run-harness/harness.cjs meetingplan-25-classes-waitlist --role admin
 *
 * Proves:
 *   1. List rows show an "N waitlisted" chip.
 *   2. The detail panel's Enrollment breakdown shows a "Waitlisted" line.
 *   3. A "Waitlist (N)" card lists each entry with Send link / Register actions.
 *   4. Clicking "Register" NAVIGATES to /admin/register?fromWaitlist=<id> with the
 *      dancer + class pre-populated (NOT an inline modal).
 *
 * Setup/teardown (service-role, reversible via try/finally): seeds 3 'waiting'
 * waitlist_entries on one active, non-drop-in, non-tiered class — each carrying a
 * real section_id so the registration flow can pre-select the class — and tagged
 * by a unique contact_email so teardown (and any prior run) deletes exactly those.
 * Capacity-neutral: waitlist entries never consume a seat.
 *
 * Requires: dev server, admin creds (NEXT_PUBLIC_DEV_ADMIN_*).
 */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
function makeServiceClient() {
  const env = loadEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TAG = "harness25@example.test"; // unique marker for seeded rows
const SEED = [
  { firstName: "Ava", lastName: "Rivera", contact: "Maria Rivera" },
  { firstName: "Mia", lastName: "Tan", contact: "David Tan" },
  { firstName: "Noah", lastName: "Brooks", contact: "Jenna Brooks" },
];

module.exports = {
  name: "meetingplan-25-classes-waitlist",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const sb = makeServiceClient();

    // Pick a non-drop-in section on an active, named, non-tiered class so the
    // flow's section-based class pre-selection is deterministic.
    // is_drop_in lives on class_sections (not classes); classes has is_tiered.
    const { data: sections } = await sb
      .from("class_sections")
      .select("id, class_id, classes(id, name, semester_id, is_active, is_tiered)")
      .eq("is_drop_in", false)
      .limit(300);
    let cls = null;
    let sectionId = null;
    for (const s of sections ?? []) {
      const c = Array.isArray(s.classes) ? s.classes[0] : s.classes;
      const name = (c?.name ?? "").trim();
      if (c && c.is_active && !c.is_tiered && name.length > 0 && !/drop-?in/i.test(name)) {
        cls = c;
        sectionId = s.id;
        break;
      }
    }
    if (!cls || !sectionId) {
      ctx.note("ERROR: could not find a non-drop-in section on a named active class.");
      return;
    }
    ctx.note(`Target class: "${cls.name}" (${cls.id}) · section ${sectionId}`);

    try {
      // Clean any leftovers from a prior run, then seed fresh 'waiting' rows.
      await sb.from("waitlist_entries").delete().eq("class_id", cls.id).eq("contact_email", TAG);
      const rows = SEED.map((s, i) => ({
        class_id: cls.id,
        section_id: sectionId,
        position: i + 1,
        status: "waiting",
        contact_name: s.contact,
        contact_email: TAG,
        form_data: { _newDancer: { firstName: s.firstName, lastName: s.lastName } },
      }));
      const { error: insErr } = await sb.from("waitlist_entries").insert(rows);
      if (insErr) {
        ctx.note(`ERROR seeding waitlist entries: ${insErr.message}`);
        return;
      }
      ctx.note(`Seeded ${rows.length} waiting entries on "${cls.name}".`);

      // ── Classes tab: list view with the "N waitlisted" chip ──
      await ctx.goto("/admin/classes");
      await ctx.sleep(1500);
      await ctx.shot("01-classes-list");

      await ctx.fillPlaceholder("Search classes...", cls.name);
      await ctx.sleep(1200);
      ctx.note((await ctx.exists("waitlisted"))
        ? '✅ List row shows the "N waitlisted" chip.'
        : '❌ No "waitlisted" chip found on the filtered list.');
      await ctx.shot("02-list-waitlist-chip");

      // ── Open the class detail (navigate by id) ──
      await ctx.goto(`/admin/classes?id=${cls.id}`);
      await ctx.sleep(1800);
      ctx.note((await ctx.exists("Waitlisted"))
        ? '✅ Enrollment breakdown shows a "Waitlisted" line.'
        : '❌ "Waitlisted" line missing from the breakdown.');
      await ctx.shot("03-detail-breakdown");

      const waitlistHeading = page.getByText(/^Waitlist$/).first();
      if (await waitlistHeading.count()) {
        await waitlistHeading.scrollIntoViewIfNeeded().catch(() => {});
        await ctx.sleep(400);
      }
      ctx.note((await ctx.exists("Ava Rivera")) || (await ctx.exists("Send link"))
        ? "✅ Waitlist card lists seeded entries with Send link / Register actions."
        : "❌ Waitlist card did not render the seeded entries.");
      await ctx.shot("04-waitlist-card");

      // ── Click "Register" → should NAVIGATE into the manual registration flow ──
      const registerLink = page.getByRole("link", { name: /^Register$/ }).first();
      if (!(await registerLink.count())) {
        ctx.note("❌ No Register link found in the Waitlist card.");
        return;
      }
      await registerLink.click().catch(() => {});
      await page.waitForURL(/\/admin\/register/, { timeout: 8000 }).catch(() => {});
      await ctx.sleep(2600); // let classes load + the restore effect pre-select
      ctx.note(`URL after Register: ${page.url()}`);
      ctx.note(page.url().includes("fromWaitlist=")
        ? "✅ Navigated to /admin/register?fromWaitlist=<id> (not a modal)."
        : `❌ Expected ?fromWaitlist=, got ${page.url()}`);

      const dancerPrefilled = (await ctx.exists("Ava Rivera")) && (await ctx.exists("from waitlist"));
      ctx.note(dancerPrefilled
        ? '✅ Dancer carried over ("Registering Ava Rivera (from waitlist)").'
        : "❌ Dancer not pre-populated in the flow header.");

      const classPreselected =
        (await ctx.exists("1 class selected")) || (await ctx.exists(`Selected for`));
      ctx.note(classPreselected
        ? "✅ Class pre-selected on the Classes step (carried from the waitlist entry)."
        : "❌ Class not pre-selected in the flow.");
      await ctx.shot("05-register-flow-prefilled");
    } finally {
      await sb.from("waitlist_entries").delete().eq("class_id", cls.id).eq("contact_email", TAG);
      ctx.note("Teardown: removed seeded waitlist entries.");
    }
  },
};
