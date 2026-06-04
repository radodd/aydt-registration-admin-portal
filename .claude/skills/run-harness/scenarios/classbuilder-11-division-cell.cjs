/*
 * Item #11 — Stale division artifact in the class-builder list table.
 *   node .claude/skills/run-harness/harness.cjs classbuilder-11-division-cell --role admin
 *
 * Verifies the SessionsStep ("Classes & schedules", ?step=sessions) class-list
 * table: the Division cell must be blanked (em-dash) for tiered/drop-in rows —
 * even when a legacy division value (e.g. "junior") still lingers in the DB —
 * while standard rows continue to show their division label.
 *
 * Strategy: drive two draft semesters discovered from the DB:
 *   A) one that contains a TIERED and/or DROP-IN class (both expected to show
 *      "—" in the Division column despite a legacy division in data), and
 *   B) one that is all STANDARD classes (expected to still show labels).
 *
 * Read-only: only drives the client-side editor; never clicks Save.
 * Requires NEXT_PUBLIC_DEV_ADMIN_* and SUPABASE_SERVICE_ROLE_KEY in .env.local.
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

function makeServiceClient() {
  const env = loadEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Classify a class row from the DB into its registration mode.
function classifyClass(c) {
  const dropIn = (c.class_sections ?? []).some((s) => s.is_drop_in === true);
  const tiered = c.is_tiered === true;
  return { name: c.name, division: c.division, tiered, dropIn };
}

async function discoverSemesters(supabase) {
  const { data: rows, error } = await supabase
    .from("semesters")
    .select(
      "id, name, status, classes(id, name, division, is_tiered, class_sections(is_drop_in))",
    )
    .in("status", ["draft", "scheduled"])
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };

  const named = (r) =>
    (r.classes ?? [])
      .filter((c) => c.name && String(c.name).trim() !== "")
      .map(classifyClass);

  let nonStd = null; // semester with a tiered/drop-in class (prefer one with both)
  let std = null; // semester with standard classes that carry a division label
  let bestNonStdScore = -1;
  for (const r of rows ?? []) {
    const cls = named(r);
    if (!cls.length) continue;
    const tiered = cls.filter((c) => c.tiered).length;
    const dropIn = cls.filter((c) => c.dropIn).length;
    const score = (tiered > 0 ? 1 : 0) + (dropIn > 0 ? 1 : 0); // prefer rows that have BOTH modes
    if (score > bestNonStdScore) {
      bestNonStdScore = score;
      if (score > 0) nonStd = { ...r, classified: cls };
    }
    if (!std) {
      const stdWithLabel = cls.filter((c) => !c.tiered && !c.dropIn && c.division);
      if (stdWithLabel.length >= 2) std = { ...r, classified: cls };
    }
  }
  return { nonStd, std };
}

// Read the class-list table row-by-row: name, mode badge, and Division cell text.
async function readTable(page) {
  return page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];
    const out = [];
    for (const tr of table.querySelectorAll("tbody tr")) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) continue;
      const nameEl = tds[0].querySelector(".font-medium, span");
      const name = (nameEl?.textContent || tds[0].textContent || "").trim();
      // Mode pill lives in the first cell ("Standard" | "Tiered" | "Drop-in").
      const firstCellText = tds[0].textContent || "";
      let mode = "standard";
      if (/Drop-in/i.test(firstCellText)) mode = "drop-in";
      else if (/Tiered/i.test(firstCellText)) mode = "tiered";
      else if (/Competition/i.test(firstCellText)) mode = "competition";
      const division = (tds[1].textContent || "").trim();
      out.push({ name, mode, division });
    }
    return out;
  });
}

async function driveSemester(ctx, semester, label) {
  const { page } = ctx;
  await page
    .goto(`${ctx.BASE}/admin/semesters/${semester.id}/edit?step=sessions`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
    .catch((e) => ctx.note(`goto err (non-fatal): ${e.message}`));
  await ctx.sleep(3500);

  const onSessions =
    page.url().includes("step=sessions") &&
    (await page.getByText(/Classes & schedules|Add class/i).first().count()) > 0;
  ctx.note(`[${label}] "${semester.name}" (${semester.id}) — on sessions step: ${onSessions}`);
  if (!onSessions) {
    await ctx.shot(`${label}-not-on-step`);
    ctx.note(`[${label}] Aborting — not on the Classes step.`);
    return { pass: false };
  }

  await ctx.shot(`${label}-table`);

  const rows = await readTable(page);
  ctx.note(`[${label}] DB classes: ` +
    semester.classified.map((c) => `${c.name}{div=${c.division},tiered=${c.tiered},dropIn=${c.dropIn}}`).join("; "));
  ctx.note(`[${label}] Rendered rows (${rows.length}):`);
  let pass = true;
  for (const r of rows) {
    const isEmDash = r.division === "—" || r.division === "" || r.division === "-";
    let verdict = "ok";
    if (r.mode === "tiered" || r.mode === "drop-in") {
      if (!isEmDash) { verdict = "FAIL (expected blank/em-dash)"; pass = false; }
      else verdict = "PASS (blanked)";
    } else if (r.mode === "standard") {
      if (isEmDash) verdict = "note: standard row has no division label";
      else verdict = "PASS (label shown)";
    }
    ctx.note(`   - "${r.name}" | mode=${r.mode} | division="${r.division}" → ${verdict}`);
  }
  return { pass, rows };
}

module.exports = {
  name: "classbuilder-11-division-cell",
  role: "admin",
  async run(ctx) {
    const supabase = makeServiceClient();

    ctx.note("Discovering semesters (one with tiered/drop-in, one standard)…");
    const { nonStd, std, error } = await discoverSemesters(supabase);
    if (error) {
      ctx.note(`ERROR: semester discovery failed: ${error}`);
      return;
    }

    let overallPass = true;

    if (!nonStd) {
      ctx.note("No draft/scheduled semester with a tiered/drop-in class found — cannot verify the em-dash case.");
      overallPass = false;
    } else {
      const a = await driveSemester(ctx, nonStd, "A-nonstd");
      overallPass = overallPass && a.pass;
    }

    if (!std) {
      ctx.note("No all-standard semester with division labels found — skipping the contrast capture.");
    } else {
      const b = await driveSemester(ctx, std, "B-standard");
      overallPass = overallPass && b.pass;
    }

    ctx.note(
      overallPass
        ? "PASS: tiered/drop-in rows blank the Division cell; standard rows still show labels."
        : "FAIL: inspect the screenshots/notes — at least one row did not match expectations.",
    );
  },
};
