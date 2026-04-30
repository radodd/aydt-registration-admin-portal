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

// ── Constants ─────────────────────────────────────────────────────────────────
const ETHAN_ID = "64ebf65c-e32f-4e22-9440-e7bb5a0fee8d";
const NEVER_UUID = "00000000-0000-0000-0000-000000000001"; // guaranteed absent
const TODAY = new Date("2026-04-30");

faker.seed(42); // deterministic output

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();

/**
 * Builds the default registration form for a published semester.
 * Every question field that maps to a stored profile value carries
 * a `profileField` key so the checkout form can pre-fill it for
 * logged-in users automatically.
 */
function buildRegistrationForm() {
  return {
    elements: [
      // ── Dancer / Student ─────────────────────────────────────────────────
      { id: uid(), type: "subheader", label: "Dancer / Student Info" },
      { id: uid(), type: "question", label: "First Name",    inputType: "short_answer", required: true,  profileField: "dancer_first_name" },
      { id: uid(), type: "question", label: "Last Name",     inputType: "short_answer", required: true,  profileField: "dancer_last_name"  },
      { id: uid(), type: "question", label: "Date of Birth", inputType: "date",         required: true,  profileField: "dancer_birth_date" },
      {
        id: uid(), type: "question", label: "Grade", inputType: "select", required: false, profileField: "dancer_grade",
        options: ["Pre-School","Kindergarten","1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th"],
      },
      { id: uid(), type: "question", label: "School Name",   inputType: "short_answer", required: false, profileField: "dancer_school"     },
      { id: uid(), type: "question", label: "Student Email", inputType: "short_answer", required: false, profileField: "dancer_email"      },
      { id: uid(), type: "question", label: "Student Phone", inputType: "phone_number", required: false, profileField: "dancer_phone"      },

      // ── Attendance policy ─────────────────────────────────────────────────
      {
        id: uid(), type: "text_block", label: "Attendance Policy",
        htmlContent: "<p><strong>Attendance Policy</strong></p><p>Please update this section with your attendance policy details.</p>",
      },

      // ── Parent / Guardian ─────────────────────────────────────────────────
      { id: uid(), type: "subheader", label: "Parent / Guardian Info" },
      { id: uid(), type: "question", label: "First Name",     inputType: "short_answer", required: true,  profileField: "parent_first_name"    },
      { id: uid(), type: "question", label: "Last Name",      inputType: "short_answer", required: true,  profileField: "parent_last_name"     },
      { id: uid(), type: "question", label: "Email Address",  inputType: "short_answer", required: true,  profileField: "parent_email"         },
      { id: uid(), type: "question", label: "Phone Number",   inputType: "phone_number", required: true,  profileField: "parent_phone"         },
      { id: uid(), type: "question", label: "Street Address", inputType: "short_answer", required: false, profileField: "parent_address_line1" },
      { id: uid(), type: "question", label: "City",           inputType: "short_answer", required: false, profileField: "parent_city"          },
      { id: uid(), type: "question", label: "State",          inputType: "short_answer", required: false, profileField: "parent_state"         },
      { id: uid(), type: "question", label: "ZIP Code",       inputType: "short_answer", required: false, profileField: "parent_zipcode"       },

      // ── Alternate Parent / Guardian ───────────────────────────────────────
      { id: uid(), type: "subheader", label: "Alternate Parent / Guardian", subtitle: "Optional — spouse, co-parent, or second guardian." },
      { id: uid(), type: "question", label: "First Name",    inputType: "short_answer", required: false, profileField: "alt_parent_first_name"  },
      { id: uid(), type: "question", label: "Last Name",     inputType: "short_answer", required: false, profileField: "alt_parent_last_name"   },
      { id: uid(), type: "question", label: "Phone Number",  inputType: "phone_number", required: false, profileField: "alt_parent_phone"       },
      { id: uid(), type: "question", label: "Email Address", inputType: "short_answer", required: false, profileField: "alt_parent_email"       },
      { id: uid(), type: "question", label: "Relationship",  inputType: "short_answer", required: false, profileField: "alt_parent_relationship"},

      // ── Caregiver ─────────────────────────────────────────────────────────
      { id: uid(), type: "subheader", label: "Caregiver / Nanny", subtitle: "Optional — include if someone else may pick up your dancer." },
      { id: uid(), type: "question", label: "First Name",   inputType: "short_answer", required: false, profileField: "caregiver_first_name"  },
      { id: uid(), type: "question", label: "Last Name",    inputType: "short_answer", required: false, profileField: "caregiver_last_name"   },
      { id: uid(), type: "question", label: "Phone Number", inputType: "phone_number", required: false, profileField: "caregiver_phone"       },
      { id: uid(), type: "question", label: "Email",        inputType: "short_answer", required: false, profileField: "caregiver_email"       },
      { id: uid(), type: "question", label: "Relationship", inputType: "short_answer", required: false, profileField: "caregiver_relationship"},

      // ── Emergency Contact ─────────────────────────────────────────────────
      { id: uid(), type: "subheader", label: "Emergency Contact" },
      { id: uid(), type: "question", label: "First Name",   inputType: "short_answer", required: true,  profileField: "emergency_contact_first_name"  },
      { id: uid(), type: "question", label: "Last Name",    inputType: "short_answer", required: true,  profileField: "emergency_contact_last_name"   },
      { id: uid(), type: "question", label: "Phone Number", inputType: "phone_number", required: true,  profileField: "emergency_contact_phone"       },
      { id: uid(), type: "question", label: "Email",        inputType: "short_answer", required: false, profileField: "emergency_contact_email"       },
      { id: uid(), type: "question", label: "Relationship", inputType: "short_answer", required: false, profileField: "emergency_contact_relationship"},

      // ── General ───────────────────────────────────────────────────────────
      {
        id: uid(), type: "question", label: "How did you hear about us?", inputType: "select", required: false,
        options: ["Social Media","Google Search","Word of Mouth","Returning Family","Flyer / Brochure","Other"],
      },
    ],
  };
}

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
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
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
// ── Class templates (must match AYDT catalog class names) ─────────
const TEMPLATES = [
  {
    name: "Pre-Ballet 1",
    discipline: "ballet",
    division: "early_childhood",
    level: "1",
    description:
      "Introductory ballet class for young dancers focusing on coordination, rhythm, and basic ballet vocabulary.",
    min_age: 3,
    max_age: 5,
    day: "saturday",
    start_time: "10:00:00",
    end_time: "11:00:00",
    location: "Upper East Side",
    capacity: 10,
    tuition: 394.11,
  },
  {
    name: "Pre-Ballet 2",
    discipline: "ballet",
    division: "early_childhood",
    level: "2",
    description:
      "Continuation of Pre-Ballet training introducing longer combinations and musical phrasing.",
    min_age: 4,
    max_age: 6,
    day: "saturday",
    start_time: "11:00:00",
    end_time: "12:00:00",
    location: "Washington Heights",
    capacity: 10,
    tuition: 394.11,
  },
  {
    name: "Ballet 1A",
    discipline: "ballet",
    division: "junior",
    level: "1A",
    description:
      "Fundamental ballet training focusing on posture, barre technique, and center exercises.",
    min_age: 7,
    max_age: 12,
    day: "wednesday",
    start_time: "16:00:00",
    end_time: "17:30:00",
    location: "Upper East Side",
    capacity: 14,
    tuition: 775.93,
  },
  {
    name: "Tap 1A",
    discipline: "tap",
    division: "junior",
    level: "1A",
    description:
      "Beginning tap class focusing on rhythm, coordination, and foundational tap vocabulary.",
    min_age: 7,
    max_age: 14,
    day: "tuesday",
    start_time: "17:00:00",
    end_time: "18:00:00",
    location: "Washington Heights",
    capacity: 14,
    tuition: 775.93,
  },
  {
    name: "Broadway 1",
    discipline: "broadway",
    division: "junior",
    level: "1",
    description:
      "Musical theatre dance class focusing on performance quality, storytelling, and stage presence.",
    min_age: 8,
    max_age: 14,
    day: "thursday",
    start_time: "17:00:00",
    end_time: "18:00:00",
    location: "Upper East Side",
    capacity: 14,
    tuition: 775.93,
  },
  {
    name: "Hip Hop 2",
    discipline: "hip_hop",
    division: "junior",
    level: "2",
    description:
      "High-energy hip hop class exploring groove, rhythm, and foundational street dance styles.",
    min_age: 8,
    max_age: 16,
    day: "wednesday",
    start_time: "18:00:00",
    end_time: "19:00:00",
    location: "Washington Heights",
    capacity: 16,
    tuition: 775.93,
  },
  {
    name: "Contemporary 1",
    discipline: "contemporary",
    division: "senior",
    level: "1",
    description:
      "Contemporary dance class blending ballet technique with expressive movement and floor work.",
    min_age: 13,
    max_age: 18,
    day: "monday",
    start_time: "18:00:00",
    end_time: "19:30:00",
    location: "Upper East Side",
    capacity: 12,
    tuition: 796.43,
  },
  {
    name: "Broadway 3",
    discipline: "broadway",
    division: "senior",
    level: "3",
    description:
      "Advanced musical theatre dance class emphasizing performance quality and technical precision.",
    min_age: 10,
    max_age: 18,
    day: "friday",
    start_time: "17:00:00",
    end_time: "18:30:00",
    location: "Washington Heights",
    capacity: 12,
    tuition: 796.43,
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
    id: uid(),
    name: "Summer 2026 Draft",
    description:
      "Upcoming summer intensive — classes and pricing under review.",
    status: "draft",
    publish_at: null,
    published_at: null,
    startDate: new Date("2026-06-15"),
    endDate: new Date("2026-08-08"),
  },
  {
    id: uid(),
    name: "Fall 2026 Draft",
    description: "New season planning. Schedule not yet finalized.",
    status: "draft",
    publish_at: null,
    published_at: null,
    startDate: new Date("2026-09-08"),
    endDate: new Date("2026-12-12"),
  },
  // SCHEDULED ──────────────────────────────────────────────────────────────────
  {
    id: uid(),
    name: "Summer 2026",
    description:
      "AYDT Summer Intensive — 8 weeks of focused technique, choreography, and performance workshops.",
    status: "scheduled",
    publish_at: new Date("2026-04-15").toISOString(),
    published_at: null,
    startDate: new Date("2026-06-15"),
    endDate: new Date("2026-08-08"),
  },
  {
    id: uid(),
    name: "Fall 2026",
    description:
      "The Fall 2026 season features expanded senior programming and new competition tracks.",
    status: "scheduled",
    publish_at: new Date("2026-07-15").toISOString(),
    published_at: null,
    startDate: new Date("2026-09-08"),
    endDate: new Date("2026-12-12"),
  },
  // PUBLISHED ──────────────────────────────────────────────────────────────────
  {
    id: uid(),
    name: "Spring 2026",
    description:
      "AYDT Spring 2026 — registration is open. Enroll your dancer today and join us for an amazing season of growth, artistry, and community.",
    status: "published",
    publish_at: new Date("2026-01-05").toISOString(),
    published_at: new Date("2026-01-05").toISOString(),
    // Window straddles TODAY (2026-04-30) so generated weekly dates include
    // ~6 occurrences before today, one near today, and ~7 after — gives the
    // instructor portal real past + upcoming class data to test against.
    startDate: new Date("2026-03-09"),
    endDate: new Date("2026-06-26"),
  },
  {
    id: uid(),
    name: "Fall 2025",
    description:
      "AYDT Fall 2025 season — currently ongoing. New enrollment is closed.",
    status: "published",
    publish_at: new Date("2025-08-01").toISOString(),
    published_at: new Date("2025-08-01").toISOString(),
    startDate: new Date("2025-09-08"),
    endDate: new Date("2025-12-13"),
  },
  // ARCHIVED ───────────────────────────────────────────────────────────────────
  {
    id: uid(),
    name: "Spring 2025",
    description: "Archived — AYDT Spring 2025 season.",
    status: "archived",
    publish_at: new Date("2025-01-03").toISOString(),
    published_at: new Date("2025-01-03").toISOString(),
    startDate: new Date("2025-01-13"),
    endDate: new Date("2025-05-09"),
  },
  {
    id: uid(),
    name: "Fall 2024",
    description: "Archived — AYDT Fall 2024 season.",
    status: "archived",
    publish_at: new Date("2024-07-30").toISOString(),
    published_at: new Date("2024-07-30").toISOString(),
    startDate: new Date("2024-09-09"),
    endDate: new Date("2024-12-14"),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1.  CLEAR
// ─────────────────────────────────────────────────────────────────────────────
async function clearDatabase() {
  console.log("🧹  Clearing database (preserving Ethan Flores)…");

  // Leaf → root order to respect FK constraints
  const tables: [string, string?][] = [
    ["coupon_redemptions"],
    ["coupon_session_restrictions"],
    ["semester_coupons"],
    ["discount_coupons"],
    ["sms_notifications"],
    ["email_deliveries"],
    ["email_recipients"],
    ["email_activity_logs"],
    ["email_recipient_selections"],
    ["instructor_student_notes"],
    ["attendance"],
    ["family_contacts"],
    ["class_session_instructors"],
    ["registration_line_items"],
    ["schedule_enrollments"],
    ["batch_payment_installments"],
    ["payments"],
    ["registrations"],
    ["waitlist_entries"],
    ["registration_batches"],
    ["stored_payment_methods"],
    ["shoppers"],
    ["registration_days"],
    ["requirement_waivers"],
    ["concurrent_enrollment_options"],
    ["concurrent_enrollment_groups"],
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
    ["session_occurrence_dates"],
    ["schedule_price_tiers"],
    ["class_schedule_excluded_dates"],
    ["class_sessions"],
    ["class_schedules"],
    ["classes"],
    ["semester_fee_config", "semester_id"],
    ["semester_payment_installments"],
    ["semester_payment_plans", "semester_id"],
    ["special_program_tuition"],
    ["tuition_rate_bands"],
    ["semesters"],
    ["authorized_pickups"],
    ["dancers"],
    ["semester_audit_logs"],
    ["media_images"],
  ];

  for (const [table, col] of tables) await del(table, col ?? "id");

  // Auth users created for seed families + instructors — delete before re-seeding
  const SEED_PARENT_EMAILS = Array.from(
    { length: 6 },
    (_, i) => `ethanf.flores+${i + 1}@gmail.com`,
  );
  const SEED_INSTRUCTOR_EMAILS = Array.from(
    { length: 4 },
    (_, i) => `ethanf.flores+inst${i + 1}@gmail.com`,
  );
  const SEED_AUTH_EMAILS = new Set([
    ...SEED_PARENT_EMAILS,
    ...SEED_INSTRUCTOR_EMAILS,
  ]);
  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (authList) {
    for (const u of authList.users) {
      if (SEED_AUTH_EMAILS.has(u.email ?? "")) {
        await sb.auth.admin.deleteUser(u.id);
      }
    }
  }

  // Users — preserve Ethan Flores
  const { error: uErr } = await sb.from("users").delete().neq("id", ETHAN_ID);
  if (uErr) console.warn(`  ⚠ clearing users: ${uErr.message}`);

  // Families — preserve Ethan's family if he has one
  const { data: ethan } = await sb
    .from("users")
    .select("family_id")
    .eq("id", ETHAN_ID)
    .single();
  if (ethan?.family_id) {
    await sb
      .from("families")
      .delete()
      .neq("id", ethan.family_id as string);
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
    phone_number: "+18087285029",
    sms_opt_in: true,
    sms_verified: true,
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
// 2b.  INSTRUCTORS (auth users + public.users rows)
// ─────────────────────────────────────────────────────────────────────────────
interface InstructorRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const INSTRUCTOR_PROFILES: Omit<InstructorRow, "id">[] = [
  { email: "ethanf.flores+inst1@gmail.com", first_name: "Elena",  last_name: "Rodriguez" },
  { email: "ethanf.flores+inst2@gmail.com", first_name: "Marcus", last_name: "Johnson"   },
  { email: "ethanf.flores+inst3@gmail.com", first_name: "Priya",  last_name: "Patel"     },
  { email: "ethanf.flores+inst4@gmail.com", first_name: "Aisha",  last_name: "Williams"  },
];

async function seedInstructors(): Promise<InstructorRow[]> {
  console.log("🎓  Seeding 4 instructors with auth accounts…");

  const instructors: InstructorRow[] = [];

  for (const profile of INSTRUCTOR_PROFILES) {
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: profile.email,
      email_confirm: true,
      password: "SeedInstructor123!",
      user_metadata: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: "instructor",
      },
    });
    if (authErr) throw new Error(`[CREATE INSTRUCTOR AUTH] ${authErr.message}`);
    const id = authData.user.id;

    // The handle_new_user trigger creates a throwaway family for new auth
    // users — instructors don't have one, so remove it before upserting.
    const { data: triggerUser } = await sb
      .from("users")
      .select("family_id")
      .eq("id", id)
      .single();
    if (triggerUser?.family_id) {
      await sb.from("families").delete().eq("id", triggerUser.family_id);
    }

    // Upsert to set role + contact info and clear any throwaway family_id.
    const { error: upsertErr } = await sb.from("users").upsert(
      {
        id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: "instructor",
        status: "active",
        family_id: null,
        is_primary_parent: false,
        sms_opt_in: false,
        sms_verified: false,
        display_name: `Ms. ${profile.first_name} ${profile.last_name}`,
      },
      { onConflict: "id" },
    );
    if (upsertErr) throw new Error(`[UPSERT INSTRUCTOR] ${upsertErr.message}`);

    instructors.push({ id, ...profile });
  }

  console.log(
    `  ✓ ${instructors.length} instructors: ${instructors.map((i) => `${i.first_name} ${i.last_name}`).join(", ")}\n`,
  );
  return instructors;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  FAMILIES, PARENT USERS, DANCERS
// ─────────────────────────────────────────────────────────────────────────────
interface FamilyRow {
  id: string;
  family_name: string;
}
interface UserRow {
  id: string;
  family_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  sms_opt_in?: boolean;
  sms_verified?: boolean;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}
interface DancerRow {
  id: string;
  family_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
}

const LAST_NAMES = [
  "Anderson",
  "Thompson",
  "Martinez",
  "Nguyen",
  "Williams",
  "Patel",
];

async function seedFamilies() {
  console.log("👨‍👩‍👧  Seeding 6 families (1 parent + 2 dancers each)…");

  const families: FamilyRow[] = LAST_NAMES.map((ln) => ({
    id: uid(),
    family_name: `${ln} Family`,
  }));
  await ins("families", families);

  const users: UserRow[] = [];
  const dancers: DancerRow[] = [];

  for (const [famIdx, fam] of families.entries()) {
    const lastName = fam.family_name.replace(" Family", "");
    const firstName = faker.person.firstName("female");
    const parentEmail = `ethanf.flores+${famIdx + 1}@gmail.com`;
    const { data: authData, error: authErr } =
      await sb.auth.admin.createUser({
        email: parentEmail,
        email_confirm: true,
        password: "SeedParent123!",
        user_metadata: { first_name: firstName, last_name: lastName },
      });
    if (authErr) throw new Error(`[CREATE AUTH USER] ${authErr.message}`);
    const parentId = authData.user.id;

    // handle_new_user trigger fires and creates a throwaway family — remove it
    const { data: triggerUser } = await sb
      .from("users")
      .select("family_id")
      .eq("id", parentId)
      .single();
    if (triggerUser?.family_id) {
      await sb.from("families").delete().eq("id", triggerUser.family_id);
    }

    users.push({
      id: parentId,
      family_id: fam.id,
      email: parentEmail,
      first_name: firstName,
      last_name: lastName,
      phone_number: "+18087285029",
      sms_opt_in: true,
      sms_verified: true,
      role: "parent",
      status: "active",
      is_primary_parent: true,
      address_line1: faker.location.streetAddress(),
      address_line2: faker.datatype.boolean(0.2) ? faker.location.secondaryAddress() : null,
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zipcode: faker.location.zipCode("#####"),
    } as UserRow);

    // Two dancers per family: spread across age ranges for division variety
    const agePairs: [number, number][] = [
      [5, 11],
      [7, 13],
      [8, 14],
      [6, 12],
      [9, 15],
      [7, 10],
    ];
    const [age1, age2] = agePairs[families.indexOf(fam)]!;
    for (const age of [age1, age2]) {
      const birthYear = 2026 - age;
      const birthMonth = String(faker.number.int({ min: 1, max: 12 })).padStart(
        2,
        "0",
      );
      const birthDay = String(faker.number.int({ min: 1, max: 28 })).padStart(
        2,
        "0",
      );
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

  // Trigger already created partial user rows — upsert to fill in all fields
  const { error: upsertErr } = await sb
    .from("users")
    .upsert(users, { onConflict: "id" });
  if (upsertErr) throw new Error(`[UPSERT users] ${upsertErr.message}`);
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
      relation: faker.helpers.arrayElement([
        "Grandparent",
        "Aunt",
        "Uncle",
        "Sibling",
      ]),
    })),
  );

  console.log(
    `  ✓ ${families.length} families, ${users.length} parents, ${dancers.length} dancers\n`,
  );
  return { families, users, dancers };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  SEMESTERS + FEE CONFIG + TUITION BANDS + PAYMENT PLANS
// ─────────────────────────────────────────────────────────────────────────────
async function seedSemesters() {
  console.log(
    "📅  Seeding 8 semesters (2× draft, scheduled, published, archived)…",
  );

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
      registration_form: s.status === "published" ? buildRegistrationForm() : { elements: [] },
      confirmation_email: {
        subject: `You're registered for ${s.name} at AYDT!`,
        senderName: "AYDT Studio",
        senderEmail: "no-reply@aydt.com",
        bodyHtml: `<h1>Welcome to ${s.name}!</h1><p>Thank you for enrolling. We're so excited to dance with you this season. Please review your schedule and feel free to reach out with any questions.</p><p>Warm regards,<br>The AYDT Team</p>`,
      },
      waitlist_settings: {
        enabled: true,
        inviteExpiryHours: 48,
        stopDaysBeforeClose: 3,
      },
    })),
  );

  // Semester fee config
  await ins(
    "semester_fee_config",
    SEMS.map((s) => ({
      semester_id: s.id,
      registration_fee_per_child: 40.0,
      family_discount_amount: 50.0,
      auto_pay_admin_fee_monthly: 5.0,
      auto_pay_installment_count: 5,
      senior_video_fee_per_registrant: 15.0,
      senior_costume_fee_per_class: 65.0,
    })),
  );

  // Tuition rate bands
  const bands: Record<string, unknown>[] = [];
  for (const s of SEMS) {
    bands.push(
      // ── EARLY CHILDHOOD ─────────────────────────
      {
        id: uid(),
        semester_id: s.id,
        division: "early_childhood",
        weekly_class_count: 1,
        base_tuition: 394.11,
        progressive_discount_percent: 0,
        semester_total: 434.11,
        autopay_installment_amount: null,
      },

      // ── JUNIOR ──────────────────────────────────
      {
        id: uid(),
        semester_id: s.id,
        division: "junior",
        weekly_class_count: 1,
        base_tuition: 775.93,
        progressive_discount_percent: 0,
        semester_total: 870.93,
        autopay_installment_amount: 179.19,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "junior",
        weekly_class_count: 2,
        base_tuition: 1513.06,
        progressive_discount_percent: 0,
        semester_total: 1663.06,
        autopay_installment_amount: 337.61,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "junior",
        weekly_class_count: 3,
        base_tuition: 2211.39,
        progressive_discount_percent: 0,
        semester_total: 2416.39,
        autopay_installment_amount: 488.28,
      },

      // ── SENIOR ──────────────────────────────────
      {
        id: uid(),
        semester_id: s.id,
        division: "senior",
        weekly_class_count: 1,
        base_tuition: 796.43,
        progressive_discount_percent: 0,
        semester_total: 916.43,
        autopay_installment_amount: 188.29,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "senior",
        weekly_class_count: 2,
        base_tuition: 1553.04,
        progressive_discount_percent: 0,
        semester_total: 1738.04,
        autopay_installment_amount: 352.61,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "senior",
        weekly_class_count: 3,
        base_tuition: 2269.83,
        progressive_discount_percent: 0,
        semester_total: 2519.83,
        autopay_installment_amount: 508.97,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "senior",
        weekly_class_count: 4,
        base_tuition: 2946.8,
        progressive_discount_percent: 0,
        semester_total: 3261.8,
        autopay_installment_amount: 657.36,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "senior",
        weekly_class_count: 5,
        base_tuition: 3583.94,
        progressive_discount_percent: 0,
        semester_total: 3963.94,
        autopay_installment_amount: 797.79,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "senior",
        weekly_class_count: 6,
        base_tuition: 4181.26,
        progressive_discount_percent: 0,
        semester_total: 4626.26,
        autopay_installment_amount: 930.25,
      },

      // ── COMP TEAM ───────────────────────────────
      {
        id: uid(),
        semester_id: s.id,
        division: "competition",
        weekly_class_count: 1,
        base_tuition: 842.61,
        progressive_discount_percent: 0,
        semester_total: 842.61,
        autopay_installment_amount: 168.52,
      },
      {
        id: uid(),
        semester_id: s.id,
        division: "competition",
        weekly_class_count: 2,
        base_tuition: 802.94,
        progressive_discount_percent: 0,
        semester_total: 802.94,
        autopay_installment_amount: 160.59,
      },
    );
  }
  await ins("tuition_rate_bands", bands);

  // Payment plans — one row per semester (PK: semester_id)
  // draft/scheduled → pay_in_full; published/archived → installments
  const plans: Record<string, unknown>[] = SEMS.map((s) => {
    const useInstallments = s.status === "published" || s.status === "archived";
    return useInstallments
      ? {
          semester_id: s.id,
          type: "installments",
          installment_count: 5,
          due_date: isoDate(s.startDate),
          deposit_amount: null,
          deposit_percent: null,
        }
      : {
          semester_id: s.id,
          type: "pay_in_full",
          due_date: isoDate(s.startDate),
          deposit_amount: null,
          deposit_percent: null,
          installment_count: null,
        };
  });
  await ins("semester_payment_plans", plans);

  console.log("  ✓ Semesters, fee configs, tuition bands, payment plans\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4b. SPECIAL PROGRAM TUITION
// ─────────────────────────────────────────────────────────────────────────────
async function seedSpecialProgramTuition() {
  console.log(
    "🎭  Seeding special program tuition (6 programs × 8 semesters)…",
  );

  const SPECIAL_PROGRAMS = [
    {
      program_key: "early_childhood",
      program_label: "Early Childhood (9 classes)",
      semester_total: 434.11,
      autopay_installment_amount: null,
      autopay_installment_count: null,
      notes: "Fixed fee for early childhood program; no auto-pay plan.",
    },
    {
      program_key: "technique",
      program_label: "Technique",
      semester_total: 716.78,
      autopay_installment_amount: 143.36,
      autopay_installment_count: 5,
      notes: "Technique 1/2/3 — fixed semester fee.",
    },
    {
      program_key: "pre_pointe",
      program_label: "Pre-Pointe (2×/week)",
      semester_total: 457.63,
      autopay_installment_amount: 91.53,
      autopay_installment_count: 5,
      notes: "Pre-pointe program, twice weekly.",
    },
    {
      program_key: "pointe",
      program_label: "Pointe (2×/week)",
      semester_total: 517.49,
      autopay_installment_amount: 103.5,
      autopay_installment_count: 5,
      notes: "Pointe program, twice weekly.",
    },
    {
      program_key: "competition_junior",
      program_label: "Competition Team — Junior",
      semester_total: 842.61,
      autopay_installment_amount: 168.52,
      autopay_installment_count: 5,
      notes: "Junior competition team fixed tuition.",
    },
    {
      program_key: "competition_senior",
      program_label: "Competition Team — Senior",
      semester_total: 802.94,
      autopay_installment_amount: 160.59,
      autopay_installment_count: 5,
      notes: "Senior competition team fixed tuition.",
    },
  ];

  const rows: Record<string, unknown>[] = [];
  for (const s of SEMS) {
    for (const prog of SPECIAL_PROGRAMS) {
      rows.push({
        id: uid(),
        semester_id: s.id,
        ...prog,
      });
    }
  }

  await ins("special_program_tuition", rows);
  console.log("  ✓ Special program tuition rows\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  DISCOUNTS
// ─────────────────────────────────────────────────────────────────────────────
async function seedDiscounts() {
  console.log("🏷️   Seeding discounts (2 per semester)…");

  const discounts: Record<string, unknown>[] = [];
  const rules: Record<string, unknown>[] = [];
  const semDiscs: Record<string, unknown>[] = [];

  for (const s of SEMS) {
    const multiChildId = uid();
    const multiClassId = uid();

    discounts.push(
      {
        id: multiChildId,
        name: "Multi-Child Family Discount",
        category: "multi_person",
        eligible_sessions_mode: "all",
        give_session_scope: "all_sessions",
        recipient_scope: "threshold_and_additional",
        is_active: true,
      },
      {
        id: multiClassId,
        name: "3+ Classes Enrollment Discount",
        category: "multi_session",
        eligible_sessions_mode: "all",
        give_session_scope: "threshold_and_additional_sessions",
        recipient_scope: "threshold_and_additional",
        is_active: true,
      },
    );

    rules.push(
      {
        id: uid(),
        discount_id: multiChildId,
        rule_type: "multi_person",
        threshold: 2,
        threshold_unit: "person",
        value: 50.0,
        value_type: "flat",
      },
      {
        id: uid(),
        discount_id: multiClassId,
        rule_type: "multi_session",
        threshold: 3,
        threshold_unit: "session",
        value: 10.0,
        value_type: "percent",
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
// 5b. COUPONS / PROMO CODES
// ─────────────────────────────────────────────────────────────────────────────

/** Short code prefix per semester name (matches admin naming convention). */
const SEM_CODE_PREFIX: Record<string, string> = {
  "Spring 2026":       "SP26",
  "Fall 2025":         "F25",
  "Spring 2025":       "SP25",
  "Fall 2024":         "F24",
  "Summer 2026":       "SU26",
  "Fall 2026":         "F26",
  "Summer 2026 Draft": "SU26D",
  "Fall 2026 Draft":   "F26D",
};

async function seedCoupons(families: FamilyRow[]) {
  console.log("🎟️   Seeding coupons / promo codes…");

  const coupons: Record<string, unknown>[] = [];
  const semCoupons: Record<string, unknown>[] = [];
  const redemptions: Record<string, unknown>[] = [];

  // Track LWF coupon IDs for redemption records (one per semester)
  const lwfByName: Record<string, string> = {}; // semName → couponId

  // ── Plant Parents Promo — single coupon linked to Fall 2025 + Spring 2026 ──
  // (discount_coupons.code has a UNIQUE constraint, so one row, two sem links)
  const plant50Id = uid();
  const sp26Sem = SEMS.find((s) => s.name === "Spring 2026")!;
  coupons.push({
    id: plant50Id,
    name: "Plant Parents Promo",
    code: "PLANT50",
    value: 50,
    value_type: "flat",
    valid_from: sp26Sem.publish_at,
    valid_until: sp26Sem.endDate.toISOString(),
    max_total_uses: 20,
    uses_count: 0,
    max_per_family: 1,
    stackable: true,
    eligible_sessions_mode: "all",
    is_active: true,
    applies_to_most_expensive_only: false,
    eligible_line_item_types: ["tuition", "registration_fee", "recital_fee"],
  });

  for (const s of SEMS) {
    if (s.status === "draft") continue; // draft semesters have no active coupons

    const prefix = SEM_CODE_PREFIX[s.name] ?? s.name.replace(/\s/g, "").slice(0, 5).toUpperCase();

    // ── Lucy Walsh Fund (LWF) — 20% off most expensive tuition item ──────────
    const lwfId = uid();
    coupons.push({
      id: lwfId,
      name: `${s.name} Tuition Assistance (LWF)`,
      code: `${prefix}LWF`,
      value: 20,
      value_type: "percent",
      valid_from: s.publish_at,
      valid_until: s.endDate.toISOString(),
      max_total_uses: null,
      uses_count: 0,
      max_per_family: 1,
      stackable: false,
      eligible_sessions_mode: "all",
      is_active: true,
      applies_to_most_expensive_only: true,
      eligible_line_item_types: ["tuition"],
    });
    semCoupons.push({ semester_id: s.id, coupon_id: lwfId });
    lwfByName[s.name] = lwfId;

    // Link PLANT50 to Fall 2025 and Spring 2026
    if (s.name === "Fall 2025" || s.name === "Spring 2026") {
      semCoupons.push({ semester_id: s.id, coupon_id: plant50Id });
    }

    // ── Early Registration Auto-apply — 5% off (scheduled semesters only) ───
    if (s.status === "scheduled") {
      const earlyId = uid();
      const earlyUntil = new Date(s.startDate);
      earlyUntil.setDate(earlyUntil.getDate() - 14); // expires 2 weeks before start
      coupons.push({
        id: earlyId,
        name: "Early Registration Discount",
        code: null, // auto-apply by date
        value: 5,
        value_type: "percent",
        valid_from: s.publish_at,
        valid_until: earlyUntil.toISOString(),
        max_total_uses: null,
        uses_count: 0,
        max_per_family: 1,
        stackable: true,
        eligible_sessions_mode: "all",
        is_active: true,
        applies_to_most_expensive_only: false,
        eligible_line_item_types: ["tuition", "registration_fee", "recital_fee"],
      });
      semCoupons.push({ semester_id: s.id, coupon_id: earlyId });
    }
  }

  // ── Redemption records for published + archived semesters ──────────────────
  // LWF: 3 families redeemed per past semester
  const pastSemNames = ["Fall 2025", "Spring 2025", "Fall 2024"];
  for (const semName of pastSemNames) {
    const couponId = lwfByName[semName];
    if (!couponId) continue;
    const redemptionFamilies = families.slice(0, 3);
    for (const fam of redemptionFamilies) {
      redemptions.push({
        id: uid(),
        coupon_id: couponId,
        family_id: fam.id,
        registration_batch_id: null,
        redeemed_at: new Date(
          new Date(SEMS.find((s) => s.name === semName)!.startDate).getTime() +
            Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
    }
    // Update uses_count to match redemptions
    const coupon = coupons.find((c) => c.id === couponId);
    if (coupon) coupon.uses_count = redemptionFamilies.length;
  }

  // PLANT50: 2 families redeemed (single coupon shared across semesters)
  const promoFamilies = families.slice(1, 3);
  for (const fam of promoFamilies) {
    redemptions.push({
      id: uid(),
      coupon_id: plant50Id,
      family_id: fam.id,
      registration_batch_id: null,
      redeemed_at: new Date(
        new Date("2025-09-20").getTime() +
          Math.floor(Math.random() * 14) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  }
  const plant50Coupon = coupons.find((c) => c.id === plant50Id);
  if (plant50Coupon) plant50Coupon.uses_count = promoFamilies.length;

  await ins("discount_coupons", coupons);
  await ins("semester_coupons", semCoupons);
  if (redemptions.length) await ins("coupon_redemptions", redemptions);

  console.log(
    `  ✓ ${coupons.length} coupons, ${semCoupons.length} semester links, ${redemptions.length} redemptions\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  CLASSES, SCHEDULES, SESSIONS, PRICE TIERS
// ─────────────────────────────────────────────────────────────────────────────
interface ClassRow {
  id: string;
  semester_id: string;
  name: string;
  division: string;
}
interface ScheduleRow {
  id: string;
  class_id: string;
  semester_id: string;
}
interface SessionRow {
  id: string;
  class_id: string;
  semester_id: string;
  schedule_id: string;
  schedule_date: string;
  day_of_week: string;
}
interface TierRow {
  id: string;
  schedule_id: string;
  amount: number;
  is_default: boolean;
}

async function seedClasses() {
  console.log(
    "🩰  Seeding 8 classes × 8 semesters with schedules, sessions, occurrence dates, price tiers…",
  );

  const classes: ClassRow[] = [];
  const schedules: ScheduleRow[] = [];
  const tiers: TierRow[] = [];
  const sessions: SessionRow[] = [];
  const occurrenceDates: Record<string, unknown>[] = [];

  for (const sem of SEMS) {
    // Published & archived → full 14 occurrences; others → 4 (skeleton data)
    const sessionCount =
      sem.status === "published" || sem.status === "archived" ? 14 : 4;

    for (const tmpl of TEMPLATES) {
      const classId = uid();
      const schedId = uid();
      const sessionId = uid();
      const instructorName = faker.person.fullName();

      classes.push({
        id: classId,
        semester_id: sem.id,
        name: tmpl.name,
        discipline: tmpl.discipline,
        division: tmpl.division,
        description: tmpl.description,
        min_age: tmpl.min_age,
        max_age: tmpl.max_age,
        is_competition_track: false,
        requires_teacher_rec: false,
        is_active: true,
      } as ClassRow);

      schedules.push({
        id: schedId,
        class_id: classId,
        semester_id: sem.id,
        days_of_week: [tmpl.day],
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        start_date: isoDate(sem.startDate),
        end_date: isoDate(sem.endDate),
        location: tmpl.location,
        instructor_name: instructorName,
        capacity: tmpl.capacity,
        registration_open_at: null,
        registration_close_at: null,
        gender_restriction: "no_restriction",
        urgency_threshold: Math.max(1, Math.floor(tmpl.capacity * 0.2)),
        pricing_model: "full_schedule",
      } as ScheduleRow);

      tiers.push({
        id: uid(),
        schedule_id: schedId,
        label: "Regular",
        amount: Math.round(tmpl.tuition * 100),
        sort_order: 0,
        is_default: true,
      } as TierRow);

      // ONE class_sessions row per schedule (the abstract recurring class).
      // schedule_date is left NULL — calendar dates live in
      // session_occurrence_dates so the instructor portal can list them.
      sessions.push({
        id: sessionId,
        class_id: classId,
        semester_id: sem.id,
        schedule_id: schedId,
        schedule_date: null as unknown as string,
        day_of_week: tmpl.day,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        start_date: isoDate(sem.startDate),
        end_date: isoDate(sem.endDate),
        location: tmpl.location,
        instructor_name: instructorName,
        capacity: tmpl.capacity,
        is_active: true,
        drop_in_price: null,
        cloned_from_session_id: null,
        registration_close_at: null,
      } as SessionRow);

      const dates = weeklyDates(
        tmpl.day,
        sem.startDate,
        sem.endDate,
        sessionCount,
      );
      for (const date of dates) {
        occurrenceDates.push({
          id: uid(),
          session_id: sessionId,
          date: isoDate(date),
          is_cancelled: false,
        });
      }
    }
  }

  // Chunked inserts (avoids payload size limits)
  const CHUNK = 50;
  for (let i = 0; i < classes.length; i += CHUNK)
    await ins("classes", classes.slice(i, i + CHUNK));
  for (let i = 0; i < schedules.length; i += CHUNK)
    await ins("class_schedules", schedules.slice(i, i + CHUNK));
  for (let i = 0; i < tiers.length; i += CHUNK)
    await ins("schedule_price_tiers", tiers.slice(i, i + CHUNK));
  for (let i = 0; i < sessions.length; i += CHUNK)
    await ins("class_sessions", sessions.slice(i, i + CHUNK));
  for (let i = 0; i < occurrenceDates.length; i += CHUNK)
    await ins("session_occurrence_dates", occurrenceDates.slice(i, i + CHUNK));

  console.log(
    `  ✓ ${classes.length} classes, ${schedules.length} schedules, ` +
      `${tiers.length} price tiers, ${sessions.length} sessions, ` +
      `${occurrenceDates.length} occurrence dates\n`,
  );
  return { classes, schedules, tiers, sessions };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6b.  CLASS_SESSION_INSTRUCTORS (assign instructors to every weekly date)
// ─────────────────────────────────────────────────────────────────────────────
async function seedClassSessionInstructors(
  instructors: InstructorRow[],
  _schedules: ScheduleRow[],
  sessions: SessionRow[],
) {
  if (instructors.length === 0) return;
  console.log("🎯  Assigning instructors to class sessions…");

  // Skip draft semesters — those classes shouldn't appear in the portal yet.
  const activeSemIds = new Set(
    SEMS.filter((s) => s.status !== "draft").map((s) => s.id),
  );
  const activeSessions = sessions.filter((s) => activeSemIds.has(s.semester_id));

  // One class_sessions row per schedule, so this is a 1:1 assignment loop.
  // Round-robin lead across the four instructors; the next instructor in
  // rotation acts as assistant. Each instructor ends up leading roughly
  // (active_sessions / 4) classes.
  const rows: Record<string, unknown>[] = [];
  activeSessions.forEach((sess, idx) => {
    const lead   = instructors[idx % instructors.length]!.id;
    const assist = instructors[(idx + 1) % instructors.length]!.id;
    rows.push({ id: uid(), session_id: sess.id, user_id: lead,   is_lead: true  });
    rows.push({ id: uid(), session_id: sess.id, user_id: assist, is_lead: false });
  });

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await ins("class_session_instructors", rows.slice(i, i + CHUNK));
  }

  console.log(
    `  ✓ ${rows.length / 2} sessions assigned ` +
      `(${rows.length / 2} lead + ${rows.length / 2} assistant)\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7.  REGISTRATIONS, BATCHES, LINE ITEMS, INSTALLMENTS, PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
async function seedRegistrations(
  families: FamilyRow[],
  users: UserRow[],
  dancers: DancerRow[],
  schedules: ScheduleRow[],
  sessions: SessionRow[],
  tiers: TierRow[],
) {
  console.log("💳  Seeding registrations, batches, installments, payments…");

  const REG_FEE = 40.0;
  const FAMILY_DISC = 50.0; // applied when family has 2+ dancers enrolled

  const activeSems = SEMS.filter(
    (s) => s.status === "published" || s.status === "archived",
  );

  for (const sem of activeSems) {
    const semSchedules = schedules.filter((s) => s.semester_id === sem.id);
    const semTiers = tiers.filter((t) =>
      semSchedules.some((s) => s.id === t.schedule_id),
    );

    const batches: Record<string, unknown>[] = [];
    const scheduleEnrollments: Record<string, unknown>[] = [];
    const lineItems: Record<string, unknown>[] = [];
    const installments: Record<string, unknown>[] = [];
    const payments: Record<string, unknown>[] = [];

    for (let fi = 0; fi < families.length; fi++) {
      const fam = families[fi]!;
      const parent = users.find((u) => u.family_id === fam.id)!;
      const famDancers = dancers.filter((d) => d.family_id === fam.id);

      const batchId = uid();
      // Archived → all confirmed; Published → first 4 confirmed, last 2 pending
      const isConfirmed = sem.status === "archived" || fi < 4;
      const planType = fi % 2 === 0 ? "pay_in_full" : "installments";

      // Spread registration timestamps: one family every ~10 days after publication
      const pubMs = sem.published_at
        ? new Date(sem.published_at).getTime()
        : sem.startDate.getTime() - 90 * 24 * 60 * 60 * 1000;
      const regAt = new Date(pubMs + fi * 10 * 24 * 60 * 60 * 1000);

      let tuitionTotal = 0;
      const regFeeTotal = famDancers.length * REG_FEE;

      type Enrollment = {
        dancerId: string;
        userId: string;
        schedId: string;
        tierId: string | null;
        tuition: number;
        tmplIdx: number;
      };
      const enrollments: Enrollment[] = [];

      for (let di = 0; di < famDancers.length; di++) {
        const dancer = famDancers[di]!;
        // Round-robin over the 8 schedule slots for variety
        const schedIdx = (fi * 2 + di) % 8;
        const sched = semSchedules[schedIdx];
        if (!sched) continue;

        const tier = semTiers.find(
          (t) => t.schedule_id === sched.id && t.is_default,
        );
        const tuition = tier?.amount ?? 560.0;

        tuitionTotal += tuition;
        enrollments.push({
          dancerId: dancer.id,
          userId: parent.id,
          schedId: sched.id,
          tierId: tier?.id ?? null,
          tuition,
          tmplIdx: schedIdx,
        });
      }

      const grandTotal = tuitionTotal + regFeeTotal - FAMILY_DISC;
      const amountDueNow =
        planType === "pay_in_full"
          ? grandTotal
          : Number((grandTotal * 0.25).toFixed(2));

      batches.push({
        id: batchId,
        parent_id: parent.id,
        family_id: fam.id,
        semester_id: sem.id,
        status: isConfirmed ? "confirmed" : "pending",
        created_at: regAt.toISOString(),
        confirmed_at: isConfirmed ? regAt.toISOString() : null,
        cart_snapshot: [],
        tuition_total: tuitionTotal,
        registration_fee_total: regFeeTotal,
        recital_fee_total: 0,
        family_discount_amount: FAMILY_DISC,
        auto_pay_admin_fee_total: 0,
        grand_total: grandTotal,
        payment_plan_type: planType,
        amount_due_now: amountDueNow,
        payment_reference_id: `AYDT-${sem.name.replace(/\s+/g, "")}-${fam.family_name.replace(/\s+/g, "").toUpperCase()}`,
      });

      for (const e of enrollments) {
        const enrollmentId = uid();
        scheduleEnrollments.push({
          id: enrollmentId,
          schedule_id: e.schedId,
          batch_id: batchId,
          dancer_id: e.dancerId,
          price_tier_id: e.tierId,
          price_snapshot: e.tuition,
          status: isConfirmed ? "confirmed" : "pending",
          created_at: regAt.toISOString(),
        });

        lineItems.push(
          {
            id: uid(),
            batch_id: batchId,
            dancer_id: e.dancerId,
            session_id: null,
            schedule_enrollment_id: enrollmentId,
            item_type: "full_schedule",
            label: `${TEMPLATES[e.tmplIdx]!.name} — ${sem.name}`,
            unit_amount: e.tuition,
            quantity: 1,
            amount: e.tuition,
          },
          {
            id: uid(),
            batch_id: batchId,
            dancer_id: e.dancerId,
            session_id: null,
            schedule_enrollment_id: null,
            item_type: "registration_fee",
            label: "Registration Fee",
            unit_amount: REG_FEE,
            quantity: 1,
            amount: REG_FEE,
          },
        );
      }

      // Family discount line item (always — 2 dancers per family)
      lineItems.push({
        id: uid(),
        batch_id: batchId,
        dancer_id: null,
        session_id: null,
        schedule_enrollment_id: null,
        item_type: "family_discount",
        label: "Multi-Child Family Discount",
        unit_amount: -FAMILY_DISC,
        quantity: 1,
        amount: -FAMILY_DISC,
      });

      // Payment installments
      if (planType === "pay_in_full") {
        installments.push({
          id: uid(),
          batch_id: batchId,
          installment_number: 1,
          amount_due: grandTotal,
          due_date: isoDate(sem.startDate),
          status: isConfirmed ? "paid" : "scheduled",
          paid_at: isConfirmed ? new Date(sem.startDate).toISOString() : null,
          paid_amount: isConfirmed ? grandTotal : null,
        });
      } else {
        const monthly = Number((grandTotal / 5).toFixed(2));
        for (let inst = 1; inst <= 5; inst++) {
          const dueDate = new Date(sem.startDate);
          dueDate.setMonth(dueDate.getMonth() + inst - 1);
          const isPast = dueDate <= TODAY;
          const instAmount =
            inst === 5
              ? Number((grandTotal - monthly * 4).toFixed(2))
              : monthly;
          const instStatus =
            isConfirmed && isPast
              ? "paid"
              : !isConfirmed && isPast
                ? "overdue"
                : "scheduled";
          installments.push({
            id: uid(),
            batch_id: batchId,
            installment_number: inst,
            amount_due: instAmount,
            due_date: isoDate(dueDate),
            status: instStatus,
            paid_at: instStatus === "paid" ? dueDate.toISOString() : null,
            paid_amount: instStatus === "paid" ? instAmount : null,
          });
        }
      }

      // Payment record (confirmed batches only)
      if (isConfirmed) {
        payments.push({
          id: uid(),
          registration_batch_id: batchId,
          custom_reference: `AYDT-${sem.name.replace(/\s+/g, "")}-${fam.family_name.replace(/\s+/g, "").toUpperCase()}-001`,
          amount: grandTotal,
          currency: "USD",
          state: "settled",
          event_type: "payment.settled",
        });
      }
    }

    await ins("registration_batches", batches);
    await ins("schedule_enrollments", scheduleEnrollments);
    await ins("registration_line_items", lineItems);
    await ins("batch_payment_installments", installments);
    if (payments.length) await ins("payments", payments);

    console.log(
      `  ✓ ${sem.name}: ${batches.length} batches, ${scheduleEnrollments.length} enrollments, ` +
        `${installments.length} installments, ${payments.length} payments`,
    );
  }

  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7b.  SHOWCASE CLASS — fill one Spring 2026 class with all 12 dancers
//      so the instructor portal has a populated roster to inspect.
// ─────────────────────────────────────────────────────────────────────────────
async function seedShowcaseClass(
  families: FamilyRow[],
  users: UserRow[],
  dancers: DancerRow[],
  schedules: ScheduleRow[],
  tiers: TierRow[],
) {
  console.log("⭐  Seeding showcase class with all 12 dancers…");

  const spring2026 = SEMS.find((s) => s.name === "Spring 2026")!;
  const semSchedules = schedules.filter((s) => s.semester_id === spring2026.id);

  // TEMPLATES index 4 = Broadway 1 (capacity 14). Schedules are inserted in
  // template order, so semSchedules[4] is the Broadway 1 schedule.
  const showcaseSched = semSchedules[4];
  if (!showcaseSched) {
    console.warn("  ⚠ Could not find Broadway 1 schedule — skipping showcase.");
    return;
  }

  const tier = tiers.find(
    (t) => t.schedule_id === showcaseSched.id && t.is_default,
  );
  const tuition = tier?.amount ?? 775.93;

  // Seed time: a few days after Spring 2026 publication.
  const regAt = new Date(spring2026.published_at!);
  regAt.setDate(regAt.getDate() + 5);

  // Pull existing enrollments for this schedule (written by seedRegistrations'
  // round-robin pass). The unique constraint on (schedule_id, dancer_id)
  // means we have to skip any dancer already placed here.
  const { data: existingRows } = await sb
    .from("schedule_enrollments")
    .select("dancer_id")
    .eq("schedule_id", showcaseSched.id);
  const alreadyEnrolledIds = new Set(
    (existingRows ?? []).map((r) => r.dancer_id as string),
  );

  const batches: Record<string, unknown>[] = [];
  const enrollments: Record<string, unknown>[] = [];
  const lineItems: Record<string, unknown>[] = [];
  const installments: Record<string, unknown>[] = [];

  for (const fam of families) {
    const parent = users.find((u) => u.family_id === fam.id);
    const famDancers = dancers.filter((d) => d.family_id === fam.id);
    if (!parent || famDancers.length === 0) continue;

    const batchId = uid();
    const familyEnrollments: { dancerId: string; enrollmentId: string }[] = [];

    for (const dancer of famDancers) {
      if (alreadyEnrolledIds.has(dancer.id)) continue;

      const enrollmentId = uid();
      familyEnrollments.push({ dancerId: dancer.id, enrollmentId });

      enrollments.push({
        id: enrollmentId,
        schedule_id: showcaseSched.id,
        batch_id: batchId,
        dancer_id: dancer.id,
        price_tier_id: tier?.id ?? null,
        price_snapshot: tuition,
        status: "confirmed",
        created_at: regAt.toISOString(),
      });
    }

    if (familyEnrollments.length === 0) continue;

    const tuitionTotal = tuition * familyEnrollments.length;
    const grandTotal   = tuitionTotal;

    batches.push({
      id: batchId,
      parent_id: parent.id,
      family_id: fam.id,
      semester_id: spring2026.id,
      status: "confirmed",
      created_at: regAt.toISOString(),
      confirmed_at: regAt.toISOString(),
      cart_snapshot: [],
      tuition_total: tuitionTotal,
      registration_fee_total: 0,
      recital_fee_total: 0,
      family_discount_amount: 0,
      auto_pay_admin_fee_total: 0,
      grand_total: grandTotal,
      payment_plan_type: "pay_in_full",
      amount_due_now: grandTotal,
      payment_reference_id: `AYDT-Spring2026-SHOWCASE-${fam.family_name.replace(/\s+/g, "").toUpperCase()}`,
    });

    for (const fe of familyEnrollments) {
      lineItems.push({
        id: uid(),
        batch_id: batchId,
        dancer_id: fe.dancerId,
        session_id: null,
        schedule_enrollment_id: fe.enrollmentId,
        item_type: "full_schedule",
        label: `Broadway 1 — Spring 2026 (Showcase)`,
        unit_amount: tuition,
        quantity: 1,
        amount: tuition,
      });
    }

    installments.push({
      id: uid(),
      batch_id: batchId,
      installment_number: 1,
      amount_due: grandTotal,
      due_date: isoDate(spring2026.startDate),
      status: "paid",
      paid_at: regAt.toISOString(),
      paid_amount: grandTotal,
    });
  }

  if (batches.length === 0) {
    console.warn("  ⚠ All dancers already enrolled in Broadway 1 — nothing added.");
    return;
  }

  await ins("registration_batches", batches);
  await ins("schedule_enrollments", enrollments);
  await ins("registration_line_items", lineItems);
  await ins("batch_payment_installments", installments);

  console.log(
    `  ✓ Broadway 1 (Spring 2026) — ${enrollments.length} dancers enrolled\n` +
      `    Lead: Elena Rodriguez (ethanf.flores+inst1@gmail.com)\n` +
      `    Assistant: Marcus Johnson (ethanf.flores+inst2@gmail.com)\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7c.  ATTENDANCE — mark all past occurrence dates for every active enrollment
// ─────────────────────────────────────────────────────────────────────────────
async function seedAttendance(instructors: InstructorRow[]) {
  if (instructors.length === 0) return;
  console.log("📋  Seeding attendance for past sessions…");

  const todayIso = isoDate(TODAY);

  // Pull every (session, dancer) pair where the dancer is enrolled in the
  // schedule and the session has past occurrence dates.
  const { data: enrollmentRows } = await sb
    .from("schedule_enrollments")
    .select("dancer_id, schedule_id, status")
    .neq("status", "cancelled");

  if (!enrollmentRows || enrollmentRows.length === 0) {
    console.log("  ⚠ No enrollments — skipping.\n");
    return;
  }

  // schedule_id → list of dancer_ids
  const dancersBySchedule = new Map<string, string[]>();
  for (const e of enrollmentRows) {
    const arr = dancersBySchedule.get(e.schedule_id as string) ?? [];
    arr.push(e.dancer_id as string);
    dancersBySchedule.set(e.schedule_id as string, arr);
  }

  // Pull sessions + their occurrence dates and lead instructor.
  const { data: sessionRows } = await sb
    .from("class_sessions")
    .select(`
      id, schedule_id,
      session_occurrence_dates ( id, date, is_cancelled ),
      class_session_instructors ( user_id, is_lead )
    `)
    .in("schedule_id", [...dancersBySchedule.keys()]);

  type AttRow = Record<string, unknown>;
  const attendance: AttRow[] = [];

  // Deterministic per-dancer status pattern so re-runs are stable.
  // 80% present, 10% absent, 7% tardy, 3% excused.
  const pickStatus = (seed: number): "present" | "absent" | "tardy" | "excused" => {
    const r = (seed * 9301 + 49297) % 233280 / 233280;
    if (r < 0.80) return "present";
    if (r < 0.90) return "absent";
    if (r < 0.97) return "tardy";
    return "excused";
  };

  for (const row of sessionRows ?? []) {
    const sessionId  = row.id as string;
    const scheduleId = row.schedule_id as string;
    const dancers    = dancersBySchedule.get(scheduleId) ?? [];
    const occurrences = (row.session_occurrence_dates ?? []) as Array<{
      id: string; date: string; is_cancelled: boolean;
    }>;
    const leads = (row.class_session_instructors ?? []).filter((i) => i.is_lead) as Array<{ user_id: string }>;
    const markedBy = leads[0]?.user_id ?? instructors[0]!.id;

    for (const occ of occurrences) {
      if (occ.is_cancelled) continue;
      if (occ.date >= todayIso) continue;  // future — skip

      for (let di = 0; di < dancers.length; di++) {
        const dancerId = dancers[di]!;
        const status = pickStatus(
          // hash dancer position + date day-of-month + session prefix
          di + parseInt(occ.date.replace(/-/g, "").slice(-4), 10) + sessionId.charCodeAt(0),
        );
        const note = status === "tardy"
          ? "Arrived 10 minutes late."
          : status === "absent"
          ? "Out sick."
          : null;
        attendance.push({
          id: uid(),
          session_id:         sessionId,
          occurrence_date_id: occ.id,
          dancer_id:          dancerId,
          status,
          note,
          marked_by:          markedBy,
        });
      }
    }
  }

  if (attendance.length === 0) {
    console.log("  ⚠ No past dates to mark.\n");
    return;
  }

  const CHUNK = 200;
  for (let i = 0; i < attendance.length; i += CHUNK) {
    await ins("attendance", attendance.slice(i, i + CHUNK));
  }

  console.log(`  ✓ ${attendance.length} attendance rows\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7d.  INSTRUCTOR NOTES — a few tagged notes per enrolled dancer
// ─────────────────────────────────────────────────────────────────────────────
async function seedInstructorNotes(instructors: InstructorRow[]) {
  if (instructors.length === 0) return;
  console.log("📝  Seeding instructor notes…");

  const NOTE_TEMPLATES: Array<{ tag: "progress" | "behavior" | "goal"; text: string }> = [
    { tag: "progress", text: "Showing real focus this week — confident on the new combination." },
    { tag: "progress", text: "Coordination has improved noticeably since last month." },
    { tag: "behavior", text: "Recovered well after a slow start. Keep an eye on energy at the top of class." },
    { tag: "behavior", text: "Engaged and asking thoughtful questions. Great example for the group." },
    { tag: "goal",     text: "Working on holding 2nd position throughout the longer combinations." },
    { tag: "goal",     text: "Next focus: stamina for the back half of the routine." },
  ];

  // Pick all dancers that are enrolled in any schedule taught by an instructor.
  const { data: enrollmentRows } = await sb
    .from("schedule_enrollments")
    .select("dancer_id, schedule_id")
    .neq("status", "cancelled");

  if (!enrollmentRows || enrollmentRows.length === 0) {
    console.log("  ⚠ No enrollments — skipping.\n");
    return;
  }

  // schedule → instructor user_ids (lead first)
  const { data: csi } = await sb
    .from("class_session_instructors")
    .select(`user_id, is_lead, class_sessions:session_id ( schedule_id )`);

  const instructorsBySchedule = new Map<string, string[]>();
  for (const row of csi ?? []) {
    const cs = Array.isArray(row.class_sessions) ? row.class_sessions[0] : row.class_sessions;
    const schedId = (cs as { schedule_id?: string } | null)?.schedule_id;
    if (!schedId) continue;
    const arr = instructorsBySchedule.get(schedId) ?? [];
    if (row.is_lead) arr.unshift(row.user_id as string);
    else arr.push(row.user_id as string);
    instructorsBySchedule.set(schedId, arr);
  }

  // Deduplicate dancer → set of instructor ids who teach them
  const dancerToInstructors = new Map<string, Set<string>>();
  for (const e of enrollmentRows) {
    const dancerId = e.dancer_id as string;
    const schedId  = e.schedule_id as string;
    const teachers = instructorsBySchedule.get(schedId) ?? [];
    const set = dancerToInstructors.get(dancerId) ?? new Set<string>();
    teachers.forEach((id) => set.add(id));
    dancerToInstructors.set(dancerId, set);
  }

  const rows: Record<string, unknown>[] = [];
  let dancerIdx = 0;
  for (const [dancerId, teachers] of dancerToInstructors.entries()) {
    const teacherList = [...teachers];
    if (teacherList.length === 0) continue;

    // 2–3 notes per dancer, rotating through templates and authors.
    const noteCount = 2 + (dancerIdx % 2);
    for (let i = 0; i < noteCount; i++) {
      const tmpl   = NOTE_TEMPLATES[(dancerIdx * 3 + i) % NOTE_TEMPLATES.length]!;
      const author = teacherList[i % teacherList.length]!;
      const daysBack = (i + 1) * 7 + (dancerIdx % 5);
      const created = new Date(TODAY);
      created.setDate(created.getDate() - daysBack);
      rows.push({
        id: uid(),
        instructor_id: author,
        dancer_id:     dancerId,
        note:          tmpl.text,
        tag:           tmpl.tag,
        created_at:    created.toISOString(),
      });
    }
    dancerIdx++;
  }

  if (rows.length === 0) {
    console.log("  ⚠ No notes generated.\n");
    return;
  }

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await ins("instructor_student_notes", rows.slice(i, i + CHUNK));
  }

  console.log(`  ✓ ${rows.length} notes across ${dancerToInstructors.size} dancers\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7e.  FAMILY CONTACTS — a couple of contacts per family for roster testing
// ─────────────────────────────────────────────────────────────────────────────
async function seedFamilyContacts(families: FamilyRow[]) {
  console.log("👪  Seeding family contacts…");

  const rows: Record<string, unknown>[] = [];
  for (const fam of families) {
    const lastName = fam.family_name.replace(" Family", "");
    rows.push(
      {
        id: uid(),
        family_id:   fam.id,
        type:        "alternate_parent",
        first_name:  faker.person.firstName("male"),
        last_name:   lastName,
        phone:       `(555) ${String(faker.number.int({ min: 100, max: 999 }))}-${String(faker.number.int({ min: 1000, max: 9999 }))}`,
        email:       faker.internet.email(),
        relationship: "Father",
        is_authorized_pickup: true,
      },
      {
        id: uid(),
        family_id:   fam.id,
        type:        "emergency_contact",
        first_name:  faker.person.firstName(),
        last_name:   lastName,
        phone:       `(555) ${String(faker.number.int({ min: 100, max: 999 }))}-${String(faker.number.int({ min: 1000, max: 9999 }))}`,
        email:       null,
        relationship: faker.helpers.arrayElement(["Grandmother", "Grandfather", "Aunt", "Uncle"]),
        is_authorized_pickup: false,
      },
    );
  }

  await ins("family_contacts", rows);
  console.log(`  ✓ ${rows.length} family contacts (2 per family)\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8.  WAITLIST ENTRIES
// ─────────────────────────────────────────────────────────────────────────────
async function seedWaitlist(sessions: SessionRow[], dancers: DancerRow[]) {
  console.log("⏳  Seeding waitlist entries…");

  const spring2026 = SEMS.find((s) => s.name === "Spring 2026")!;
  const semSessions = sessions.filter((s) => s.semester_id === spring2026.id);

  // One class_sessions row per schedule now — pick two distinct sessions.
  const targetSess1 = semSessions[0];
  const targetSess2 = semSessions[6];

  if (!targetSess1 || !targetSess2) {
    console.warn("  ⚠ Could not find target sessions for waitlist — skipping.");
    return;
  }

  // Waitlist statuses to distribute across entries
  const statuses1: string[] = ["waiting", "waiting", "invited", "expired"];
  const statuses2: string[] = [
    "waiting",
    "invited",
    "accepted",
    "declined",
    "waiting",
  ];

  const waitlistRows: Record<string, unknown>[] = [];

  for (let i = 0; i < statuses1.length; i++) {
    const dancer = dancers[i]!;
    const status = statuses1[i]!;
    const sentAt =
      status !== "waiting"
        ? new Date(TODAY.getTime() - 2 * 86400_000).toISOString()
        : null;
    const expiresAt = sentAt
      ? new Date(new Date(sentAt).getTime() + 48 * 3600_000).toISOString()
      : null;

    waitlistRows.push({
      id: uid(),
      dancer_id: dancer.id,
      session_id: targetSess1.id,
      position: i + 1,
      status,
      invite_token: uid(),
      invitation_sent_at: sentAt,
      invitation_expires_at: expiresAt,
    });
  }

  for (let i = 0; i < statuses2.length; i++) {
    const dancer = dancers[i + 4]!;
    if (!dancer) break;
    const status = statuses2[i]!;
    const sentAt =
      status !== "waiting"
        ? new Date(TODAY.getTime() - 1 * 86400_000).toISOString()
        : null;
    const expiresAt = sentAt
      ? new Date(new Date(sentAt).getTime() + 48 * 3600_000).toISOString()
      : null;

    waitlistRows.push({
      id: uid(),
      dancer_id: dancer.id,
      session_id: targetSess2.id,
      position: i + 1,
      status,
      invite_token: uid(),
      invitation_sent_at: sentAt,
      invitation_expires_at: expiresAt,
    });
  }

  await ins("waitlist_entries", waitlistRows);
  console.log(
    `  ✓ ${waitlistRows.length} waitlist entries across 2 Spring 2026 sessions\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9.  BROADCAST EMAILS — full coverage for every dashboard tab
//     Drafts (8) · Scheduled (2) · Sent (3) · Failed (1) · Templates (5)
// ─────────────────────────────────────────────────────────────────────────────
async function seedEmails(users: UserRow[]) {
  console.log("📧  Seeding emails: drafts, scheduled, sent (w/ analytics), failed, templates…");

  const spring2026Sem = SEMS.find((s) => s.name === "Spring 2026")!;
  const summer2026Sem = SEMS.find((s) => s.name === "Summer 2026") ?? spring2026Sem;
  const fall2026Sem   = SEMS.find((s) => s.name === "Fall 2026")   ?? spring2026Sem;

  const BASE = {
    body_json: {},
    created_by_admin_id: ETHAN_ID,
    updated_by_admin_id: ETHAN_ID,
    reply_to_email: "hello@aydt.com",
    include_signature: true,
    sender_name: "AYDT Studio",
    sender_email: "hello@aydt.com",
  };

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Build N email_recipients rows for an email.
   * The first `users.length` rows use real seeded users; remaining rows use
   * generated fake email addresses (no user_id) for realistic volume.
   */
  function makeRecipients(emailId: string, count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, i) => {
      const u = users[i % users.length]!;
      const useReal = i < users.length;
      const firstName = useReal ? u.first_name : faker.person.firstName();
      const lastName  = useReal ? u.last_name  : faker.person.lastName();
      const email     = useReal
        ? u.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
      return {
        id:            uid(),
        email_id:      emailId,
        user_id:       useReal ? u.id : null,
        email_address: email,
        first_name:    firstName,
        last_name:     lastName,
        dancer_context: [],
      };
    });
  }

  /**
   * Build email_deliveries for a sent email.
   * First `openCount` rows get opened_at; first `clickCount` rows also get clicked_at.
   * Last row bounces if count > 10.
   */
  function makeDeliveries(
    emailId: string,
    recipients: Record<string, unknown>[],
    openCount: number,
    clickCount: number,
    sentAt: string,
  ): Record<string, unknown>[] {
    const sentMs = new Date(sentAt).getTime();
    return recipients.map((r, i) => {
      const bounced   = i === recipients.length - 1 && recipients.length > 10;
      const opened    = !bounced && i < openCount;
      const clicked   = !bounced && i < clickCount;
      const delivMs   = sentMs + 5 * 60_000;
      const openedMs  = opened  ? sentMs + faker.number.int({ min: 30, max: 180 }) * 60_000 : null;
      const clickedMs = clicked && openedMs ? openedMs + faker.number.int({ min: 2, max: 30 }) * 60_000 : null;
      return {
        id:                uid(),
        email_id:          emailId,
        user_id:           r.user_id as string | null,
        subscriber_id:     null,
        email_address:     r.email_address as string,
        resend_message_id: bounced ? null : `re_${faker.string.alphanumeric(20)}`,
        status:            bounced ? "bounced" : "delivered",
        delivered_at:      bounced ? null : new Date(delivMs).toISOString(),
        bounced_at:        bounced ? new Date(sentMs + 3 * 60_000).toISOString() : null,
        failure_reason:    null,
        opened_at:         openedMs  ? new Date(openedMs).toISOString()  : null,
        clicked_at:        clickedMs ? new Date(clickedMs).toISOString() : null,
      };
    });
  }

  // ── 1. DRAFTS (8 total — 6 named, 2 unsaved) ─────────────────────────────

  const draftDefs = [
    {
      id: uid(), subject: "Spring 2026 Registration is Now Open!",
      body_html: "<h1>Registration is Open!</h1><p>Spring 2026 registration is now live. Spots fill fast — enroll your dancer today!</p>",
      created_at: "2026-03-13T14:14:00Z", updated_at: "2026-03-13T15:14:00Z",
    },
    {
      id: uid(), subject: "Comp Invite — Spring 2026",
      body_html: "<h1>Competition Track Invitation</h1><p>Your dancer has been selected for the Spring 2026 Competition Track. Please confirm your spot by March 25th.</p>",
      created_at: "2026-03-13T14:14:00Z", updated_at: "2026-03-13T15:14:00Z",
    },
    {
      id: uid(), subject: "Summer 2026 Enrollment Preview",
      body_html: "<h1>Summer is Coming!</h1><p>Get a sneak peek at our Summer 2026 class schedule. Priority enrollment for current students opens April 1st.</p>",
      created_at: "2026-03-12T10:00:00Z", updated_at: "2026-03-12T10:00:00Z",
    },
    {
      id: uid(), subject: "Ballet Showcase — Ticket Information",
      body_html: "<h1>Tickets on Sale</h1><p>Tickets for the Spring 2026 Ballet Showcase are now on sale. Each family may purchase up to 4 tickets per dancer.</p>",
      created_at: "2026-03-10T14:00:00Z", updated_at: "2026-03-10T14:00:00Z",
    },
    {
      id: uid(), subject: "Studio Closure — Spring Break",
      body_html: "<h1>Spring Break Closure</h1><p>AYDT will be closed April 14–20 for Spring Break. Classes resume April 21st. Enjoy the break!</p>",
      created_at: "2026-03-08T11:00:00Z", updated_at: "2026-03-08T11:00:00Z",
    },
    {
      id: uid(), subject: "End-of-Year Recital Details",
      body_html: "<h1>Recital Information</h1><p>Mark your calendars! The 2026 End-of-Year Recital is June 14th at the Downtown Performing Arts Center.</p>",
      created_at: "2026-03-05T09:00:00Z", updated_at: "2026-03-16T09:00:00Z",
    },
    // 2 unsaved drafts (no subject)
    { id: uid(), subject: "", body_html: "", created_at: "2026-03-13T12:30:00Z", updated_at: "2026-03-13T13:37:00Z" },
    { id: uid(), subject: "", body_html: "", created_at: "2026-03-13T12:37:00Z", updated_at: "2026-03-13T13:37:00Z" },
  ];

  await ins("emails", draftDefs.map((e) => ({ ...BASE, status: "draft", ...e })));

  // Recipient selections for the 2 named drafts
  await ins("email_recipient_selections", [
    { id: uid(), email_id: draftDefs[0]!.id, selection_type: "semester", semester_id: spring2026Sem.id, is_excluded: false },
    { id: uid(), email_id: draftDefs[1]!.id, selection_type: "semester", semester_id: spring2026Sem.id, is_excluded: false },
  ]);

  // ── 2. SCHEDULED (2) ─────────────────────────────────────────────────────

  const scheduledDefs = [
    {
      id: uid(), subject: "Summer 2026 — Early Registration",
      body_html: "<h1>Early Registration Open</h1><p>Summer 2026 priority enrollment is now open for Spring 2026 families. Secure your spot before April 1st.</p>",
      scheduled_at: "2026-03-20T09:00:00Z",
      created_at: "2026-03-15T10:00:00Z", updated_at: "2026-03-15T11:00:00Z",
      semId: summer2026Sem.id,
    },
    {
      id: uid(), subject: "Fall 2026 Save the Date",
      body_html: "<h1>Fall 2026 Save the Date!</h1><p>Fall 2026 enrollment opens May 1st. Watch your inbox for class announcements and early-bird pricing!</p>",
      scheduled_at: "2026-04-01T09:00:00Z",
      created_at: "2026-03-14T09:00:00Z", updated_at: "2026-03-14T09:30:00Z",
      semId: fall2026Sem.id,
    },
  ];

  await ins("emails", scheduledDefs.map(({ semId: _s, ...e }) => ({ ...BASE, status: "scheduled", ...e })));

  await ins("email_recipient_selections", scheduledDefs.map((e) => ({
    id: uid(), email_id: e.id, selection_type: "semester", semester_id: e.semId, is_excluded: false,
  })));

  // Add fake recipients for scheduled emails so the right-panel count is non-zero
  const scheduledRecipients: Record<string, unknown>[] = [
    ...makeRecipients(scheduledDefs[0]!.id, 30),
    ...makeRecipients(scheduledDefs[1]!.id, 36),
  ];
  await ins("email_recipients", scheduledRecipients);

  // ── 3. SENT (3) — with email_recipients + email_deliveries for analytics ──

  type SentDef = {
    id: string; subject: string; body_html: string;
    sent_at: string; created_at: string; updated_at: string;
    recipientCount: number; openCount: number; clickCount: number;
  };

  const sentDefs: SentDef[] = [
    {
      id: uid(),
      subject:    "Spring 2026 registration is now open!",
      body_html:  "<h1>Spring 2026 is Here!</h1><p>Hi {{parent.firstName}}, Spring 2026 registration is officially open. Log in to enroll {{dancers.0.dancerName}} before spots fill up!</p>",
      sent_at:    "2026-01-10T09:00:00Z",
      created_at: "2026-01-08T14:00:00Z", updated_at: "2026-01-10T09:00:00Z",
      recipientCount: 100, openCount: 68, clickCount: 14,
    },
    {
      id: uid(),
      subject:    "Reminder: balance due Feb 1",
      body_html:  "<h1>Balance Due Feb 1</h1><p>Hi {{parent.firstName}}, this is a friendly reminder that your Spring 2026 balance is due February 1st. Log in to make a payment.</p>",
      sent_at:    "2026-01-28T09:00:00Z",
      created_at: "2026-01-25T10:00:00Z", updated_at: "2026-01-28T09:00:00Z",
      recipientCount: 83, openCount: 45, clickCount: 7,
    },
    {
      id: uid(),
      subject:    "Welcome to AYDT — Spring 2026",
      body_html:  "<h1>Welcome to AYDT!</h1><p>Hi {{parent.firstName}}, welcome to the AYDT family! Your Spring 2026 enrollment for {{dancers.0.dancerName}} is confirmed. See you on the first day!</p>",
      sent_at:    "2026-01-26T08:00:00Z",
      created_at: "2026-01-24T09:00:00Z", updated_at: "2026-01-26T08:00:00Z",
      recipientCount: 88, openCount: 72, clickCount: 19,
    },
  ];

  await ins("emails", sentDefs.map(({ recipientCount: _r, openCount: _o, clickCount: _c, ...e }) => ({
    ...BASE, status: "sent", ...e,
  })));

  const sentRecipients: Record<string, unknown>[] = [];
  const sentDeliveries: Record<string, unknown>[] = [];
  for (const def of sentDefs) {
    const recs = makeRecipients(def.id, def.recipientCount);
    const dels = makeDeliveries(def.id, recs, def.openCount, def.clickCount, def.sent_at);
    sentRecipients.push(...recs);
    sentDeliveries.push(...dels);
  }
  await ins("email_recipients", sentRecipients);
  await ins("email_deliveries", sentDeliveries);

  // ── 4. FAILED (1) — all deliveries failed ────────────────────────────────

  const failedId = uid();
  await ins("emails", [{
    ...BASE, status: "failed",
    id:         failedId,
    subject:    "Balance reminder — March",
    body_html:  "<h1>March Balance Reminder</h1><p>Hi {{parent.firstName}}, a friendly reminder that your March balance is now due. Please log in to make a payment.</p>",
    created_at: "2026-03-11T10:00:00Z",
    updated_at: "2026-03-12T09:00:00Z",
  }]);

  const failedRecs = makeRecipients(failedId, 40);
  await ins("email_recipients", failedRecs);
  await ins("email_deliveries", failedRecs.map((r) => ({
    id:                uid(),
    email_id:          failedId,
    user_id:           r.user_id as string | null,
    subscriber_id:     null,
    email_address:     r.email_address as string,
    resend_message_id: null,
    status:            "failed",
    delivered_at:      null,
    bounced_at:        null,
    failure_reason:    "Resend API error: Webhook timeout",
    opened_at:         null,
    clicked_at:        null,
  })));

  // ── 5. EMAIL TEMPLATES (5) ────────────────────────────────────────────────

  await ins("email_templates", [
    {
      id: uid(), name: "Registration open",
      subject:  "{{semester.name}} Registration is Now Open!",
      body_html: "<h1>Registration is Open!</h1><p>Hi {{parent.firstName}}, {{semester.name}} registration is live. Enroll {{dancers.0.dancerName}} today before spots fill up!</p>",
      body_json: {}, created_by_admin_id: ETHAN_ID, updated_by_admin_id: ETHAN_ID,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: uid(), name: "Balance reminder",
      subject:  "Your balance is due — please review",
      body_html: "<h1>Balance Due</h1><p>Hi {{parent.firstName}}, your account has an outstanding balance. Please log in to review and pay at your earliest convenience.</p>",
      body_json: {}, created_by_admin_id: ETHAN_ID, updated_by_admin_id: ETHAN_ID,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: uid(), name: "Comp invite",
      subject:  "You're invited — Competition Track",
      body_html: "<h1>Competition Track Invitation</h1><p>Hi {{parent.firstName}}, congratulations! {{dancers.0.dancerName}} has been selected for the Competition Track. Please confirm acceptance by clicking below.</p>",
      body_json: {}, created_by_admin_id: ETHAN_ID, updated_by_admin_id: ETHAN_ID,
      created_at: "2026-02-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z",
    },
    {
      id: uid(), name: "Waitlist invite",
      subject:  "Your waitlist spot is available — 48 hours to accept",
      body_html: "<h1>Spot Available!</h1><p>Hi {{parent.firstName}}, a spot has opened in the class {{dancers.0.dancerName}} is waitlisted for. You have 48 hours to accept before the offer expires.</p>",
      body_json: {}, created_by_admin_id: ETHAN_ID, updated_by_admin_id: ETHAN_ID,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: uid(), name: "Welcome email",
      subject:  "Welcome to AYDT — here are your class details",
      body_html: "<h1>Welcome to AYDT!</h1><p>Hi {{parent.firstName}}, welcome to the AYDT family! Here are the enrollment details for {{dancers.0.dancerName}}. We look forward to seeing you in class!</p>",
      body_json: {}, created_by_admin_id: ETHAN_ID, updated_by_admin_id: ETHAN_ID,
      created_at: "2026-02-15T00:00:00Z", updated_at: "2026-02-15T00:00:00Z",
    },
  ]);

  // ── 6. ACTIVITY LOGS ──────────────────────────────────────────────────────

  const logs: Record<string, unknown>[] = [];

  for (const e of draftDefs) {
    logs.push({ id: uid(), email_id: e.id, action: "created", admin_id: ETHAN_ID, metadata: {} });
  }
  for (const e of scheduledDefs) {
    logs.push({ id: uid(), email_id: e.id, action: "created",   admin_id: ETHAN_ID, metadata: {} });
    logs.push({ id: uid(), email_id: e.id, action: "scheduled", admin_id: ETHAN_ID, metadata: { scheduled_at: e.scheduled_at } });
  }
  for (const e of sentDefs) {
    logs.push({ id: uid(), email_id: e.id, action: "created", admin_id: ETHAN_ID, metadata: {} });
    logs.push({ id: uid(), email_id: e.id, action: "sent",    admin_id: ETHAN_ID, metadata: { recipient_count: e.recipientCount } });
  }
  logs.push({ id: uid(), email_id: failedId, action: "created", admin_id: ETHAN_ID, metadata: {} });
  logs.push({ id: uid(), email_id: failedId, action: "sent",    admin_id: ETHAN_ID, metadata: { note: "send job initiated" } });

  await ins("email_activity_logs", logs);

  // ── 7. EXTERNAL EMAIL SUBSCRIBERS (3) ────────────────────────────────────

  await ins("email_subscribers", [
    { id: uid(), email: "parent.external@example.com", name: "Sandra Kim",   phone: null,           created_at: "2026-01-15T00:00:00Z", created_by: ETHAN_ID },
    { id: uid(), email: "dance.friend@example.com",    name: "Marcus Webb",  phone: "+18085550001",  created_at: "2026-02-10T00:00:00Z", created_by: ETHAN_ID },
    { id: uid(), email: "studio.partner@example.com",  name: "The Arts Hub", phone: null,           created_at: "2026-03-01T00:00:00Z", created_by: ETHAN_ID },
  ]);

  // ── 8. UNSUBSCRIBE 2 PARENT USERS ────────────────────────────────────────

  if (users.length >= 2) {
    const last  = users[users.length - 1]!;
    const prev  = users[users.length - 2]!;
    await sb.from("email_subscriptions").update({ is_subscribed: false, unsubscribed_at: "2026-02-15T12:00:00Z" }).eq("user_id", last.id);
    await sb.from("email_subscriptions").update({ is_subscribed: false, unsubscribed_at: "2026-03-01T08:00:00Z" }).eq("user_id", prev.id);
  }

  const totalRecs = scheduledRecipients.length + sentRecipients.length + failedRecs.length;
  const totalDels = sentDeliveries.length + failedRecs.length;
  console.log(
    `  ✓ 8 drafts · 2 scheduled · 3 sent · 1 failed\n` +
    `  ✓ 5 email templates\n` +
    `  ✓ ${totalRecs} recipient rows · ${totalDels} delivery rows\n` +
    `  ✓ open rates ~68% / ~54% / ~82% — click rates ~14% / ~8% / ~22%\n`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SESSION GROUPS (Spring 2026 — two curated groups for the UI)
// ─────────────────────────────────────────────────────────────────────────────
async function seedSessionGroups(sessions: SessionRow[]) {
  console.log(
    "🗂️   Seeding session groups for Fall 2026 (scheduled — no registrations)…",
  );

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
  const orderedScheduleIds = [
    ...new Set(semSessions.map((s) => s.schedule_id)),
  ];
  const firstSessions = orderedScheduleIds.map(
    (sid) => firstBySchedule.get(sid) ?? null,
  );

  const group1Id = uid();
  const group2Id = uid();

  await ins("session_groups", [
    {
      id: group1Id,
      semester_id: fall2026.id,
      name: "Early Childhood Bundle",
      description:
        "Creative Movement + Pre-Ballet combined package for ages 4–7.",
    },
    {
      id: group2Id,
      semester_id: fall2026.id,
      name: "Junior Performance Track",
      description:
        "Ballet Foundations, Jazz Performance, and Tap Technique for aspiring junior performers.",
    },
  ]);

  // session_group_sessions.session_id → class_sessions(id)
  await ins("session_group_sessions", [
    {
      id: uid(),
      session_group_id: group1Id,
      session_id: firstSessions[0] ?? null,
    }, // Creative Movement
    {
      id: uid(),
      session_group_id: group1Id,
      session_id: firstSessions[1] ?? null,
    }, // Pre-Ballet
    {
      id: uid(),
      session_group_id: group2Id,
      session_id: firstSessions[2] ?? null,
    }, // Ballet Foundations
    {
      id: uid(),
      session_group_id: group2Id,
      session_id: firstSessions[4] ?? null,
    }, // Jazz Performance
    {
      id: uid(),
      session_group_id: group2Id,
      session_id: firstSessions[3] ?? null,
    }, // Tap Technique
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
    if (!bySchedule.has(sess.schedule_id))
      bySchedule.set(sess.schedule_id, sess);
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

  const contemporaryClass = semClasses.find(
    (c) => c.name === "Contemporary & Lyrical",
  );
  const musicalClass = semClasses.find(
    (c) => c.name === "Musical Theatre Intensive",
  );

  const reqs: Record<string, unknown>[] = [];

  if (contemporaryClass) {
    reqs.push({
      id: uid(),
      class_id: contemporaryClass.id,
      requirement_type: "prerequisite_completed",
      required_discipline: "ballet",
      required_level: "Level 1",
      required_class_id: null,
      description:
        "Dancers should have at least one year of formal ballet or jazz training.",
      enforcement: "soft_warn",
      is_waivable: true,
    });
  }

  if (musicalClass) {
    reqs.push({
      id: uid(),
      class_id: musicalClass.id,
      requirement_type: "audition_required",
      required_discipline: null,
      required_level: null,
      required_class_id: null,
      description:
        "An audition or teacher recommendation is required for placement in the Musical Theatre Intensive.",
      enforcement: "hard_block",
      is_waivable: true,
    });
  }

  if (reqs.length) await ins("class_requirements", reqs);
  console.log(`  ✓ ${reqs.length} class requirements\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. AYDT CLASS CATALOG (real class names, requirements — Fall 2026 scheduled)
// ─────────────────────────────────────────────────────────────────────────────
// Seeds the full AYDT class catalog into the Fall 2026 (scheduled) semester as
// bare class entities (no schedules or sessions). Admins configure sessions via
// the SessionsStep UI. This function is idempotent relative to the catalog.
//
// Class names match docs/CLASS_CATALOG.md exactly (no asterisks).
// ─────────────────────────────────────────────────────────────────────────────
async function seedAYDTClassCatalog() {
  console.log("📚  Seeding AYDT class catalog (all disciplines)…");

  const fall2026 = SEMS.find((s) => s.name === "Fall 2026");
  if (!fall2026) {
    console.warn("  ⚠ Fall 2026 semester not found — skipping catalog seed");
    return;
  }

  const semId = fall2026.id;

  // Helper to build a class row. Schedules/sessions are NOT created here —
  // they are added by admins in the SessionsStep UI per semester.
  type CatalogClass = {
    name: string;
    discipline: string;
    division: string;
    level?: string | null;
    min_age?: number | null;
    max_age?: number | null;
    min_age_months?: number | null;
    max_age_months?: number | null;
    min_grade?: number | null;
    max_grade?: number | null;
    requires_teacher_rec?: boolean;
    requires_parent_accompaniment?: boolean;
    registration_note?: string | null;
    requirements?: {
      requirement_type: string;
      enforcement: string;
      is_waivable: boolean;
      description: string;
      required_discipline?: string | null;
      required_level?: string | null;
    }[];
  };

  const REHEARSAL_NOTE =
    "See calendar for dates of mandatory Saturday holiday recital rehearsals.";
  const PLACEMENT_NOTE =
    "Placement in higher level classes is by teacher recommendation or audition.";
  const REHEARSAL_AND_PLACEMENT = `${PLACEMENT_NOTE} ${REHEARSAL_NOTE}`;

  const catalog: CatalogClass[] = [
    // ── BALLET — Early Childhood ────────────────────────────────────────────
    {
      name: "First Steps",
      discipline: "ballet",
      division: "early_childhood",
      min_age_months: 18,
      max_age_months: 26,
      requires_parent_accompaniment: true,
      registration_note:
        "Class is divided into two 9-week sessions. Twins must be accompanied by two separate adults.",
      requirements: [
        {
          requirement_type: "parent_accompaniment",
          enforcement: "hard_block",
          is_waivable: false,
          description:
            "A parent or caregiver must accompany your dancer in class for the full duration of every session.",
        },
      ],
    },
    {
      name: "Dance with Me",
      discipline: "ballet",
      division: "early_childhood",
      min_age_months: 27,
      max_age_months: 36,
      requires_parent_accompaniment: true,
      registration_note:
        "Class is divided into two 9-week sessions. Twins must be accompanied by two separate adults.",
      requirements: [
        {
          requirement_type: "parent_accompaniment",
          enforcement: "hard_block",
          is_waivable: false,
          description:
            "A parent or caregiver must accompany your dancer in class for the full duration of every session.",
        },
      ],
    },

    // ── BALLET — Pre-Ballet ─────────────────────────────────────────────────
    {
      name: "Pre-Ballet 1",
      discipline: "ballet",
      division: "junior",
      level: "1",
      min_age: 3,
      min_grade: -2,
      max_grade: -2,
      registration_note:
        "Dancer must be at least 3 years old by September 1st.",
    },
    {
      name: "Pre-Ballet 2",
      discipline: "ballet",
      division: "junior",
      level: "2",
      min_age: 4,
      max_age: 4,
      min_grade: -1,
      max_grade: -1,
    },
    {
      name: "Pre-Ballet 3",
      discipline: "ballet",
      division: "junior",
      level: "3",
      min_grade: 0,
      max_grade: 0,
    },

    // ── BALLET — Junior ─────────────────────────────────────────────────────
    {
      name: "Ballet 1A",
      discipline: "ballet",
      division: "junior",
      level: "1A",
      min_grade: 1,
      max_grade: 2,
      registration_note: REHEARSAL_NOTE,
    },
    {
      name: "Ballet 1B",
      discipline: "ballet",
      division: "junior",
      level: "1B",
      min_grade: 2,
      max_grade: 3,
      registration_note: REHEARSAL_NOTE,
    },
    {
      name: "Ballet 2",
      discipline: "ballet",
      division: "junior",
      level: "2",
      min_grade: 3,
      max_grade: 4,
      registration_note: REHEARSAL_NOTE,
    },

    // ── BALLET — Open Level ─────────────────────────────────────────────────
    {
      name: "Open Ballet 3",
      discipline: "ballet",
      division: "senior",
      level: "Open 3",
      min_grade: 4,
      registration_note: `${REHEARSAL_NOTE} This is a 2–3 year program.`,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          description:
            "Open Ballet 3 is a recreational or supplemental class. No prior ballet experience is required.",
        },
      ],
    },
    {
      name: "Open Ballet 4",
      discipline: "ballet",
      division: "senior",
      level: "Open 4",
      min_grade: 6,
      registration_note: `${REHEARSAL_NOTE} This is a 2–3 year program. Older beginners welcome.`,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          required_level: "Open 3",
          description:
            "Dancer should have completed 2–3 years of Open Ballet 3 or equivalent. Older beginners are welcome but may require supplemental private lessons.",
        },
      ],
    },
    {
      name: "Open Ballet 5",
      discipline: "ballet",
      division: "senior",
      level: "Open 5",
      min_grade: 8,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Older beginners welcome.`,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          required_level: "Open 4",
          description:
            "Dancer should have completed 2–3 years of Open Ballet 4 or equivalent.",
        },
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Open Ballet 5 is by teacher recommendation or audition only. Contact the studio to confirm your placement.",
        },
      ],
    },
    {
      name: "Open Intermediate Ballet",
      discipline: "ballet",
      division: "senior",
      level: "Open Intermediate",
      min_grade: 8,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: REHEARSAL_NOTE,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          required_level: "Open 5",
          description:
            "Dancer should have completed 2–3 years of Open Ballet 5 or equivalent.",
        },
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Open Intermediate Ballet is by teacher recommendation or audition only. A second weekly class (Open Ballet 5 or Technique 1) is required as recommended by your teacher.",
        },
      ],
    },

    // ── BALLET — Graded ─────────────────────────────────────────────────────
    {
      name: "Graded Ballet 3",
      discipline: "ballet",
      division: "senior",
      level: "Graded 3",
      min_grade: 4,
      max_grade: 7,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Graded Ballet meets twice per week.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Enrollment in Graded Ballet 3 is by faculty recommendation or audition only. Contact the studio to confirm your placement.",
        },
      ],
    },
    {
      name: "Graded Ballet 4",
      discipline: "ballet",
      division: "senior",
      level: "Graded 4",
      min_grade: 5,
      max_grade: 8,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Graded Ballet meets twice per week.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Enrollment in Graded Ballet 4 is by faculty recommendation or audition only.",
        },
      ],
    },
    {
      name: "Graded Ballet 5",
      discipline: "ballet",
      division: "senior",
      level: "Graded 5",
      min_grade: 6,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Graded Ballet 5 meets three times per week. The third class must be Ballet 4, Open Ballet 4–5, or Technique 1 (teacher recommends).`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Enrollment in Graded Ballet 5 is by faculty recommendation or audition only.",
        },
      ],
    },
    {
      name: "Intermediate Ballet A",
      discipline: "ballet",
      division: "senior",
      level: "Intermediate A",
      min_grade: 7,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Intermediate Ballet meets three times per week. The third class must be Technique 1, 2, or 3.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Enrollment in Intermediate Ballet A is by faculty recommendation or audition only.",
        },
      ],
    },
    {
      name: "Intermediate Ballet B",
      discipline: "ballet",
      division: "senior",
      level: "Intermediate B",
      min_grade: 7,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Intermediate Ballet meets three times per week. The third class must be Technique 1, 2, or 3.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Enrollment in Intermediate Ballet B is by faculty recommendation or audition only.",
        },
      ],
    },
    {
      name: "Advanced Intermediate Ballet",
      discipline: "ballet",
      division: "senior",
      level: "Advanced Intermediate",
      min_grade: 10,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${REHEARSAL_NOTE} Requires three ballet classes plus one Broadway or Contemporary class.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Enrollment in Advanced Intermediate Ballet is by faculty recommendation or audition only.",
        },
      ],
    },

    // ── BALLET — Technique ──────────────────────────────────────────────────
    {
      name: "Technique 1",
      discipline: "technique",
      division: "senior",
      level: "1",
      requires_teacher_rec: true,
      registration_note:
        "Technique classes do not include a recital dance. Placement by teacher recommendation or audition.",
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Technique 1 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Technique 2",
      discipline: "technique",
      division: "senior",
      level: "2",
      requires_teacher_rec: true,
      registration_note:
        "Technique classes do not include a recital dance. Placement by teacher recommendation or audition.",
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Technique 2 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Technique 3",
      discipline: "technique",
      division: "senior",
      level: "3",
      requires_teacher_rec: true,
      registration_note:
        "Technique classes do not include a recital dance. Placement by teacher recommendation or audition.",
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Technique 3 is by teacher recommendation or audition only.",
        },
      ],
    },

    // ── BALLET — Pointe ─────────────────────────────────────────────────────
    {
      name: "Pre-Pointe — Beginner",
      discipline: "pointe",
      division: "senior",
      level: "Pre-Pointe Beginner",
      requires_teacher_rec: true,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Pre-Pointe Beginner is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Pre-Pointe — Beginner Intermediate",
      discipline: "pointe",
      division: "senior",
      level: "Pre-Pointe Beginner-Intermediate",
      requires_teacher_rec: true,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Pre-Pointe Beginner Intermediate is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Pre-Pointe — Intermediate Advanced",
      discipline: "pointe",
      division: "senior",
      level: "Pre-Pointe Intermediate-Advanced",
      requires_teacher_rec: true,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Pre-Pointe Intermediate Advanced is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Intermediate Advanced Pointe",
      discipline: "pointe",
      division: "senior",
      level: "Intermediate Advanced",
      requires_teacher_rec: true,
      registration_note:
        "This class meets immediately following your associated ballet class session.",
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Intermediate Advanced Pointe is by teacher recommendation or audition only. Dancer must be technically strong enough as assessed by faculty.",
        },
      ],
    },

    // ── CONTEMPORARY ────────────────────────────────────────────────────────
    {
      name: "Contemporary 1",
      discipline: "contemporary",
      division: "senior",
      level: "1",
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          required_level: "Open 5",
          description:
            "Contemporary is available to students in Ballet 5 / Open Ballet 5 or above.",
        },
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Contemporary 1 is by teacher recommendation or audition only.",
        },
        {
          requirement_type: "concurrent_enrollment",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          description:
            "Contemporary is designed as an additional weekly class to complement your primary ballet training.",
        },
      ],
    },
    {
      name: "Contemporary 2",
      discipline: "contemporary",
      division: "senior",
      level: "2",
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          required_level: "Open 5",
          description:
            "Contemporary is available to students in Ballet 5 / Open Ballet 5 or above.",
        },
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Contemporary 2 is by teacher recommendation or audition only.",
        },
        {
          requirement_type: "concurrent_enrollment",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "ballet",
          description:
            "Contemporary is designed as an additional weekly class to complement your primary ballet training.",
        },
      ],
    },

    // ── TAP ─────────────────────────────────────────────────────────────────
    {
      name: "Tap Intro",
      discipline: "tap",
      division: "junior",
      min_grade: -1,
      max_grade: 0,
      min_age: 4,
      registration_note:
        "Dancer must be at least 4 years old by September 1st.",
    },
    {
      name: "Tap 1A",
      discipline: "tap",
      division: "junior",
      min_grade: 1,
      max_grade: 3,
    },
    {
      name: "Tap 1B",
      discipline: "tap",
      division: "junior",
      min_grade: 3,
      max_grade: 6,
    },
    {
      name: "Open Level Tap",
      discipline: "tap",
      division: "senior",
      min_grade: 5,
    },
    {
      name: "Tap 2",
      discipline: "tap",
      division: "senior",
      min_grade: 4,
      max_grade: 7,
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Tap 2 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Tap 3",
      discipline: "tap",
      division: "senior",
      min_grade: 4,
      max_grade: 8,
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Tap 3 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Intermediate Tap",
      discipline: "tap",
      division: "senior",
      min_grade: 6,
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Intermediate Tap is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Advanced Intermediate Tap",
      discipline: "tap",
      division: "senior",
      min_grade: 7,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: REHEARSAL_AND_PLACEMENT,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Advanced Intermediate Tap is by teacher recommendation or audition only. A second weekly class in Ballet, Broadway, or Hip Hop is required.",
        },
      ],
    },
    {
      name: "Advanced Tap",
      discipline: "tap",
      division: "senior",
      min_grade: 9,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: REHEARSAL_AND_PLACEMENT,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Advanced Tap is by teacher recommendation or audition only. A second weekly class in Ballet, Broadway, or Hip Hop is required.",
        },
      ],
    },

    // ── BROADWAY ────────────────────────────────────────────────────────────
    {
      name: "Broadway 1",
      discipline: "broadway",
      division: "junior",
      min_grade: 3,
      max_grade: 5,
      registration_note: "This is a 2–3 year program.",
    },
    {
      name: "Open Broadway 1",
      discipline: "broadway",
      division: "senior",
      min_grade: 5,
      registration_note: "This is a 2–3 year program. Open to beginners.",
    },
    {
      name: "Open Broadway 2",
      discipline: "broadway",
      division: "senior",
      min_grade: 6,
      registration_note:
        "Designed for students who prefer not to add a required ballet or tap class.",
    },
    {
      name: "Open Broadway 3",
      discipline: "broadway",
      division: "senior",
      min_grade: 8,
      max_grade: 12,
      registration_note:
        "Older beginners welcome; private lessons may be recommended by your teacher.",
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          required_discipline: "broadway",
          required_level: "Open 2",
          description:
            "Dancer should have completed two years of Open Broadway 2 or equivalent.",
        },
      ],
    },
    {
      name: "Broadway 2",
      discipline: "broadway",
      division: "senior",
      min_grade: 4,
      max_grade: 7,
      requires_teacher_rec: true,
      registration_note: `This is a 2–3 year program. ${PLACEMENT_NOTE}`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Broadway 2 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Broadway 3",
      discipline: "broadway",
      division: "senior",
      min_grade: 5,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${PLACEMENT_NOTE} Two classes per week required; second class must be ballet or tap.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Broadway 3 is by teacher recommendation or audition only. A second weekly class in Ballet or Tap is required.",
        },
      ],
    },
    {
      name: "Broadway 4",
      discipline: "broadway",
      division: "senior",
      min_grade: 7,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${PLACEMENT_NOTE} Additional class must be ballet.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Broadway 4 is by teacher recommendation or audition only.",
        },
        {
          requirement_type: "concurrent_enrollment",
          enforcement: "hard_block",
          is_waivable: true,
          required_discipline: "ballet",
          description: "Dancer must also be enrolled in a ballet class.",
        },
      ],
    },
    {
      name: "Broadway 5",
      discipline: "broadway",
      division: "senior",
      min_grade: 8,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: `${PLACEMENT_NOTE} Three classes per week required; additional classes must be two ballet classes OR one ballet and one tap.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Broadway 5 is by teacher recommendation or audition only. Three weekly classes are required.",
        },
      ],
    },

    // ── HIP HOP ─────────────────────────────────────────────────────────────
    {
      name: "Hip Hop Intro",
      discipline: "hip_hop",
      division: "junior",
      min_grade: -1,
      max_grade: 0,
      min_age: 4,
      registration_note:
        "Dancer must be at least 4 years old by September 1st.",
    },
    {
      name: "Hip Hop 1",
      discipline: "hip_hop",
      division: "junior",
      min_grade: 1,
      max_grade: 2,
    },
    {
      name: "Hip Hop 2",
      discipline: "hip_hop",
      division: "junior",
      min_grade: 3,
      max_grade: 4,
    },
    {
      name: "Hip Hop 3",
      discipline: "hip_hop",
      division: "junior",
      min_grade: 5,
      max_grade: 7,
    },
    {
      name: "Hip Hop 4",
      discipline: "hip_hop",
      division: "senior",
      min_grade: 7,
      max_grade: 9,
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Hip Hop 4 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Open Hip Hop 5",
      discipline: "hip_hop",
      division: "senior",
      min_grade: 10,
      max_grade: 12,
      requirements: [
        {
          requirement_type: "prerequisite_completed",
          enforcement: "soft_warn",
          is_waivable: true,
          description:
            "Open Hip Hop 5 is open to all students — no prior training required.",
        },
      ],
    },
    {
      name: "Hip Hop 5",
      discipline: "hip_hop",
      division: "senior",
      min_grade: 10,
      max_grade: 12,
      requires_teacher_rec: true,
      registration_note: PLACEMENT_NOTE,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Hip Hop 5 is by teacher recommendation or audition only.",
        },
      ],
    },
    {
      name: "Intermediate Hip Hop",
      discipline: "hip_hop",
      division: "senior",
      requires_teacher_rec: true,
      registration_note: `${PLACEMENT_NOTE} Two classes per week required; second class may be in any discipline.`,
      requirements: [
        {
          requirement_type: "teacher_recommendation",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Placement in Intermediate Hip Hop is by teacher recommendation or audition only.",
        },
        {
          requirement_type: "concurrent_enrollment",
          enforcement: "hard_block",
          is_waivable: true,
          description:
            "Dancer must also be enrolled in a second weekly class in any discipline.",
        },
      ],
    },
    {
      name: "Boys Hip Hop Breakdance 1/2",
      discipline: "hip_hop",
      division: "junior",
      min_age: 6,
      max_age: 10,
      registration_note:
        "This class is designed for boys ages 6–10 and is taught by a male instructor. Two levels are offered in this combined class.",
    },
    {
      name: "Boys Hip Hop Breakdance 3/4",
      discipline: "hip_hop",
      division: "senior",
      min_age: 11,
      registration_note:
        "This class is designed for boys ages 11 through teens and is taught by a male instructor. Two levels are offered in this combined class.",
    },
  ];

  const classRows: Record<string, unknown>[] = [];
  const reqRows: Record<string, unknown>[] = [];

  for (const c of catalog) {
    const classId = uid();
    classRows.push({
      id: classId,
      semester_id: semId,
      name: c.name,
      discipline: c.discipline,
      division: c.division,
      description: null,
      min_age: c.min_age ?? null,
      max_age: c.max_age ?? null,
      min_age_months: c.min_age_months ?? null,
      max_age_months: c.max_age_months ?? null,
      min_grade: c.min_grade ?? null,
      max_grade: c.max_grade ?? null,
      is_competition_track: false,
      requires_teacher_rec: c.requires_teacher_rec ?? false,
      requires_parent_accompaniment: c.requires_parent_accompaniment ?? false,
      registration_note: c.registration_note ?? null,
      is_active: true,
    });

    for (const r of c.requirements ?? []) {
      reqRows.push({
        id: uid(),
        class_id: classId,
        requirement_type: r.requirement_type,
        enforcement: r.enforcement,
        is_waivable: r.is_waivable,
        description: r.description,
        required_discipline: r.required_discipline ?? null,
        required_level: r.required_level ?? null,
        required_class_id: null,
      });
    }
  }

  const CHUNK = 50;
  for (let i = 0; i < classRows.length; i += CHUNK)
    await ins("classes", classRows.slice(i, i + CHUNK));
  for (let i = 0; i < reqRows.length; i += CHUNK)
    await ins("class_requirements", reqRows.slice(i, i + CHUNK));

  console.log(
    `  ✓ ${classRows.length} catalog classes, ${reqRows.length} requirements\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// N.  STORED PAYMENT METHODS (shoppers + credit cards)
// ─────────────────────────────────────────────────────────────────────────────
async function seedStoredPaymentMethods(users: UserRow[]) {
  console.log("💳  Seeding shoppers + stored credit cards for 6 parents…");

  const CARD_POOL: {
    scheme: string;
    masked: string;
    last4: string;
  }[] = [
    { scheme: "VISA",       masked: "4111 **** **** 1111", last4: "1111" },
    { scheme: "VISA",       masked: "4532 **** **** 7894", last4: "7894" },
    { scheme: "MASTERCARD", masked: "5425 **** **** 3456", last4: "3456" },
    { scheme: "MASTERCARD", masked: "5105 **** **** 5100", last4: "5100" },
    { scheme: "AMEX",       masked: "3714 ****** *9999",   last4: "9999" },
    { scheme: "DISCOVER",   masked: "6011 **** **** 0004", last4: "0004" },
  ];

  // Future expiry options (year 2027–2029)
  const EXPIRIES: { month: number; year: number }[] = [
    { month: 3,  year: 2027 },
    { month: 8,  year: 2027 },
    { month: 11, year: 2027 },
    { month: 2,  year: 2028 },
    { month: 6,  year: 2028 },
    { month: 9,  year: 2029 },
  ];

  const shopperRows: Record<string, unknown>[] = [];
  const cardRows: Record<string, unknown>[] = [];

  for (const [i, parent] of users.entries()) {
    const shopperId = uid();
    const epgShopperId = `SHP-${faker.string.alphanumeric(10).toUpperCase()}`;

    shopperRows.push({
      id: shopperId,
      user_id: parent.id,
      epg_shopper_id: epgShopperId,
      epg_shopper_href: `https://api.elavon.com/api/2/shoppers/${epgShopperId}`,
      full_name: `${parent.first_name} ${parent.last_name}`,
      email: parent.email,
    });

    // Give most parents 1 card; every other parent gets a second card
    const cardCount = i % 2 === 0 ? 2 : 1;
    for (let c = 0; c < cardCount; c++) {
      const card = CARD_POOL[(i + c) % CARD_POOL.length]!;
      const expiry = EXPIRIES[(i + c) % EXPIRIES.length]!;
      const epgStoredId = `SPM-${faker.string.alphanumeric(12).toUpperCase()}`;

      cardRows.push({
        id: uid(),
        shopper_id: shopperId,
        type: "card",
        epg_stored_id: epgStoredId,
        epg_stored_href: `https://api.elavon.com/api/2/stored-cards/${epgStoredId}`,
        masked_number: card.masked,
        card_scheme: card.scheme,
        card_last4: card.last4,
        expiration_month: expiry.month,
        expiration_year: expiry.year,
        is_default: c === 0, // first card is default
      });
    }
  }

  await ins("shoppers", shopperRows);
  await ins("stored_payment_methods", cardRows);

  console.log(
    `  ✓ ${shopperRows.length} shoppers, ${cardRows.length} stored cards\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ETHAN'S DANCERS
// ─────────────────────────────────────────────────────────────────────────────
async function seedEthanDancers(): Promise<void> {
  console.log("💃  Seeding dancers for Ethan Flores…");

  const { data: ethanUser } = await sb
    .from("users")
    .select("family_id")
    .eq("id", ETHAN_ID)
    .single();

  let familyId = ethanUser?.family_id as string | null;
  if (!familyId) {
    const [fam] = await ins<{ id: string; family_name: string }>("families", {
      id: uid(),
      family_name: "Flores Family",
    });
    familyId = fam.id;
    await sb.from("users").update({ family_id: familyId }).eq("id", ETHAN_ID);
  }

  await ins("dancers", [
    {
      id: uid(),
      family_id: familyId,
      user_id: ETHAN_ID,
      first_name: "Sophia",
      last_name: "Flores",
      birth_date: "2016-04-12",
      gender: "female",
      grade: "4",
      is_self: false,
    },
    {
      id: uid(),
      family_id: familyId,
      user_id: ETHAN_ID,
      first_name: "Mia",
      last_name: "Flores",
      birth_date: "2019-08-23",
      gender: "female",
      grade: "1",
      is_self: false,
    },
  ]);

  console.log(
    "  ✓ Sophia Flores (2016-04-12, grade 4), Mia Flores (2019-08-23, grade 1)\n",
  );
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
  const instructors = await seedInstructors();
  await seedEthanDancers();

  const { families, users, dancers } = await seedFamilies();
  await seedStoredPaymentMethods(users);
  await seedSemesters();
  await seedSpecialProgramTuition();
  await seedDiscounts();
  await seedCoupons(families);

  const { classes, schedules, tiers, sessions } = await seedClasses();

  await seedClassSessionInstructors(instructors, schedules, sessions);
  await seedRegistrations(families, users, dancers, schedules, sessions, tiers);
  await seedShowcaseClass(families, users, dancers, schedules, tiers);
  await seedFamilyContacts(families);
  await seedAttendance(instructors);
  await seedInstructorNotes(instructors);
  await seedWaitlist(sessions, dancers);
  await seedEmails(users);
  await seedSessionGroups(sessions);
  await seedSessionTags(sessions);
  await seedClassRequirements(classes);
  await seedAYDTClassCatalog();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║        ✅  Seed complete!                 ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\nSummary:");
  console.log(
    "  Semesters   : 8 (2 draft, 2 scheduled, 2 published, 2 archived)",
  );
  console.log("  Classes     : 64 (8 per semester × 8 semesters)");
  console.log("  Sessions    : 64 class_sessions (1 per schedule) + occurrence dates per session");
  console.log("  Families    : 6 (6 parents + 12 dancers)");
  console.log("  Instructors : 4 (Elena, Marcus, Priya, Aisha) — login: SeedInstructor123!");
  console.log(
    "  Batches     : 24 registration batches (6/semester × 4 active semesters)",
  );
  console.log("  Emails      : 5 (draft, scheduled, sending, sent, cancelled)");
  console.log("  Waitlist    : 9 entries across 2 Spring 2026 sessions");
  console.log("  Coupons     : LWF (20% tuition) + PLANT50 ($50 promo) + early-reg auto-apply per semester");
  console.log("  Cards       : 6 shoppers + 9 stored credit cards (VISA/MC/AMEX/DISCOVER)");
}

main().catch((err) => {
  console.error("\n💥  Seed failed:", err);
  process.exit(1);
});
