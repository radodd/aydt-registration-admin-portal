/*
 * QA-only seed helper for meeting-plan #5 (waitlist). Makes ONE class in a
 * published semester "full + waitlist-enabled" so the public Join Waitlist CTA
 * renders and the flow can be walked by the harness.
 *
 *   node .claude/skills/run-harness/seed-waitlist-fixture.cjs [semesterId]
 *
 * Reversible: it records the original capacity in its output so you can restore.
 * Dev DB only — uses the service-role key from .env.local.
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

(async () => {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const semesterId = process.argv[2] || "bddd7361-090c-42c4-90d7-c921b9c60c0c";

  const { data: classes, error } = await supabase
    .from("classes")
    .select(
      `id, name, is_active, visibility, waitlist_enabled,
       class_meetings ( id, section_id, capacity,
         class_sections ( id, pricing_model, capacity ) )`,
    )
    .eq("semester_id", semesterId)
    .eq("is_active", true);

  if (error) {
    console.error("query failed:", error.message);
    process.exit(1);
  }

  // Prefer a public, full_schedule (standard) class with a section.
  const candidates = (classes ?? []).filter(
    (c) =>
      (c.visibility === "public" || c.visibility == null) &&
      (c.class_meetings ?? []).some((m) => m.section_id),
  );
  const target = candidates[0];
  if (!target) {
    console.error("No suitable public class with a section found in semester", semesterId);
    process.exit(1);
  }

  const meeting = (target.class_meetings ?? []).find((m) => m.section_id);
  const section = Array.isArray(meeting.class_sections)
    ? meeting.class_sections[0]
    : meeting.class_sections;
  const isPerSession = section?.pricing_model === "per_session";

  console.log(`Target class: "${target.name}" (${target.id})`);
  console.log(`  section ${section?.id} pricing_model=${section?.pricing_model}`);
  console.log(`  ORIGINAL section.capacity=${section?.capacity} meeting.capacity=${meeting.capacity}`);

  // 1. Enable waitlist on the class.
  const { error: e1 } = await supabase
    .from("classes")
    .update({ waitlist_enabled: true })
    .eq("id", target.id);
  if (e1) { console.error("enable waitlist failed:", e1.message); process.exit(1); }

  // 2. Make it full. capacity has CHECK(>0) so we set capacity=1 and add ONE
  //    confirmed enrollment (per_session uses meeting capacity + meeting_enrollments;
  //    full_schedule uses section capacity + section_enrollments).
  if (isPerSession) {
    const { error: e2 } = await supabase
      .from("class_meetings").update({ capacity: 1 }).eq("id", meeting.id);
    if (e2) { console.error("meeting capacity update failed:", e2.message); process.exit(1); }
  } else {
    const { error: e2 } = await supabase
      .from("class_sections").update({ capacity: 1 }).eq("id", section.id);
    if (e2) { console.error("section capacity update failed:", e2.message); process.exit(1); }
  }

  // Reuse an existing order (batch_id FK) + any dancer for the filler enrollment.
  const { data: order } = await supabase
    .from("registration_orders").select("id").limit(1).maybeSingle();
  const { data: dancer } = await supabase
    .from("dancers").select("id").limit(1).maybeSingle();
  if (!order || !dancer) {
    console.error("Need at least one existing registration_orders row and one dancer to fill capacity.");
    process.exit(1);
  }

  if (isPerSession) {
    const { error: e3 } = await supabase.from("meeting_enrollments").insert({
      dancer_id: dancer.id, meeting_id: meeting.id, status: "confirmed",
      total_amount: 0, registration_batch_id: order.id,
    });
    if (e3) console.error("filler meeting_enrollment insert:", e3.message);
  } else {
    const { error: e3 } = await supabase.from("section_enrollments").insert({
      section_id: section.id, batch_id: order.id, dancer_id: dancer.id,
      price_snapshot: 0, status: "confirmed",
    });
    if (e3) console.error("filler section_enrollment insert:", e3.message);
  }

  console.log("✅ Seeded: waitlist_enabled=true + capacity=1 + 1 filler enrollment (full).");
  console.log(`   Filler enrollment: dancer ${dancer.id} via order ${order.id}.`);
  console.log(`   To restore: set ${isPerSession ? "class_meetings" : "class_sections"} capacity back to ORIGINAL above, delete the filler enrollment, and set classes.waitlist_enabled=false on ${target.id}.`);
  console.log(`   Catalog: /semester/${semesterId}`);
})();
