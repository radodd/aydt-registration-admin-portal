/**
 * scripts/seed-test-semester.ts
 *
 * Additive (non-destructive) seed script that inserts a single published test
 * semester into the DB, ready for end-to-end testing of the user-facing
 * /register flow.
 *
 * Re-runnable: all rows use deterministic UUIDs and upsert/delete+re-insert,
 * so running this twice is safe.
 *
 * Run: npx tsx scripts/seed-test-semester.ts
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
const SEM_ID     = "00000000-test-0000-0000-semester000001";
const CLASS_BALLET_ID   = "00000000-test-0000-0000-classballet01";
const CLASS_CONTEMP_ID  = "00000000-test-0000-0000-classcontemp1";
const SCHED_BALLET_ID   = "00000000-test-0000-0000-schedballet01";
const SCHED_CONTEMP_ID  = "00000000-test-0000-0000-schedcontemp1";
const SESSION_BALLET_ID  = "00000000-test-0000-0000-sessnballet01";
const SESSION_CONTEMP_ID = "00000000-test-0000-0000-sessncontemp1";
const COUPON_ID  = "00000000-test-0000-0000-coupondevt001";
const ADMIN_ID   = "64ebf65c-e32f-4e22-9440-e7bb5a0fee8d"; // Ethan Flores

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

async function del(table: string, col: string, val: string): Promise<void> {
  const { error } = await sb.from(table).delete().eq(col, val);
  if (error) console.warn(`  ⚠ clearing ${table}: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seeding test semester…");

  // 1. Semester
  await upsert("semesters", {
    id: SEM_ID,
    name: "Dev Test Semester (Spring 2027)",
    description: "Automatically seeded test semester for development testing.",
    status: "published",
    publish_at: new Date("2027-01-01").toISOString(),
    published_at: new Date("2027-01-01").toISOString(),
    created_by: ADMIN_ID,
    updated_by: ADMIN_ID,
    tracking_mode: false,
    capacity_warning_threshold: 3,
    registration_form: { elements: [] },
    confirmation_email: {
      subject: "You're registered for {{session_title}}!",
      senderName: "AYDT Studio",
      senderEmail: "no-reply@aydt.com",
      bodyHtml:
        "<p>Hi {{first_name}},</p><p>Thank you for registering! We look forward to seeing you in class.</p>",
    },
    waitlist_settings: {
      enabled: false,
      inviteExpiryHours: 48,
      stopDaysBeforeClose: 3,
    },
  });
  console.log(`  ✓ Semester: Dev Test Semester (Spring 2027) [id: ${SEM_ID}]`);

  // 2. Fee config
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

  // 3. Tuition rate bands (delete + re-insert for idempotency)
  await del("tuition_rate_bands", "semester_id", SEM_ID);
  await upsert("tuition_rate_bands", [
    {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 1,
      base_tuition: 775.93,
      progressive_discount_percent: 0,
      semester_total: 870.93,
      autopay_installment_amount: 179.19,
    },
    {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 2,
      base_tuition: 1250.0,
      progressive_discount_percent: 0,
      semester_total: 1395.0,
      autopay_installment_amount: 284.0,
    },
    {
      semester_id: SEM_ID,
      division: "senior",
      weekly_class_count: 1,
      base_tuition: 796.43,
      progressive_discount_percent: 0,
      semester_total: 911.43,
      autopay_installment_amount: 185.29,
    },
    {
      semester_id: SEM_ID,
      division: "senior",
      weekly_class_count: 2,
      base_tuition: 1275.0,
      progressive_discount_percent: 0,
      semester_total: 1420.0,
      autopay_installment_amount: 289.0,
    },
  ]);
  console.log("  ✓ Tuition rate bands (4 rows)");

  // 4. Classes
  await upsert("classes", [
    {
      id: CLASS_BALLET_ID,
      semester_id: SEM_ID,
      name: "Ballet 1A",
      discipline: "ballet",
      division: "junior",
      description: "Introductory ballet for junior dancers.",
      min_age: 6,
      max_age: 9,
      is_competition_track: false,
      requires_teacher_rec: false,
      visibility: "public",
      enrollment_type: "standard",
    },
    {
      id: CLASS_CONTEMP_ID,
      semester_id: SEM_ID,
      name: "Contemporary 1",
      discipline: "contemporary",
      division: "senior",
      description: "Beginning contemporary for senior dancers.",
      min_age: 12,
      max_age: 17,
      is_competition_track: false,
      requires_teacher_rec: false,
      visibility: "public",
      enrollment_type: "standard",
    },
  ]);
  console.log("  ✓ Classes (2)");

  // 5. Class schedules
  await upsert("class_schedules", [
    {
      id: SCHED_BALLET_ID,
      class_id: CLASS_BALLET_ID,
      semester_id: SEM_ID,
      days_of_week: ["wednesday"],
      start_time: "16:00:00",
      end_time: "17:00:00",
      start_date: "2027-01-08",
      end_date: "2027-05-21",
      location: "Studio A",
      instructor_name: "Ms. Rivera",
      capacity: 14,
      gender_restriction: "no_restriction",
      pricing_model: "full_schedule",
    },
    {
      id: SCHED_CONTEMP_ID,
      class_id: CLASS_CONTEMP_ID,
      semester_id: SEM_ID,
      days_of_week: ["monday"],
      start_time: "17:30:00",
      end_time: "18:30:00",
      start_date: "2027-01-06",
      end_date: "2027-05-19",
      location: "Studio B",
      instructor_name: "Mr. Chen",
      capacity: 12,
      gender_restriction: "no_restriction",
      pricing_model: "full_schedule",
    },
  ]);
  console.log("  ✓ Class schedules (2)");

  // 6. Class sessions (one per schedule — one day per week representative session)
  await upsert("class_sessions", [
    {
      id: SESSION_BALLET_ID,
      class_id: CLASS_BALLET_ID,
      schedule_id: SCHED_BALLET_ID,
      semester_id: SEM_ID,
      day_of_week: "wednesday",
      start_time: "16:00:00",
      end_time: "17:00:00",
      start_date: "2027-01-08",
      end_date: "2027-05-21",
      location: "Studio A",
      instructor_name: "Ms. Rivera",
      capacity: 14,
      cloned_from_session_id: null,
      registration_close_at: null,
    },
    {
      id: SESSION_CONTEMP_ID,
      class_id: CLASS_CONTEMP_ID,
      schedule_id: SCHED_CONTEMP_ID,
      semester_id: SEM_ID,
      day_of_week: "monday",
      start_time: "17:30:00",
      end_time: "18:30:00",
      start_date: "2027-01-06",
      end_date: "2027-05-19",
      location: "Studio B",
      instructor_name: "Mr. Chen",
      capacity: 12,
      cloned_from_session_id: null,
      registration_close_at: null,
    },
  ]);
  console.log("  ✓ Class sessions (2)");

  // 7. Promo coupon
  await upsert(
    "discount_coupons",
    {
      id: COUPON_ID,
      name: "Dev Test 10% Off",
      code: "DEVTEST10",
      value: 10,
      value_type: "percent",
      valid_from: null,
      valid_until: null,
      max_total_uses: null,
      uses_count: 0,
      max_per_family: 99,
      stackable: true,
      eligible_sessions_mode: "all",
      is_active: true,
    },
    "id",
  );
  console.log("  ✓ Coupon: DEVTEST10");

  // 8. Link coupon to semester
  await upsert(
    "semester_coupons",
    { semester_id: SEM_ID, coupon_id: COUPON_ID },
    "semester_id,coupon_id",
  );
  console.log("  ✓ Coupon linked to semester");

  console.log(
    "\nDone. Visit /register to test the registration flow with this semester.",
  );
  console.log(`  Coupon code for checkout: DEVTEST10 (10% off)`);
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
