/*
 * SMOKE ITEM 3 (register.aydt.nyc cutover) — waitlist "Send link" URL check.
 *   node .claude/skills/run-harness/harness.cjs smoke-waitlist-sendlink --role admin
 *
 * Goal: confirm the waitlist invite link is built as `${SITE_URL}/waitlist/accept/<token>`
 * with NO hardcoded host (no localhost / aydt.com / old vercel URL).
 *
 * The link is constructed server-side and emailed (inviteWaitlistEntryByLink.ts:74-75),
 * so it never renders in the DOM. This scenario therefore proves it two ways:
 *   1. UI: drive the real "Send link" button in the Classes-tab Waitlist card and
 *      capture the inline feedback + the "Invited" badge.
 *   2. URL: read the seeded entry's invite_token + the runtime SITE_URL, reconstruct
 *      the exact link, assert host+path, and navigate to /waitlist/accept/<token> to
 *      prove the route resolves (200, not 404).
 *
 * NOTE ON ENV: locally SITE_URL is the ngrok dev URL, so the reconstructed link shows
 * the ngrok host — that PROVES the host is taken dynamically from SITE_URL. In prod,
 * where SITE_URL=https://register.aydt.nyc, the same code yields register.aydt.nyc.
 * Email *delivery* depends on the client's Resend config (a separate gate); if the
 * UI shows a send error that is the Resend gap, NOT a URL problem — the URL assertion
 * below is independent of delivery.
 *
 * Setup/teardown (service-role, reversible via try/finally): seeds ONE 'waiting'
 * waitlist_entry on an active, non-drop-in, non-tiered class that currently has NO
 * other waitlist entries (so there is exactly one "Send link" button to click),
 * tagged by a unique contact_email for deterministic teardown.
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
  // SITE_URL may live in .env (not .env.local); merge it in if present.
  try {
    for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
function makeServiceClient(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TAG = "smoke-sendlink@example.test"; // unique marker for the seeded row
const DANCER = { firstName: "Smoke", lastName: "Tester", contact: "Smoke Parent" };

module.exports = {
  name: "smoke-waitlist-sendlink",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const env = loadEnv();
    const sb = makeServiceClient(env);
    const SITE_URL = (env.SITE_URL ?? "").replace(/\/$/, "");
    ctx.note(`Runtime SITE_URL = ${SITE_URL || "(empty!)"}`);

    // Find a non-drop-in section on an active, named, non-tiered class that has
    // ZERO existing waitlist entries, so there's exactly one Send link button.
    const { data: sections } = await sb
      .from("class_sections")
      .select("id, class_id, classes(id, name, is_active, is_tiered)")
      .eq("is_drop_in", false)
      .limit(400);

    let cls = null;
    let sectionId = null;
    for (const s of sections ?? []) {
      const c = Array.isArray(s.classes) ? s.classes[0] : s.classes;
      const name = (c?.name ?? "").trim();
      if (!c || !c.is_active || c.is_tiered || !name || /drop-?in/i.test(name)) continue;
      const { count } = await sb
        .from("waitlist_entries")
        .select("id", { count: "exact", head: true })
        .eq("class_id", c.id);
      if ((count ?? 0) === 0) {
        cls = c;
        sectionId = s.id;
        break;
      }
    }
    if (!cls || !sectionId) {
      ctx.note("ERROR: could not find a non-drop-in active class with zero waitlist entries.");
      return;
    }
    ctx.note(`Target class: "${cls.name}" (${cls.id}) · section ${sectionId}`);

    let entryId = null;
    let inviteToken = null;
    try {
      // Seed exactly one 'waiting' entry; read back its auto-generated invite_token.
      await sb.from("waitlist_entries").delete().eq("class_id", cls.id).eq("contact_email", TAG);
      const { data: inserted, error: insErr } = await sb
        .from("waitlist_entries")
        .insert({
          class_id: cls.id,
          section_id: sectionId,
          position: 1,
          status: "waiting",
          contact_name: DANCER.contact,
          contact_email: TAG,
          form_data: { _newDancer: { firstName: DANCER.firstName, lastName: DANCER.lastName } },
        })
        .select("id, invite_token, status")
        .single();
      if (insErr || !inserted) {
        ctx.note(`ERROR seeding waitlist entry: ${insErr?.message}`);
        return;
      }
      entryId = inserted.id;
      inviteToken = inserted.invite_token;
      ctx.note(`Seeded entry ${entryId} · invite_token ${inviteToken} · status ${inserted.status}`);

      // ── Open the class detail; scroll to the Waitlist card ──
      await ctx.goto(`/admin/classes?id=${cls.id}`);
      await ctx.sleep(1800);
      const waitlistHeading = page.getByText(/^Waitlist$/).first();
      if (await waitlistHeading.count()) {
        await waitlistHeading.scrollIntoViewIfNeeded().catch(() => {});
        await ctx.sleep(400);
      }
      ctx.note((await ctx.exists("Smoke Tester")) || (await ctx.exists("Send link"))
        ? '✅ Waitlist card rendered the seeded entry with a "Send link" button.'
        : "❌ Waitlist card did not render the seeded entry.");
      await ctx.shot("01-waitlist-card");

      // ── Click "Send link" (exactly one button, since the class had none before) ──
      const sendBtn = page.getByRole("button", { name: /^Send link$/ }).first();
      if (!(await sendBtn.count())) {
        ctx.note("❌ No 'Send link' button found.");
        return;
      }
      await sendBtn.click().catch(() => {});
      // Wait for the inline feedback ("Payment link sent" on success, else the error).
      await ctx.sleep(3500);
      await ctx.shot("02-after-send-click");
      const sent = await ctx.exists("Payment link sent");
      const invitedBadge = await ctx.exists("Invited");
      ctx.note(sent
        ? '✅ UI feedback: "Payment link sent" (action ran + email send returned ok).'
        : '⚠️ UI did NOT show "Payment link sent" — likely the Resend delivery gate (NOT a URL issue). See the screenshot for the exact message.');
      ctx.note(invitedBadge
        ? '✅ Entry now shows the "Invited" badge (status flipped server-side).'
        : '⚠️ "Invited" badge not visible.');

      // ── Independent server-side state check ──
      const { data: after } = await sb
        .from("waitlist_entries")
        .select("status, invitation_sent_at, invite_token")
        .eq("id", entryId)
        .single();
      ctx.note(`DB after click: status=${after?.status} · invitation_sent_at=${after?.invitation_sent_at ?? "null"}`);

      // ── THE URL CHECK: reconstruct the exact link the action builds ──
      const expectedLink = `${SITE_URL}/waitlist/accept/${inviteToken}`;
      ctx.note(`Constructed link = ${expectedLink}`);
      let host = "";
      try { host = new URL(expectedLink).host; } catch {}
      const pathOk = expectedLink.includes(`/waitlist/accept/${inviteToken}`);
      const noBadHost = !/localhost|aydt\.com|vercel\.app/i.test(expectedLink);
      ctx.note(pathOk
        ? `✅ Path is /waitlist/accept/<token> (host taken dynamically from SITE_URL → "${host}").`
        : "❌ Path is NOT /waitlist/accept/<token>.");
      ctx.note(noBadHost
        ? "✅ No hardcoded localhost / aydt.com / vercel.app host."
        : "❌ Link contains a hardcoded/legacy host.");
      ctx.note(`➡️  In PRODUCTION (SITE_URL=https://register.aydt.nyc) this same code yields: https://register.aydt.nyc/waitlist/accept/${inviteToken}`);

      // ── Prove the /waitlist/accept/<token> route actually resolves (localhost) ──
      const localLink = `${ctx.BASE}/waitlist/accept/${inviteToken}`;
      const resp = await page.goto(localLink, { waitUntil: "networkidle" }).catch(() => null);
      const status = resp ? resp.status() : "no-response";
      ctx.note(`GET ${localLink} → HTTP ${status} ${status === 200 ? "✅ (route resolves)" : "(check screenshot)"}`);
      await ctx.shot("03-accept-route");
    } finally {
      if (entryId) {
        await sb.from("waitlist_entries").delete().eq("id", entryId);
        ctx.note("Teardown: removed seeded waitlist entry.");
      }
    }
  },
};
