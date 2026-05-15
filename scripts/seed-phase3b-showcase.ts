/**
 * scripts/seed-phase3b-showcase.ts
 *
 * Additive (non-destructive) seed that creates ONE published semester with
 * three classes — one of each Phase 2 registration mode — so the family-facing
 * Phase 3b-i UI can be reviewed end-to-end.
 *
 *   1. Standard class           → "Ballet 1A" (junior, full-term)
 *   2. Tiered class             → "Summer Camp · Week 1" (junior, 3 class_tiers)
 *   3. Drop-in class            → "Saturday Open Class" (no division, 8 weeks)
 *
 * Idempotent — all rows use deterministic UUIDs and upsert on PK. Re-running
 * does not destroy anything outside of the rows this seed owns. The script
 * does NOT issue any DELETE / TRUNCATE / drop calls.
 *
 * Run:
 *   npx tsx scripts/seed-phase3b-showcase.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Deterministic IDs (re-runnable) ──────────────────────────────────────────
const ADMIN_ID = "64ebf65c-e32f-4e22-9440-e7bb5a0fee8d"; // Ethan Flores

const SEM_ID = "3b3b3b3b-0001-4000-8000-000000000001";

// Standard class (Ballet 1A)
const STD_CLASS_ID = "3b3b3b3b-0002-4000-8000-000000000001";
const STD_SCHED_ID = "3b3b3b3b-0002-4000-8000-000000000002";
const STD_TIER_ID = "3b3b3b3b-0002-4000-8000-000000000003"; // schedule_price_tier
const STD_SESS_ID = "3b3b3b3b-0002-4000-8000-000000000004";

// Tiered class (Summer Camp Week 1)
const TIER_CLASS_ID = "3b3b3b3b-0003-4000-8000-000000000001";
const TIER_SCHED_ID = "3b3b3b3b-0003-4000-8000-000000000002";
const TIER_TIER_FULL = "3b3b3b3b-0003-4000-8000-000000000003"; // class_tiers row
const TIER_TIER_AM = "3b3b3b3b-0003-4000-8000-000000000004";
const TIER_TIER_PM = "3b3b3b3b-0003-4000-8000-000000000005";
const TIER_PRICE_TIER = "3b3b3b3b-0003-4000-8000-000000000006"; // schedule_price_tier (placeholder)
const TIER_SESS_ID = "3b3b3b3b-0003-4000-8000-000000000007";

// Drop-in class (Saturday Open Class)
const DI_CLASS_ID = "3b3b3b3b-0004-4000-8000-000000000001";
const DI_SCHED_ID = "3b3b3b3b-0004-4000-8000-000000000002";
// 8 Saturday sessions
const DI_SESS_IDS = Array.from({ length: 8 }, (_, i) =>
  `3b3b3b3b-0004-4000-8000-${String(100 + i).padStart(12, "0")}`,
);

// ── Helpers ──────────────────────────────────────────────────────────────────
async function upsert<T extends Record<string, unknown>>(
  table: string,
  rows: T | T[],
  onConflict?: string,
): Promise<void> {
  const arr = Array.isArray(rows) ? rows : [rows];
  if (!arr.length) return;
  const { error } = await sb
    .from(table)
    .upsert(arr, onConflict ? { onConflict } : undefined);
  if (error) throw new Error(`[UPSERT ${table}] ${error.message}`);
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Phase 3b showcase seed — additive only, no destructive ops");

  // ─── 1. Semester ──────────────────────────────────────────────────────────
  await upsert("semesters", {
    id: SEM_ID,
    name: "Phase 3b Showcase (Fall 2027)",
    description: "Seeded showcase semester for reviewing the new tiered + drop-in family UI.",
    status: "published",
    publish_at: new Date("2027-09-01").toISOString(),
    published_at: new Date("2027-09-01").toISOString(),
    created_by: ADMIN_ID,
    updated_by: ADMIN_ID,
    tracking_mode: false,
    capacity_warning_threshold: 3,
    registration_form: { elements: [] },
    confirmation_email: {
      subject: "You're registered for {{session_title}}!",
      senderName: "AYDT Studio",
      senderEmail: "no-reply@aydt.com",
      bodyHtml: "<p>Hi {{first_name}},</p><p>Thanks for registering!</p>",
    },
    waitlist_settings: {
      enabled: false,
      inviteExpiryHours: 48,
      stopDaysBeforeClose: 3,
    },
  });
  console.log(`  ✓ Semester [${SEM_ID}]`);

  // ─── 2. Fee config (minimal) ──────────────────────────────────────────────
  await upsert(
    "semester_fee_config",
    {
      semester_id: SEM_ID,
      registration_fee_per_child: 40.0,
      family_discount_amount: 50.0,
      auto_pay_admin_fee_monthly: 5.0,
      auto_pay_installment_count: 5,
      senior_video_fee_per_registrant: 15.0,
      senior_costume_fee_per_class: 65.0,
      junior_costume_fee_per_class: 55.0,
    },
    "semester_id",
  );
  console.log("  ✓ Fee config");

  // ─── 3. Tuition rate bands (so pricing engine doesn't throw if reached) ───
  await upsert(
    "tuition_rate_bands",
    [
      {
        semester_id: SEM_ID,
        division: "junior",
        weekly_class_count: 1,
        base_tuition: 775.0,
        progressive_discount_percent: 0,
        semester_total: 870.0,
        autopay_installment_amount: 179.0,
      },
      {
        semester_id: SEM_ID,
        division: "senior",
        weekly_class_count: 1,
        base_tuition: 796.0,
        progressive_discount_percent: 0,
        semester_total: 911.0,
        autopay_installment_amount: 185.0,
      },
    ],
    "semester_id,division,weekly_class_count",
  );
  console.log("  ✓ Tuition rate bands");

  // ─── 4. STANDARD class (Ballet 1A) ────────────────────────────────────────
  await upsert("classes", {
    id: STD_CLASS_ID,
    semester_id: SEM_ID,
    name: "Ballet 1A",
    discipline: "ballet",
    division: "junior",
    description: "Introductory ballet, full-term enrollment.",
    min_age: 6,
    max_age: 9,
    is_competition_track: false,
    is_tiered: false,
    requires_teacher_rec: false,
    visibility: "public",
    enrollment_type: "standard",
  });
  await upsert("class_schedules", {
    id: STD_SCHED_ID,
    class_id: STD_CLASS_ID,
    semester_id: SEM_ID,
    days_of_week: ["wednesday"],
    start_time: "16:00:00",
    end_time: "17:00:00",
    start_date: "2027-09-08",
    end_date: "2027-12-15",
    location: "Studio A",
    instructor_name: "Ms. Rivera",
    capacity: 14,
    gender_restriction: "no_restriction",
    pricing_model: "full_schedule",
    is_drop_in: false,
  });
  await upsert("schedule_price_tiers", {
    id: STD_TIER_ID,
    schedule_id: STD_SCHED_ID,
    label: "Regular",
    amount: 870.0,
    sort_order: 0,
    is_default: true,
  });
  await upsert("class_sessions", {
    id: STD_SESS_ID,
    class_id: STD_CLASS_ID,
    schedule_id: STD_SCHED_ID,
    semester_id: SEM_ID,
    day_of_week: "wednesday",
    start_time: "16:00:00",
    end_time: "17:00:00",
    start_date: "2027-09-08",
    end_date: "2027-12-15",
    location: "Studio A",
    instructor_name: "Ms. Rivera",
    capacity: 14,
  });
  console.log("  ✓ Standard class: Ballet 1A");

  // ─── 5. TIERED class (Summer Camp · Week 1) ───────────────────────────────
  await upsert("classes", {
    id: TIER_CLASS_ID,
    semester_id: SEM_ID,
    name: "Summer Camp · Week 1",
    discipline: "contemporary",
    division: "junior",
    description: "Full-week dance camp with full-day or half-day options.",
    min_age: 7,
    max_age: 12,
    is_competition_track: false,
    is_tiered: true,
    requires_teacher_rec: false,
    visibility: "public",
    enrollment_type: "standard",
  });
  await upsert("class_schedules", {
    id: TIER_SCHED_ID,
    class_id: TIER_CLASS_ID,
    semester_id: SEM_ID,
    days_of_week: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    start_time: "09:00:00",
    end_time: "15:00:00",
    start_date: "2027-07-12",
    end_date: "2027-07-16",
    location: "Studio B",
    instructor_name: "Mr. Chen",
    capacity: 30,
    gender_restriction: "no_restriction",
    pricing_model: "full_schedule",
    is_drop_in: false,
  });
  // schedule_price_tier placeholder so legacy pricing reads don't break
  await upsert("schedule_price_tiers", {
    id: TIER_PRICE_TIER,
    schedule_id: TIER_SCHED_ID,
    label: "Regular",
    amount: 450.0,
    sort_order: 0,
    is_default: true,
  });
  // Phase 2 per-class tiers (the actual choice families see)
  await upsert("class_tiers", [
    {
      id: TIER_TIER_FULL,
      class_id: TIER_CLASS_ID,
      label: "Full day",
      start_time: "09:00:00",
      end_time: "15:00:00",
      price_cents: 45000,
      sort_order: 0,
      is_default: true,
    },
    {
      id: TIER_TIER_AM,
      class_id: TIER_CLASS_ID,
      label: "Half day · AM",
      start_time: "09:00:00",
      end_time: "12:00:00",
      price_cents: 26500,
      sort_order: 1,
      is_default: false,
    },
    {
      id: TIER_TIER_PM,
      class_id: TIER_CLASS_ID,
      label: "Half day · PM",
      start_time: "12:00:00",
      end_time: "15:00:00",
      price_cents: 26500,
      sort_order: 2,
      is_default: false,
    },
  ]);
  await upsert("class_sessions", {
    id: TIER_SESS_ID,
    class_id: TIER_CLASS_ID,
    schedule_id: TIER_SCHED_ID,
    semester_id: SEM_ID,
    day_of_week: "monday",
    start_time: "09:00:00",
    end_time: "15:00:00",
    start_date: "2027-07-12",
    end_date: "2027-07-16",
    location: "Studio B",
    instructor_name: "Mr. Chen",
    capacity: 30,
  });
  console.log("  ✓ Tiered class: Summer Camp · Week 1 (3 tiers)");

  // ─── 6. DROP-IN class (Saturday Open Class) ───────────────────────────────
  await upsert("classes", {
    id: DI_CLASS_ID,
    semester_id: SEM_ID,
    name: "Saturday Open Class",
    discipline: "contemporary",
    division: null, // drop-in classes don't require a division (Phase 2)
    description: "Open-level drop-in class, book any Saturday.",
    min_age: 13,
    max_age: null,
    is_competition_track: false,
    is_tiered: false,
    requires_teacher_rec: false,
    visibility: "public",
    enrollment_type: "standard",
  });
  await upsert("class_schedules", {
    id: DI_SCHED_ID,
    class_id: DI_CLASS_ID,
    semester_id: SEM_ID,
    days_of_week: ["saturday"],
    start_time: "10:00:00",
    end_time: "11:30:00",
    start_date: "2027-10-02",
    end_date: "2027-11-20",
    location: "Studio C",
    instructor_name: "Ms. Patel",
    capacity: 22,
    gender_restriction: "no_restriction",
    pricing_model: "per_session",
    is_drop_in: true,
  });
  // 8 consecutive Saturdays — each is its own class_sessions row with schedule_date.
  const SAT_DATES: string[] = [
    isoDate(2027, 10, 2),
    isoDate(2027, 10, 9),
    isoDate(2027, 10, 16),
    isoDate(2027, 10, 23),
    isoDate(2027, 10, 30),
    isoDate(2027, 11, 6),
    isoDate(2027, 11, 13),
    isoDate(2027, 11, 20),
  ];
  await upsert(
    "class_sessions",
    SAT_DATES.map((date, i) => ({
      id: DI_SESS_IDS[i]!,
      class_id: DI_CLASS_ID,
      schedule_id: DI_SCHED_ID,
      semester_id: SEM_ID,
      day_of_week: "saturday",
      start_time: "10:00:00",
      end_time: "11:30:00",
      start_date: "2027-10-02",
      end_date: "2027-11-20",
      schedule_date: date,
      location: "Studio C",
      instructor_name: "Ms. Patel",
      capacity: 22,
      drop_in_price: 28.0,
    })),
  );
  console.log(`  ✓ Drop-in class: Saturday Open Class (${SAT_DATES.length} dates)`);

  console.log("\n✅ Done.");
  console.log(`   Visit:  /semester/${SEM_ID}`);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
