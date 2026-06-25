/**
 * One-off cleanup: remove ORPHAN families — rows with no users AND no dancers.
 *
 * These were created by the old createFamily() action, which inserted the
 * `families` row first and then threw on the `users` insert (null id), leaving
 * a nameless/parentless family behind on every failed attempt.
 *
 * Safety:
 *  - "Orphan" = a family with ZERO users and ZERO dancers. Real families always
 *    have at least the primary parent (a user), so they are never matched.
 *  - Dry-run by default (lists candidates only). Pass --delete to remove them.
 *
 * Run:  node scripts/cleanup-orphan-families.mjs            (dry run / preview)
 *       node scripts/cleanup-orphan-families.mjs --delete   (actually delete)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const DELETE = process.argv.includes("--delete");
const db = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const [{ data: families, error: famErr }, { data: users, error: userErr }, { data: dancers, error: dancerErr }] =
    await Promise.all([
      db.from("families").select("id, family_name, created_at"),
      db.from("users").select("family_id"),
      db.from("dancers").select("family_id"),
    ]);

  if (famErr) throw new Error(`families: ${famErr.message}`);
  if (userErr) throw new Error(`users: ${userErr.message}`);
  if (dancerErr) throw new Error(`dancers: ${dancerErr.message}`);

  const claimed = new Set();
  for (const u of users ?? []) if (u.family_id) claimed.add(u.family_id);
  for (const d of dancers ?? []) if (d.family_id) claimed.add(d.family_id);

  const orphans = (families ?? []).filter((f) => !claimed.has(f.id));

  console.log(`\nScanned ${families?.length ?? 0} families · ${claimed.size} have a user or dancer.`);
  console.log(`Found ${orphans.length} orphan${orphans.length === 1 ? "" : "s"} (no users, no dancers):\n`);

  if (orphans.length === 0) {
    console.log("Nothing to clean up. ✅\n");
    return;
  }

  for (const o of orphans) {
    console.log(`  • ${o.id}  ${JSON.stringify(o.family_name)}  (created ${o.created_at})`);
  }

  if (!DELETE) {
    console.log(`\nDry run — nothing deleted. Re-run with --delete to remove these ${orphans.length}.\n`);
    return;
  }

  const ids = orphans.map((o) => o.id);
  const { error: delErr } = await db.from("families").delete().in("id", ids);
  if (delErr) throw new Error(`delete: ${delErr.message}`);

  console.log(`\nDeleted ${ids.length} orphan famil${ids.length === 1 ? "y" : "ies"}. ✅\n`);
}

main().catch((e) => {
  console.error("\nCleanup failed:", e.message, "\n");
  process.exit(1);
});
