/**
 * scripts/seed.ts
 *
 * Clears the AYDT database and re-seeds it with realistic fixture data.
 * Preserves the "Ethan Flores" admin account (ETHAN_ID) in the users table.
 *
 * Install dev deps:  npm i -D @faker-js/faker tsx
 * Run:               npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

// ── Supabase client (service role — bypasses RLS) ─────────────────────────────
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Constants ─────────────────────────────────────────────────────────────────
const ETHAN_ID   = "64ebf65c-e32f-4e22-9440-e7bb5a0fee8d";
const NEVER_UUID = "00000000-0000-0000-0000-000000000001"; // guaranteed absent
const TODAY      = new Date("2026-03-06");

faker.seed(42); // deterministic output

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();

async function ins<T extends Record<string, unknown>>(
  table: string,
  rows: T | T[],
): Promise<T[]> {
  const arr = Array.isArray(rows) ? rows : [rows];
  if (!arr.length) return [];
  const { data, error } = await sb.from(table).insert(arr).select();
  if (error) throw new Error(`[INSERT ${table}] ${error.message}`);
  return data as T[];
}

async function del(table: string, col = "id", neqVal = NEVER_UUID) {
  const { error } = await sb.from(table).delete().neq(col, neqVal);
  if (error) console.warn(`  ⚠ clearing ${table}: ${error.message}`);
}

/** All dates of a given weekday within [start, end], up to max occurrences. */
function weeklyDates(day: string, start: Date, end: Date, max = 14): Date[] {
  const idx: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const dates: Date[] = [];
  const cur = new Date(start);
  while (cur.getDay() !== idx[day]) cur.setDate(cur.getDate() + 1);
  while (cur <= end && dates.length < max) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

// ── Class templates (same 8 classes replicated across every semester) ─────────
const TEMPLATES = [
  {
    name: "Creative Movement",
    discipline: "creative_movement",
    division: "early_childhood",
    level: null,
    description:
      "An exploratory class that introduces toddlers to movement, rhythm, and imagination through storytelling and play.",
    min_age: 2, max_age: 5,
    day: "saturday", start_time: "10:00:00", end_time: "11:00:00",
    location: "Studio A", capacity: 10, tuition: 480.00,
  },
  {
    name: "Pre-Ballet",
    discipline: "ballet",
    division: "early_childhood",
    level: "Pre-1",
    description:
      "A gentle introduction to ballet fundamentals — positions, pliés, and simple combinations — for young beginners.",
    min_age: 4, max_age: 7,
    day: "saturday", start_time: "11:00:00", end_time: "12:00:00",
    location: "Studio A", capacity: 10, tuition: 480.00,
  },
  {
    name: "Ballet Foundations",
    discipline: "ballet",
    division: "junior",
    level: "Level 1",
    description:
      "Classical ballet technique for young dancers building a strong foundation in barre work, center combinations, and basic vocabulary.",
    min_age: 7, max_age: 12,
    day: "wednesday", start_time: "16:00:00", end_time: "17:30:00",
    location: "Studio B", capacity: 14, tuition: 560.00,
  },
  {
    name: "Tap Technique",
    discipline: "tap",
    division: "junior",
    level: "Intermediate",
    description:
      "Rhythmic tap training focusing on sound quality, timing, and musicality through structured combinations and improvisation.",
    min_age: 7, max_age: 14,
    day: "tuesday", start_time: "17:00:00", end_time: "18:00:00",
    location: "Studio C", capacity: 14, tuition: 560.00,
  },
  {
    name: "Jazz Performance",
    discipline: "jazz",
    division: "junior",
    level: "Intermediate",
    description:
      "High-energy jazz class covering kicks, turns, jumps, and performance choreography in popular jazz styles.",
    min_age: 8, max_age: 14,
    day: "thursday", start_time: "17:00:00", end_time: "18:00:00",
    location: "Studio B", capacity: 14, tuition: 560.00,
  },
  {
    name: "Hip Hop Crew",
    discipline: "hip_hop",
    division: "junior",
    level: "All Levels",
    description:
      "Street-style hip hop covering popping, locking, breaking, and freestyle expression. Drop-in friendly.",
    min_age: 8, max_age: 16,
    day: "wednesday", start_time: "18:00:00", end_time: "19:00:00",
    location: "Studio C", capacity: 16, tuition: 560.00,
  },
  {
    name: "Contemporary & Lyrical",
    discipline: "contemporary",
    division: "senior",
    level: "Advanced",
    description:
      "A fusion of modern, ballet, and lyrical styles exploring dynamic movement, floor work, and emotional expression.",
    min_age: 13, max_age: 18,
    day: "monday", start_time: "18:00:00", end_time: "19:30:00",
    location: "Studio B", capacity: 12, tuition: 640.00,
  },
  {
    name: "Musical Theatre Intensive",
    discipline: "musical_theatre",
    division: "senior",
    level: "Advanced",
    description:
      "An intensive course blending dance, vocal performance, and stage presence — preparing students for theatrical auditions and productions.",
    min_age: 10, max_age: 18,
    day: "friday", start_time: "17:00:00", end_time: "18:30:00",
    location: "Studio A", capacity: 12, tuition: 640.00,
  },
] as const;

// ── Semester configs ───────────────────────────────────────────────────────────
interface SemCfg {
  id: string;
  name: string;
  description: string;
  status: "draft" | "scheduled" | "published" | "archived";
  publish_at: string | null;
  published_at: string | null;
  startDate: Date;
  endDate: Date;
}

const SEMS: SemCfg[] = [
  // DRAFT ──────────────────────────────────────────────────────────────────────
  {
    id: uid(), name: "Summer 2026 Draft",
    description: "Upcoming summer intensive — classes and pricing under review.",
    status: "draft", publish_at: null, published_at: null,
    startDate: new Date("2026-06-15"), endDate: new Date("2026-08-08"),
  },
  {
    id: uid(), name: "Fall 2026 Draft",
    description: "New season planning. Schedule not yet finalized.",
    status: "draft", publish_at: null, published_at: null,
    startDate: new Date("2026-09-08"), endDate: new Date("2026-12-12"),
  },
  // SCHEDULED ──────────────────────────────────────────────────────────────────
  {
    id: uid(), name: "Summer 2026",
    description:
      "AYDT Summer Intensive — 8 weeks of focused technique, choreography, and performance workshops.",
    status: "scheduled",
    publish_at: new Date("2026-04-15").toISOString(), published_at: null,
    startDate: new Date("2026-06-15"), endDate: new Date("2026-08-08"),
  },
  {
    id: uid(), name: "Fall 2026",
    description:
      "The Fall 2026 season features expanded senior programming and new competition tracks.",
    status: "scheduled",
    publish_at: new Date("2026-07-15").toISOString(), published_at: null,
    startDate: new Date("2026-09-08"), endDate: new Date("2026-12-12"),
  },
  // PUBLISHED ──────────────────────────────────────────────────────────────────
  {
    id: uid(), name: "Spring 2026",
    description:
      "AYDT Spring 2026 — registration is open. Enroll your dancer today and join us for an amazing season of growth, artistry, and community.",
    status: "published",
    publish_at: new Date("2026-01-05").toISOString(),
    published_at: new Date("2026-01-05").toISOString(),
    startDate: new Date("2026-01-12"), endDate: new Date("2026-05-08"),
  },
  {
    id: uid(), name: "Fall 2025",
    description:
      "AYDT Fall 2025 season — currently ongoing. New enrollment is closed.",
    status: "published",
    publish_at: new Date("2025-08-01").toISOString(),
    published_at: new Date("2025-08-01").toISOString(),
    startDate: new Date("2025-09-08"), endDate: new Date("2025-12-13"),
  },
  // ARCHIVED ───────────────────────────────────────────────────────────────────
  {
    id: uid(), name: "Spring 2025",
    description: "Archived — AYDT Spring 2025 season.",
    status: "archived",
    publish_at: new Date("2025-01-03").toISOString(),
    published_at: new Date("2025-01-03").toISOString(),
    startDate: new Date("2025-01-13"), endDate: new Date("2025-05-09"),
  },
  {
    id: uid(), name: "Fall 2024",
    description: "Archived — AYDT Fall 2024 season.",
    status: "archived",
    publish_at: new Date("2024-07-30").toISOString(),
    published_at: new Date("2024-07-30").toISOString(),
    startDate: new Date("2024-09-09"), endDate: new Date("2024-12-14"),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1.  CLEAR
// ─────────────────────────────────────────────────────────────────────────────
async function clearDatabase() {
  console.log("🧹  Clearing database (preserving Ethan Flores)…");

  // Leaf → root order to respect FK constraints
  const tables: [string, string?][] = [
    ["email_deliveries"],
    ["email_recipients"],
    ["email_activity_logs"],
    ["email_recipient_selections"],
    ["registration_line_items"],
    ["schedule_enrollments"],
    ["batch_payment_installments"],
    ["payments"],
    ["registrations"],
    ["waitlist_entries"],
    ["registration_batches"],
    ["registration_days"],
    ["requirement_waivers"],
    ["class_requirements"],
    ["discount_rule_schedules"],
    ["discount_rule_sessions"],
    ["discount_rules"],
    ["semester_discounts", "semester_id"],
    ["discounts"],
    ["session_tags"],
    ["session_group_sessions"],
    ["session_group_tags"],
    ["session_groups"],
    ["class_session_price_rows"],
    ["class_session_options"],
    ["class_session_excluded_dates"],
    ["schedule_price_tiers"],
    ["class_schedule_excluded_dates"],
    ["class_sessions"],
    ["class_schedules"],
    ["classes"],
    ["semester_fee_config", "semester_id"],
    ["semester_payment_installments"],
    ["semester_payment_plans", "semester_id"],
    ["tuition_rate_bands"],
    ["semesters"],
    ["authorized_pickups"],
    ["dancers"],
    ["semester_audit_logs"],
    ["media_images"],
  ];

  for (const [table, col] of tables) await del(table, col ?? "id");

  // Users — preserve Ethan Flores
  const { error: uErr } = await sb.from("users").delete().neq("id", ETHAN_ID);
  if (uErr) console.warn(`  ⚠ clearing users: ${uErr.message}`);

  // Families — preserve Ethan's family if he has one
  const { data: ethan } = await sb
    .from("users").select("family_id").eq("id", ETHAN_ID).single();
  if (ethan?.family_id) {
    await sb.from("families").delete().neq("id", ethan.family_id as string);
  } else {
    await del("families");
  }

  // email_subscriptions — preserve Ethan's subscription
  await sb.from("email_subscriptions").delete().neq("user_id", ETHAN_ID);

  // email_subscribers — one-off external subscribers, no protected rows
  await del("email_subscribers");

  // email / template tables have no protected rows
  await del("emails");
  await del("email_templates");

  console.log("  ✓ Done\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  SECONDARY ADMIN
// ─────────────────────────────────────────────────────────────────────────────
async function seedAdmin(): Promise<string> {
  console.log("👤  Seeding secondary admin (Sarah Mitchell)…");
  const id = uid();
  await ins("users", {
    id,
    email: "sarah.mitchell@aydt.com",
    first_name: "Sarah",
    last_name: "Mitchell",
    phone_number: "(555) 100-2001",
    role: "admin",
    status: "active",
    display_name: "Ms. Sarah Mitchell",
    is_primary_parent: false,
    family_id: null,
    signature_html:
      "<p>Ms. Sarah Mitchell<br>AYDT Studio Director<br>sarah.mitchell@aydt.com</p>",
  });
  console.log("  ✓ Created: Sarah Mitchell (admin)\n");
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  FAMILIES, PARENT USERS, DANCERS
// ─────────────────────────────────────────────────────────────────────────────
interface FamilyRow  { id: string; family_name: string }
interface UserRow    { id: string; family_id: string; email: string; first_name: string; last_name: string }
interface DancerRow  { id: string; family_id: string; user_id: string; first_name: string; last_name: string; birth_date: string }

const LAST_NAMES = ["Anderson", "Thompson", "Martinez", "Nguyen", "Williams", "Patel"];

async function seedFamilies() {
  console.log("👨‍👩‍👧  Seeding 6 families (1 parent + 2 dancers each)…");

  const families: FamilyRow[] = LAST_NAMES.map((ln) => ({
    id: uid(),
    family_name: `${ln} Family`,
  }));
  await ins("families", families);

  const users: UserRow[] = [];
  const dancers: DancerRow[] = [];

  for (const fam of families) {
    const lastName = fam.family_name.replace(" Family", "");
    const parentId = uid();
    users.push({
      id: parentId,
      family_id: fam.id,
      email: faker.internet
        .email({ firstName: faker.person.firstName("female"), lastName })
        .toLowerCase(),
      first_name: faker.person.firstName("female"),
      last_name: lastName,
      phone_number: faker.phone.number("(555) ###-####"),
      role: "parent",
      status: "active",
      is_primary_parent: true,
    } as UserRow);

    // Two dancers per family: spread across age ranges for division variety
    const agePairs: [number, number][] = [
      [5, 11], [7, 13], [8, 14], [6, 12], [9, 15], [7, 10],
    ];
    const [age1, age2] = agePairs[families.indexOf(fam)]!;
    for (const age of [age1, age2]) {
      const birthYear  = 2026 - age;
      const birthMonth = String(faker.number.int({ min: 1, max: 12 })).padStart(2, "0");
      const birthDay   = String(faker.number.int({ min: 1, max: 28 })).padStart(2, "0");
      dancers.push({
        id: uid(),
        family_id: fam.id,
        user_id: parentId,
        first_name: faker.person.firstName("female"),
        last_name: lastName,
        gender: "female",
        birth_date: `${birthYear}-${birthMonth}-${birthDay}`,
        grade: String(Math.max(1, age - 5)),
        is_self: false,
      } as DancerRow);
    }
  }

  await ins("users", users);
  await ins("dancers", dancers);

  // Email subscriptions for all parents
  await ins(
    "email_subscriptions",
    users.map((u) => ({ user_id: u.id, is_subscribed: true })),
  );

  // Authorized pickup (one per family)
  await ins(
    "authorized_pickups",
    families.map((fam) => ({
      id: uid(),
      family_id: fam.id,
      first_name: faker.person.firstName(),
      last_name: fam.family_name.replace(" Family", ""),
      phone_number: faker.phone.number("(555) ###-####"),
      relation: faker.helpers.arrayElement(["Grandparent", "Aunt", "Uncle", "Sibling"]),
    })),
  );

  console.log(`  ✓ ${families.length} families, ${users.length} parents, ${dancers.length} dancers\n`);
  return { families, users, dancers };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  SEMESTERS + FEE CONFIG + TUITION BANDS + PAYMENT PLANS
// ─────────────────────────────────────────────────────────────────────────────
async function seedSemesters() {
  console.log("📅  Seeding 8 semesters (2× draft, scheduled, published, archived)…");

  await ins(
    "semesters",
    SEMS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      publish_at: s.publish_at,
      published_at: s.published_at,
      created_by: ETHAN_ID,
      updated_by: ETHAN_ID,
      tracking_mode: true,
      capacity_warning_threshold: 3,
      registration_form: { elements: [] },
      confirmation_email: {
        subject: `You're registered for ${s.name} at AYDT!`,
        senderName: "AYDT Studio",
        senderEmail: "no-reply@aydt.com",
        bodyHtml: `<h1>Welcome to ${s.name}!</h1><p>Thank you for enrolling. We're so excited to dance with you this season. Please review your schedule and feel free to reach out with any questions.</p><p>Warm regards,<br>The AYDT Team</p>`,
      },
      waitlist_settings: { enabled: true, inviteExpiryHours: 48, stopDaysBeforeClose: 3 },
    })),
  );

  // Semester fee config
  await ins(
    "semester_fee_config",
    SEMS.map((s) => ({
      semester_id: s.id,
      registration_fee_per_child: 40.00,
      family_discount_amount: 50.00,
      auto_pay_admin_fee_monthly: 5.00,
      auto_pay_installment_count: 5,
      senior_video_fee_per_registrant: 15.00,
      senior_costume_fee_per_class: 65.00,
    })),
  );

  // Tuition rate bands
  const bands: Record<string, unknown>[] = [];
  for (const s of SEMS) {
    bands.push(
      { id: uid(), semester_id: s.id, division: "early_childhood", weekly_class_count: 1, base_tuition: 480.00,  recital_fee_included: 0     },
      { id: uid(), semester_id: s.id, division: "early_childhood", weekly_class_count: 2, base_tuition: 880.00,  recital_fee_included: 0     },
      { id: uid(), semester_id: s.id, division: "junior",          weekly_class_count: 1, base_tuition: 560.00,  recital_fee_included: 25.00 },
      { id: uid(), semester_id: s.id, division: "junior",          weekly_class_count: 2, base_tuition: 1040.00, recital_fee_included: 25.00 },
      { id: uid(), semester_id: s.id, division: "junior",          weekly_class_count: 3, base_tuition: 1440.00, recital_fee_included: 25.00 },
      { id: uid(), semester_id: s.id, division: "junior",          weekly_class_count: 4, base_tuition: 1760.00, recital_fee_included: 25.00 },
      { id: uid(), semester_id: s.id, division: "senior",          weekly_class_count: 1, base_tuition: 640.00,  recital_fee_included: 35.00 },
      { id: uid(), semester_id: s.id, division: "senior",          weekly_class_count: 2, base_tuition: 1200.00, recital_fee_included: 35.00 },
      { id: uid(), semester_id: s.id, division: "senior",          weekly_class_count: 3, base_tuition: 1680.00, recital_fee_included: 35.00 },
      { id: uid(), semester_id: s.id, division: "competition",     weekly_class_count: 1, base_tuition: 800.00,  recital_fee_included: 50.00 },
      { id: uid(), semester_id: s.id, division: "competition",     weekly_class_count: 2, base_tuition: 1500.00, recital_fee_included: 50.00 },
    );
  }
  await ins("tuition_rate_bands", bands);

  // Payment plans — one row per semester (PK: semester_id)
  // draft/scheduled → pay_in_full; published/archived → installments
  const plans: Record<string, unknown>[] = SEMS.map((s) => {
    const useInstallments = s.status === "published" || s.status === "archived";
    return useInstallments
      ? {
          semester_id: s.id, type: "installments",
          installment_count: 5,
          due_date: isoDate(s.startDate),
          deposit_amount: null, deposit_percent: null,
        }
      : {
          semester_id: s.id, type: "pay_in_full",
          due_date: isoDate(s.startDate),
          deposit_amount: null, deposit_percent: null, installment_count: null,
        };
  });
  await ins("semester_payment_plans", plans);

  console.log("  ✓ Semesters, fee configs, tuition bands, payment plans\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  DISCOUNTS
// ─────────────────────────────────────────────────────────────────────────────
async function seedDiscounts() {
  console.log("🏷️   Seeding discounts (2 per semester)…");

  const discounts: Record<string, unknown>[] = [];
  const rules:     Record<string, unknown>[] = [];
  const semDiscs:  Record<string, unknown>[] = [];

  for (const s of SEMS) {
    const multiChildId = uid();
    const multiClassId = uid();

    discounts.push(
      {
        id: multiChildId, name: "Multi-Child Family Discount",
        category: "multi_person", eligible_sessions_mode: "all",
        give_session_scope: "all_sessions",
        recipient_scope: "threshold_and_additional", is_active: true,
      },
      {
        id: multiClassId, name: "3+ Classes Enrollment Discount",
        category: "multi_session", eligible_sessions_mode: "all",
        give_session_scope: "threshold_and_additional_sessions",
        recipient_scope: "threshold_and_additional", is_active: true,
      },
    );

    rules.push(
      {
        id: uid(), discount_id: multiChildId,
        rule_type: "multi_person", threshold: 2, threshold_unit: "person",
        value: 50.00, value_type: "flat",
      },
      {
        id: uid(), discount_id: multiClassId,
        rule_type: "multi_session", threshold: 3, threshold_unit: "session",
        value: 10.00, value_type: "percent",
      },
    );

    semDiscs.push(
      { semester_id: s.id, discount_id: multiChildId },
      { semester_id: s.id, discount_id: multiClassId },
    );
  }

  await ins("discounts", discounts);
  await ins("discount_rules", rules);
  await ins("semester_discounts", semDiscs);

  console.log(`  ✓ ${discounts.length} discounts, ${rules.length} rules\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  CLASSES, SCHEDULES, SESSIONS, PRICE TIERS
// ─────────────────────────────────────────────────────────────────────────────
interface ClassRow    { id: string; semester_id: string; name: string; division: string }
interface ScheduleRow { id: string; class_id: string; semester_id: string }
interface SessionRow  { id: string; class_id: string; semester_id: string; schedule_id: string; schedule_date: string; day_of_week: string }
interface TierRow     { id: string; schedule_id: string; amount: number; is_default: boolean }

async function seedClasses() {
  console.log("🩰  Seeding 8 classes × 8 semesters with schedules, sessions, price tiers…");

  const classes:   ClassRow[]    = [];
  const schedules: ScheduleRow[] = [];
  const tiers:     TierRow[]     = [];
  const sessions:  SessionRow[]  = [];

  for (const sem of SEMS) {
    // Published & archived → full 14 occurrences; others → 4 (skeleton data)
    const sessionCount = sem.status === "published" || sem.status === "archived" ? 14 : 4;

    for (const tmpl of TEMPLATES) {
      const classId       = uid();
      const schedId       = uid();
      const instructorName = faker.person.fullName();

      classes.push({
        id: classId, semester_id: sem.id,
        name: tmpl.name, discipline: tmpl.discipline,
        division: tmpl.division, level: tmpl.level,
        description: tmpl.description,
        min_age: tmpl.min_age, max_age: tmpl.max_age,
        is_competition_track: false,
        requires_teacher_rec: false, is_active: true,
      } as ClassRow);

      schedules.push({
        id: schedId, class_id: classId, semester_id: sem.id,
        days_of_week: [tmpl.day],
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        start_date: isoDate(sem.startDate), end_date: isoDate(sem.endDate),
        location: tmpl.location, instructor_name: instructorName,
        capacity: tmpl.capacity,
        registration_open_at: null, registration_close_at: null,
        gender_restriction: "no_restriction",
        urgency_threshold: Math.max(1, Math.floor(tmpl.capacity * 0.2)),
        pricing_model: "full_schedule",
      } as ScheduleRow);

      tiers.push({
        id: uid(), schedule_id: schedId,
        label: "Regular", amount: tmpl.tuition,
        sort_order: 0, is_default: true,
      } as TierRow);

      const dates = weeklyDates(tmpl.day, sem.startDate, sem.endDate, sessionCount);
      for (const date of dates) {
        sessions.push({
          id: uid(), class_id: classId, semester_id: sem.id,
          schedule_id: schedId, schedule_date: isoDate(date),
          day_of_week: tmpl.day,
          start_time: tmpl.start_time, end_time: tmpl.end_time,
          start_date: isoDate(sem.startDate), end_date: isoDate(sem.endDate),
          location: tmpl.location, instructor_name: instructorName,
          capacity: tmpl.capacity, is_active: true,
          drop_in_price: null, cloned_from_session_id: null,
          registration_close_at: null,
        } as SessionRow);
      }
    }
  }

  // Chunked inserts (avoids payload size limits)
  const CHUNK = 50;
  for (let i = 0; i < classes.length;   i += CHUNK) await ins("classes",            classes.slice(i, i + CHUNK));
  for (let i = 0; i < schedules.length; i += CHUNK) await ins("class_schedules",    schedules.slice(i, i + CHUNK));
  for (let i = 0; i < tiers.length;     i += CHUNK) await ins("schedule_price_tiers", tiers.slice(i, i + CHUNK));
  for (let i = 0; i < sessions.length;  i += CHUNK) await ins("class_sessions",     sessions.slice(i, i + CHUNK));

  console.log(
    `  ✓ ${classes.length} classes, ${schedules.length} schedules, ` +
    `${tiers.length} price tiers, ${sessions.length} sessions\n`,
  );
  return { classes, schedules, tiers, sessions };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7.  REGISTRATIONS, BATCHES, LINE ITEMS, INSTALLMENTS, PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
async function seedRegistrations(
  families:  FamilyRow[],
  users:     UserRow[],
  dancers:   DancerRow[],
  schedules: ScheduleRow[],
  sessions:  SessionRow[],
  tiers:     TierRow[],
) {
  console.log("💳  Seeding registrations, batches, installments, payments…");

  const REG_FEE     = 40.00;
  const FAMILY_DISC = 50.00; // applied when family has 2+ dancers enrolled

  const activeSems = SEMS.filter(
    (s) => s.status === "published" || s.status === "archived",
  );

  for (const sem of activeSems) {
    const semSchedules = schedules.filter((s) => s.semester_id === sem.id);
    const semSessions  = sessions.filter((s) => s.semester_id === sem.id);
    const semTiers     = tiers.filter((t) =>
      semSchedules.some((s) => s.id === t.schedule_id),
    );

    // Group sessions by schedule, sorted ascending by date (first occurrence = enrollment target)
    const sessionsBySchedule = new Map<string, SessionRow[]>();
    for (const sess of semSessions) {
      const arr = sessionsBySchedule.get(sess.schedule_id) ?? [];
      arr.push(sess);
      sessionsBySchedule.set(sess.schedule_id, arr);
    }
    for (const arr of sessionsBySchedule.values()) {
      arr.sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
    }

    const batches:      Record<string, unknown>[] = [];
    const regs:         Record<string, unknown>[] = [];
    const lineItems:    Record<string, unknown>[] = [];
    const installments: Record<string, unknown>[] = [];
    const payments:     Record<string, unknown>[] = [];

    for (let fi = 0; fi < families.length; fi++) {
      const fam        = families[fi]!;
      const parent     = users.find((u) => u.family_id === fam.id)!;
      const famDancers = dancers.filter((d) => d.family_id === fam.id);

      const batchId     = uid();
      // Archived → all confirmed; Published → first 4 confirmed, last 2 pending
      const isConfirmed = sem.status === "archived" || fi < 4;
      const planType    = fi % 2 === 0 ? "pay_in_full" : "installments";

      let tuitionTotal = 0;
      const regFeeTotal = famDancers.length * REG_FEE;

      type Enrollment = {
        dancerId: string; userId: string;
        schedId: string; sessionId: string;
        tuition: number; tmplIdx: number;
      };
      const enrollments: Enrollment[] = [];

      for (let di = 0; di < famDancers.length; di++) {
        const dancer   = famDancers[di]!;
        // Round-robin over the 8 schedule slots for variety
        const schedIdx = (fi * 2 + di) % 8;
        const sched    = semSchedules[schedIdx];
        if (!sched) continue;

        const tier       = semTiers.find((t) => t.schedule_id === sched.id && t.is_default);
        const tuition    = tier?.amount ?? 560.00;
        const firstSess  = sessionsBySchedule.get(sched.id)?.[0];
        if (!firstSess) continue;

        tuitionTotal += tuition;
        enrollments.push({
          dancerId: dancer.id, userId: parent.id,
          schedId: sched.id, sessionId: firstSess.id,
          tuition, tmplIdx: schedIdx,
        });
      }

      const grandTotal    = tuitionTotal + regFeeTotal - FAMILY_DISC;
      const amountDueNow  = planType === "pay_in_full"
        ? grandTotal
        : Number((grandTotal * 0.25).toFixed(2));

      batches.push({
        id: batchId, parent_id: parent.id, family_id: fam.id, semester_id: sem.id,
        status: isConfirmed ? "confirmed" : "pending",
        confirmed_at: isConfirmed ? new Date(sem.published_at ?? TODAY).toISOString() : null,
        cart_snapshot: [],
        tuition_total: tuitionTotal,
        registration_fee_total: regFeeTotal,
        recital_fee_total: 0,
        family_discount_amount: FAMILY_DISC,
        auto_pay_admin_fee_total: 0,
        grand_total: grandTotal,
        payment_plan_type: planType,
        amount_due_now: amountDueNow,
        payment_reference_id:
          `AYDT-${sem.name.replace(/\s+/g, "")}-${fam.family_name.replace(/\s+/g, "").toUpperCase()}`,
      });

      for (const e of enrollments) {
        regs.push({
          id: uid(),
          dancer_id: e.dancerId,
          user_id: e.userId,
          session_id: e.sessionId,
          registration_batch_id: batchId,
          // batch_id has a partial UNIQUE index (WHERE NOT NULL) — leave null
          status: isConfirmed ? "confirmed" : "pending_payment",
          form_data: {
            emergencyContact: {
              name: faker.person.fullName(),
              phone: faker.phone.number("(555) ###-####"),
              relation: "Parent",
            },
          },
          total_amount: e.tuition + REG_FEE,
          hold_expires_at: !isConfirmed
            ? new Date(TODAY.getTime() + 15 * 60 * 1000).toISOString()
            : null,
        });

        lineItems.push(
          {
            id: uid(), batch_id: batchId, dancer_id: e.dancerId,
            session_id: e.sessionId, schedule_enrollment_id: null,
            item_type: "full_schedule",
            label: `${TEMPLATES[e.tmplIdx]!.name} — ${sem.name}`,
            unit_amount: e.tuition, quantity: 1, amount: e.tuition,
          },
          {
            id: uid(), batch_id: batchId, dancer_id: e.dancerId,
            session_id: null, schedule_enrollment_id: null,
            item_type: "registration_fee",
            label: "Registration Fee",
            unit_amount: REG_FEE, quantity: 1, amount: REG_FEE,
          },
        );
      }

      // Family discount line item (always — 2 dancers per family)
      lineItems.push({
        id: uid(), batch_id: batchId, dancer_id: null,
        session_id: null, schedule_enrollment_id: null,
        item_type: "family_discount",
        label: "Multi-Child Family Discount",
        unit_amount: -FAMILY_DISC, quantity: 1, amount: -FAMILY_DISC,
      });

      // Payment installments
      if (planType === "pay_in_full") {
        installments.push({
          id: uid(), batch_id: batchId, installment_number: 1,
          amount_due: grandTotal, due_date: isoDate(sem.startDate),
          status: isConfirmed ? "paid" : "scheduled",
          paid_at: isConfirmed ? new Date(sem.startDate).toISOString() : null,
          paid_amount: isConfirmed ? grandTotal : null,
        });
      } else {
        const monthly = Number((grandTotal / 5).toFixed(2));
        for (let inst = 1; inst <= 5; inst++) {
          const dueDate = new Date(sem.startDate);
          dueDate.setMonth(dueDate.getMonth() + inst - 1);
          const isPast       = dueDate <= TODAY;
          const instAmount   = inst === 5 ? Number((grandTotal - monthly * 4).toFixed(2)) : monthly;
          const instStatus   = isConfirmed && isPast ? "paid"
                             : !isConfirmed && isPast ? "overdue"
                             : "scheduled";
          installments.push({
            id: uid(), batch_id: batchId, installment_number: inst,
            amount_due: instAmount, due_date: isoDate(dueDate),
            status: instStatus,
            paid_at:     instStatus === "paid"    ? dueDate.toISOString() : null,
            paid_amount: instStatus === "paid"    ? instAmount            : null,
          });
        }
      }

      // Payment record (confirmed batches only)
      if (isConfirmed) {
        payments.push({
          id: uid(), registration_batch_id: batchId,
          custom_reference: `AYDT-${sem.name.replace(/\s+/g, "")}-${fam.family_name.replace(/\s+/g, "").toUpperCase()}-001`,
          amount: grandTotal, currency: "USD",
          state: "settled", event_type: "payment.settled",
        });
      }
    }

    await ins("registration_batches", batches);
    await ins("registrations", regs);
    await ins("registration_line_items", lineItems);
    await ins("batch_payment_installments", installments);
    if (payments.length) await ins("payments", payments);

    console.log(
      `  ✓ ${sem.name}: ${batches.length} batches, ${regs.length} registrations, ` +
      `${installments.length} installments, ${payments.length} payments`,
    );
  }

  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 8.  WAITLIST ENTRIES
// ─────────────────────────────────────────────────────────────────────────────
async function seedWaitlist(sessions: SessionRow[], dancers: DancerRow[]) {
  console.log("⏳  Seeding waitlist entries…");

  const spring2026 = SEMS.find((s) => s.name === "Spring 2026")!;
  const semSessions = sessions.filter((s) => s.semester_id === spring2026.id);

  // Group by schedule, sorted by date
  const bySchedule = new Map<string, SessionRow[]>();
  for (const sess of semSessions) {
    const arr = bySchedule.get(sess.schedule_id) ?? [];
    arr.push(sess);
    bySchedule.set(sess.schedule_id, arr);
  }
  for (const arr of bySchedule.values()) {
    arr.sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
  }

  // Pick the 8th occurrence for 2 different classes (indices 0 = Creative Movement, 6 = Contemporary)
  const scheduleIds = [...bySchedule.keys()];
  const targetSchedId1 = scheduleIds[0]; // Creative Movement
  const targetSchedId2 = scheduleIds[6]; // Contemporary & Lyrical

  const targetSess1 = bySchedule.get(targetSchedId1!)?.[7]; // 8th session
  const targetSess2 = bySchedule.get(targetSchedId2!)?.[7];

  if (!targetSess1 || !targetSess2) {
    console.warn("  ⚠ Could not find target sessions for waitlist — skipping.");
    return;
  }

  // Waitlist statuses to distribute across entries
  const statuses1: string[] = ["waiting", "waiting", "invited", "expired"];
  const statuses2: string[] = ["waiting", "invited", "accepted", "declined", "waiting"];

  const waitlistRows: Record<string, unknown>[] = [];

  for (let i = 0; i < statuses1.length; i++) {
    const dancer = dancers[i]!;
    const status = statuses1[i]!;
    const sentAt = status !== "waiting"
      ? new Date(TODAY.getTime() - 2 * 86400_000).toISOString() : null;
    const expiresAt = sentAt
      ? new Date(new Date(sentAt).getTime() + 48 * 3600_000).toISOString() : null;

    waitlistRows.push({
      id: uid(), dancer_id: dancer.id, session_id: targetSess1.id,
      position: i + 1, status, invite_token: uid(),
      invitation_sent_at: sentAt, invitation_expires_at: expiresAt,
    });
  }

  for (let i = 0; i < statuses2.length; i++) {
    const dancer = dancers[i + 4]!;
    if (!dancer) break;
    const status = statuses2[i]!;
    const sentAt = status !== "waiting"
      ? new Date(TODAY.getTime() - 1 * 86400_000).toISOString() : null;
    const expiresAt = sentAt
      ? new Date(new Date(sentAt).getTime() + 48 * 3600_000).toISOString() : null;

    waitlistRows.push({
      id: uid(), dancer_id: dancer.id, session_id: targetSess2.id,
      position: i + 1, status, invite_token: uid(),
      invitation_sent_at: sentAt, invitation_expires_at: expiresAt,
    });
  }

  await ins("waitlist_entries", waitlistRows);
  console.log(
    `  ✓ ${waitlistRows.length} waitlist entries across 2 Spring 2026 sessions\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9.  BROADCAST EMAILS (5 lifecycle states)
// ─────────────────────────────────────────────────────────────────────────────
async function seedEmails(users: UserRow[]) {
  console.log("📧  Seeding 5 broadcast emails (draft → scheduled → sending → sent → cancelled)…");

  const spring2026Sem = SEMS.find((s) => s.name === "Spring 2026")!;

  const BASE = {
    body_json: {},
    created_by_admin_id: ETHAN_ID,
    updated_by_admin_id: ETHAN_ID,
    reply_to_email: "hello@aydt.com",
    include_signature: true,
    sender_name: "AYDT Studio",
    sender_email: "hello@aydt.com",
  };

  const emailDefs = [
    {
      id: uid(), status: "draft",
      subject: "Spring 2026 Registration is Now Open!",
      body_html:
        "<h1>Registration is Open!</h1><p>We're thrilled to announce that Spring 2026 registration is now open. Spots fill up fast — enroll your dancer today!</p>",
    },
    {
      id: uid(), status: "scheduled",
      subject: "Upcoming Spring Recital — Save the Date!",
      scheduled_at: new Date("2026-04-20T10:00:00Z").toISOString(),
      body_html:
        "<h1>Save the Date!</h1><p>Our Spring 2026 Recital will be held on <strong>May 15, 2026</strong> at the Downtown Performing Arts Center. More details to follow!</p>",
    },
    {
      id: uid(), status: "sending",
      subject: "Studio Schedule Changes — March 9–15",
      body_html:
        "<h1>Schedule Update</h1><p>Please note: Ballet Foundations will meet in <strong>Studio A</strong> the week of March 9–15 due to floor maintenance in Studio B.</p>",
    },
    {
      id: uid(), status: "sent",
      subject: "Welcome to the Fall 2025 Season at AYDT!",
      sent_at: new Date("2025-08-20T09:00:00Z").toISOString(),
      body_html:
        "<h1>Welcome Back!</h1><p>We are so excited to kick off the Fall 2025 season. Classes begin <strong>September 8th</strong> — we can't wait to see your dancers on the floor!</p>",
    },
    {
      id: uid(), status: "cancelled",
      subject: "Holiday Closure — December 23–27",
      body_html:
        "<h1>Holiday Closure</h1><p>AYDT will be closed December 23–27 for the holiday break. Happy holidays from our whole team!</p>",
    },
  ];

  await ins("emails", emailDefs.map((e) => ({ ...BASE, ...e })));

  // Activity logs
  const logs: Record<string, unknown>[] = [];

  // Every email gets a "created" log
  for (const e of emailDefs) {
    logs.push({ id: uid(), email_id: e.id, action: "created", admin_id: ETHAN_ID, metadata: {} });
  }

  const [draftEmail, scheduledEmail, sendingEmail, sentEmail, cancelledEmail] = emailDefs as (typeof emailDefs[number])[];

  // Scheduled
  logs.push({
    id: uid(), email_id: scheduledEmail!.id, action: "scheduled",
    admin_id: ETHAN_ID,
    metadata: { scheduled_at: scheduledEmail!.scheduled_at },
  });

  // Sending
  logs.push({
    id: uid(), email_id: sendingEmail!.id, action: "sent",
    admin_id: ETHAN_ID, metadata: { note: "send job initiated" },
  });

  // Sent
  logs.push({
    id: uid(), email_id: sentEmail!.id, action: "sent",
    admin_id: ETHAN_ID, metadata: { recipient_count: users.length },
  });

  // Cancelled (scheduled → cancelled)
  logs.push(
    {
      id: uid(), email_id: cancelledEmail!.id, action: "scheduled",
      admin_id: ETHAN_ID, metadata: { scheduled_at: "2025-12-15T10:00:00Z" },
    },
    {
      id: uid(), email_id: cancelledEmail!.id, action: "cancelled",
      admin_id: ETHAN_ID,
      metadata: { reason: "Holiday closure communication no longer needed" },
    },
  );

  await ins("email_activity_logs", logs);

  // Recipients + deliveries for the sent email
  const recipients = users.map((u) => ({
    id: uid(), email_id: sentEmail!.id, user_id: u.id,
    email_address: u.email, first_name: u.first_name, last_name: u.last_name,
  }));
  await ins("email_recipients", recipients);

  const deliveries = users.map((u, i) => ({
    id: uid(), email_id: sentEmail!.id, user_id: u.id,
    email_address: u.email,
    resend_message_id: `re_${faker.string.alphanumeric(20)}`,
    status: i === 0 ? "bounced" : "delivered",
    delivered_at: i === 0 ? null : new Date("2025-08-20T09:05:00Z").toISOString(),
    bounced_at:   i === 0 ? new Date("2025-08-20T09:03:00Z").toISOString() : null,
    opened_at:    i > 1   ? new Date("2025-08-20T11:00:00Z").toISOString() : null,
    clicked_at:   i > 3   ? new Date("2025-08-20T11:15:00Z").toISOString() : null,
  }));
  await ins("email_deliveries", deliveries);

  // Recipient selection for the scheduled email (target: Spring 2026 semester)
  await ins("email_recipient_selections", [
    {
      id: uid(), email_id: scheduledEmail!.id,
      selection_type: "semester", semester_id: spring2026Sem.id, is_excluded: false,
    },
  ]);

  void draftEmail; // referenced above; intentional no-op to silence linter

  console.log("  ✓ 5 emails: draft, scheduled, sending, sent, cancelled\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SESSION GROUPS (Spring 2026 — two curated groups for the UI)
// ─────────────────────────────────────────────────────────────────────────────
async function seedSessionGroups(sessions: SessionRow[]) {
  console.log("🗂️   Seeding session groups for Fall 2026 (scheduled — no registrations)…");

  // Use a scheduled semester to avoid the published-with-registrations trigger
  const fall2026 = SEMS.find((s) => s.name === "Fall 2026")!;
  const semSessions = sessions.filter((s) => s.semester_id === fall2026.id);

  // One representative session per class (first occurrence), keyed by template index
  const firstBySchedule = new Map<string, string>();
  for (const sess of semSessions) {
    if (!firstBySchedule.has(sess.schedule_id)) {
      firstBySchedule.set(sess.schedule_id, sess.id);
    }
  }
  // Schedules are inserted in TEMPLATES order — get unique schedule IDs in order
  const orderedScheduleIds = [...new Set(semSessions.map((s) => s.schedule_id))];
  const firstSessions = orderedScheduleIds.map((sid) => firstBySchedule.get(sid) ?? null);

  const group1Id = uid();
  const group2Id = uid();

  await ins("session_groups", [
    {
      id: group1Id, semester_id: fall2026.id,
      name: "Early Childhood Bundle",
      description: "Creative Movement + Pre-Ballet combined package for ages 4–7.",
    },
    {
      id: group2Id, semester_id: fall2026.id,
      name: "Junior Performance Track",
      description: "Ballet Foundations, Jazz Performance, and Tap Technique for aspiring junior performers.",
    },
  ]);

  // session_group_sessions.session_id → class_sessions(id)
  await ins("session_group_sessions", [
    { id: uid(), session_group_id: group1Id, session_id: firstSessions[0] ?? null }, // Creative Movement
    { id: uid(), session_group_id: group1Id, session_id: firstSessions[1] ?? null }, // Pre-Ballet
    { id: uid(), session_group_id: group2Id, session_id: firstSessions[2] ?? null }, // Ballet Foundations
    { id: uid(), session_group_id: group2Id, session_id: firstSessions[4] ?? null }, // Jazz Performance
    { id: uid(), session_group_id: group2Id, session_id: firstSessions[3] ?? null }, // Tap Technique
  ]);

  await ins("session_group_tags", [
    { id: uid(), session_group_id: group1Id, tag: "ages-4-7" },
    { id: uid(), session_group_id: group1Id, tag: "beginner" },
    { id: uid(), session_group_id: group2Id, tag: "junior" },
    { id: uid(), session_group_id: group2Id, tag: "performance" },
  ]);

  console.log("  ✓ 2 session groups with members and tags\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. SESSION TAGS (spot-tagging a few Fall 2026 sessions — scheduled, no registrations)
// ─────────────────────────────────────────────────────────────────────────────
async function seedSessionTags(sessions: SessionRow[]) {
  const fall2026 = SEMS.find((s) => s.name === "Fall 2026")!;
  const semSessions = sessions.filter((s) => s.semester_id === fall2026.id);

  // Tag the first 5 unique schedule groups
  const bySchedule = new Map<string, SessionRow>();
  for (const sess of semSessions) {
    if (!bySchedule.has(sess.schedule_id)) bySchedule.set(sess.schedule_id, sess);
  }
  const sampleSessions = [...bySchedule.values()].slice(0, 5);
  const tagSets = [
    ["featured", "beginner-friendly"],
    ["new-class"],
    ["popular"],
    ["limited-spots"],
    ["senior-showcase"],
  ];

  const tagRows: Record<string, unknown>[] = [];
  for (let i = 0; i < sampleSessions.length; i++) {
    for (const tag of tagSets[i] ?? []) {
      tagRows.push({ id: uid(), session_id: sampleSessions[i]!.id, tag });
    }
  }

  if (tagRows.length) await ins("session_tags", tagRows);
  console.log(`  ✓ ${tagRows.length} session tags\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. CLASS REQUIREMENTS (a few advanced classes have prereqs)
// ─────────────────────────────────────────────────────────────────────────────
async function seedClassRequirements(classes: ClassRow[]) {
  console.log("📋  Seeding class requirements…");

  // Use Fall 2026 (scheduled) — trigger blocks class_requirements on published semesters with registrations
  const fall2026 = SEMS.find((s) => s.name === "Fall 2026")!;
  const semClasses = classes.filter((c) => c.semester_id === fall2026.id);

  const contemporaryClass = semClasses.find((c) => c.name === "Contemporary & Lyrical");
  const musicalClass      = semClasses.find((c) => c.name === "Musical Theatre Intensive");

  const reqs: Record<string, unknown>[] = [];

  if (contemporaryClass) {
    reqs.push({
      id: uid(), class_id: contemporaryClass.id,
      requirement_type: "skill_qualification",
      required_discipline: "ballet",
      required_level: "Level 1",
      required_class_id: null,
      description: "Dancers should have at least one year of formal ballet or jazz training.",
      enforcement: "soft_warn",
      is_waivable: true,
    });
  }

  if (musicalClass) {
    reqs.push({
      id: uid(), class_id: musicalClass.id,
      requirement_type: "audition_required",
      required_discipline: null,
      required_level: null,
      required_class_id: null,
      description: "An audition or teacher recommendation is required for placement in the Musical Theatre Intensive.",
      enforcement: "hard_block",
      is_waivable: true,
    });
  }

  if (reqs.length) await ins("class_requirements", reqs);
  console.log(`  ✓ ${reqs.length} class requirements\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║       AYDT Database Seed — v2.0          ║");
  console.log("╚══════════════════════════════════════════╝\n");

  await clearDatabase();
  await seedAdmin();

  const { families, users, dancers } = await seedFamilies();
  await seedSemesters();
  await seedDiscounts();

  const { classes, schedules, tiers, sessions } = await seedClasses();

  await seedRegistrations(families, users, dancers, schedules, sessions, tiers);
  await seedWaitlist(sessions, dancers);
  await seedEmails(users);
  await seedSessionGroups(sessions);
  await seedSessionTags(sessions);
  await seedClassRequirements(classes);

  console.log("╔══════════════════════════════════════════╗");
  console.log("║        ✅  Seed complete!                 ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\nSummary:");
  console.log("  Semesters   : 8 (2 draft, 2 scheduled, 2 published, 2 archived)");
  console.log("  Classes     : 64 (8 per semester × 8 semesters)");
  console.log("  Sessions    : 224+ class_sessions across all semesters");
  console.log("  Families    : 6 (6 parents + 12 dancers)");
  console.log("  Batches     : 24 registration batches (6/semester × 4 active semesters)");
  console.log("  Emails      : 5 (draft, scheduled, sending, sent, cancelled)");
  console.log("  Waitlist    : 9 entries across 2 Spring 2026 sessions");
}

main().catch((err) => {
  console.error("\n💥  Seed failed:", err);
  process.exit(1);
});
