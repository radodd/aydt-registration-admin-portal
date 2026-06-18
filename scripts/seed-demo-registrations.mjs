/**
 * scripts/seed-demo-registrations.mjs   ⚠️ TEMPORARY DEMO DATA
 *
 * Inserts a small batch of tagged, fake "active" (confirmed) registrations into a
 * few Spring 2026 sample classes so they show up in the admin portal's Classes
 * roster (getClassRegistrants → section_enrollments path).
 *
 * Safe + re-runnable: deterministic IDs (upsert), capacity-aware (never overfills),
 * and fully reversible with:
 *     node scripts/teardown-demo-registrations.mjs
 *
 * Run:  node scripts/seed-demo-registrations.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  SEMESTER_ID, FAMILY_ID, ORDER_ID, FAMILY_NAME, PAYMENT_REF,
  DANCERS, TARGET_SECTIONS, enrollmentId, PRICE_SNAPSHOT,
} from "./_demo-registrations.config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`▶ Seeding DEMO registrations into ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
const die = (msg, e) => { console.error(`✗ ${msg}`, e ?? ""); process.exit(1); };

// 1. Fake family
{
  const { error } = await sb.from("families").upsert({ id: FAMILY_ID, family_name: FAMILY_NAME }, { onConflict: "id" });
  if (error) die("families upsert failed", error);
  console.log(`  ✓ family: ${FAMILY_NAME}`);
}

// 2. Fake dancers (no user_id → no auth user required)
{
  const rows = DANCERS.map((d) => ({ ...d, family_id: FAMILY_ID }));
  const { error } = await sb.from("dancers").upsert(rows, { onConflict: "id" });
  if (error) die("dancers upsert failed", error);
  console.log(`  ✓ dancers: ${rows.length}`);
}

// 3. Fake confirmed order (parent_id null — nullable; roster shows dancer, parent "—")
{
  const { error } = await sb.from("registration_orders").upsert({
    id: ORDER_ID,
    parent_id: null,
    family_id: FAMILY_ID,
    semester_id: SEMESTER_ID,
    status: "confirmed",
    confirmed_at: "2026-06-18T00:00:00+00:00",
    payment_plan_type: "pay_in_full",
    payment_reference_id: PAYMENT_REF,
    cart_snapshot: [],
    form_data: {},
  }, { onConflict: "id" });
  if (error) die("registration_orders upsert failed", error);
  console.log(`  ✓ order: ${PAYMENT_REF}`);
}

// 4. Section enrollments — capacity-aware
let total = 0;
for (let si = 0; si < TARGET_SECTIONS.length; si++) {
  const t = TARGET_SECTIONS[si];
  const { data: sec, error: secErr } = await sb
    .from("class_sections").select("capacity").eq("id", t.section_id).single();
  if (secErr) { console.warn(`  ! ${t.className}: section not found, skipping`, secErr.message); continue; }

  const { count: current } = await sb
    .from("section_enrollments").select("id", { count: "exact", head: true })
    .eq("section_id", t.section_id).neq("status", "cancelled");

  const cap = sec?.capacity ?? null;
  const remaining = cap == null ? Infinity : cap - (current ?? 0);
  const wanted = t.dancerIdx.slice(0, Math.max(0, remaining === Infinity ? t.dancerIdx.length : remaining));
  if (wanted.length < t.dancerIdx.length) {
    console.warn(`  ! ${t.className}: capacity ${cap}, ${current} used → only ${wanted.length}/${t.dancerIdx.length} added`);
  }

  for (const di of wanted) {
    const d = DANCERS[di];
    const { error } = await sb.from("section_enrollments").upsert({
      id: enrollmentId(si, di),
      section_id: t.section_id,
      batch_id: ORDER_ID,
      dancer_id: d.id,
      price_snapshot: PRICE_SNAPSHOT,
      status: "confirmed",
    }, { onConflict: "id" });
    if (error) { console.warn(`  ! ${t.className} ← ${d.first_name}: ${error.message}`); continue; }
    total++;
  }
  console.log(`  ✓ ${t.className}: +${wanted.length} enrollments`);
}

console.log(`\n✅ Done. ${total} demo enrollments across ${TARGET_SECTIONS.length} classes.`);
console.log(`   Undo anytime:  node scripts/teardown-demo-registrations.mjs`);
