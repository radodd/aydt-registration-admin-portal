/**
 * scripts/seed-spring-2026-north.ts
 *
 * Additive (non-destructive) seed for:
 *   AYDT North: Washington Heights - Spring Season 2026
 *
 * Sources: Active.com Camp & Class Manager session configuration (18 sessions).
 * Re-runnable: deterministic IDs, upsert / delete+re-insert for idempotency.
 *
 * Run: npx tsx scripts/seed-spring-2026-north.ts
 *
 * Grade encoding (see utils/gradeLabel.ts):
 *   -3=Nursery  -2=Pre-K3  -1=Pre-K4  0=K  1=1st … 12=12th
 *
 * The "Pre-School" label in Active.com maps to -2 (Pre-K3) in our system.
 * The "Pre-K"      label in Active.com maps to -1 (Pre-K4) in our system.
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

const ADMIN_ID = "64ebf65c-e32f-4e22-9440-e7bb5a0fee8d"; // Ethan Flores

// ── Deterministic IDs (all valid hex UUIDs) ───────────────────────────────────
// Namespace: 00002026-0001 = Spring 2026 North
// Segment 3: 0000=semester 0001=class 0002=schedule 0003=session 0004=group 0005=tier
const SEM_ID = "00002026-0001-0000-0000-000000000001";

// Classes
const C_BALLET_1A_SAT   = "00002026-0001-0001-0000-000000000001";
const C_BALLET_1B_SAT   = "00002026-0001-0001-0000-000000000002";
const C_BALLET_2_SAT    = "00002026-0001-0001-0000-000000000003";
const C_OLB3_SAT        = "00002026-0001-0001-0000-000000000004"; // Open Level Ballet 3
const C_BROADWAY_1_SAT  = "00002026-0001-0001-0000-000000000005";
const C_HH1_TUES        = "00002026-0001-0001-0000-000000000006";
const C_HH2_TUES        = "00002026-0001-0001-0000-000000000007";
const C_HH3_TUES        = "00002026-0001-0001-0000-000000000008";
const C_HH4_TUES        = "00002026-0001-0001-0000-000000000009";
const C_PB1_SAT         = "00002026-0001-0001-0000-000000000010";
const C_PB2_SAT         = "00002026-0001-0001-0000-000000000011";
const C_PB3_SAT         = "00002026-0001-0001-0000-000000000012";
const C_PB1_TUES        = "00002026-0001-0001-0000-000000000013";
const C_PB2_TUES        = "00002026-0001-0001-0000-000000000014";
const C_PB3_TUES        = "00002026-0001-0001-0000-000000000015";
const C_TAP_INTRO_TUES  = "00002026-0001-0001-0000-000000000016";
const C_TAP1A_TUES      = "00002026-0001-0001-0000-000000000017";
const C_TAP1B_TUES      = "00002026-0001-0001-0000-000000000018";

// Schedules (parallel order to classes)
const SC_BALLET_1A_SAT  = "00002026-0001-0002-0000-000000000001";
const SC_BALLET_1B_SAT  = "00002026-0001-0002-0000-000000000002";
const SC_BALLET_2_SAT   = "00002026-0001-0002-0000-000000000003";
const SC_OLB3_SAT       = "00002026-0001-0002-0000-000000000004";
const SC_BROADWAY_1_SAT = "00002026-0001-0002-0000-000000000005";
const SC_HH1_TUES       = "00002026-0001-0002-0000-000000000006";
const SC_HH2_TUES       = "00002026-0001-0002-0000-000000000007";
const SC_HH3_TUES       = "00002026-0001-0002-0000-000000000008";
const SC_HH4_TUES       = "00002026-0001-0002-0000-000000000009";
const SC_PB1_SAT        = "00002026-0001-0002-0000-000000000010";
const SC_PB2_SAT        = "00002026-0001-0002-0000-000000000011";
const SC_PB3_SAT        = "00002026-0001-0002-0000-000000000012";
const SC_PB1_TUES       = "00002026-0001-0002-0000-000000000013";
const SC_PB2_TUES       = "00002026-0001-0002-0000-000000000014";
const SC_PB3_TUES       = "00002026-0001-0002-0000-000000000015";
const SC_TAP_INTRO_TUES = "00002026-0001-0002-0000-000000000016";
const SC_TAP1A_TUES     = "00002026-0001-0002-0000-000000000017";
const SC_TAP1B_TUES     = "00002026-0001-0002-0000-000000000018";

// Sessions (parallel order to classes)
const SS_BALLET_1A_SAT  = "00002026-0001-0003-0000-000000000001";
const SS_BALLET_1B_SAT  = "00002026-0001-0003-0000-000000000002";
const SS_BALLET_2_SAT   = "00002026-0001-0003-0000-000000000003";
const SS_OLB3_SAT       = "00002026-0001-0003-0000-000000000004";
const SS_BROADWAY_1_SAT = "00002026-0001-0003-0000-000000000005";
const SS_HH1_TUES       = "00002026-0001-0003-0000-000000000006";
const SS_HH2_TUES       = "00002026-0001-0003-0000-000000000007";
const SS_HH3_TUES       = "00002026-0001-0003-0000-000000000008";
const SS_HH4_TUES       = "00002026-0001-0003-0000-000000000009";
const SS_PB1_SAT        = "00002026-0001-0003-0000-000000000010";
const SS_PB2_SAT        = "00002026-0001-0003-0000-000000000011";
const SS_PB3_SAT        = "00002026-0001-0003-0000-000000000012";
const SS_PB1_TUES       = "00002026-0001-0003-0000-000000000013";
const SS_PB2_TUES       = "00002026-0001-0003-0000-000000000014";
const SS_PB3_TUES       = "00002026-0001-0003-0000-000000000015";
const SS_TAP_INTRO_TUES = "00002026-0001-0003-0000-000000000016";
const SS_TAP1A_TUES     = "00002026-0001-0003-0000-000000000017";
const SS_TAP1B_TUES     = "00002026-0001-0003-0000-000000000018";

// Session Groups
const SG_BALLET     = "00002026-0001-0004-0000-000000000001";
const SG_BROADWAY   = "00002026-0001-0004-0000-000000000002";
const SG_HIP_HOP    = "00002026-0001-0004-0000-000000000003";
const SG_PRE_BALLET = "00002026-0001-0004-0000-000000000004";
const SG_TAP        = "00002026-0001-0004-0000-000000000005";

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  if (error) console.warn(`  ⚠ clearing ${table}.${col}=${val}: ${error.message}`);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const START_DATE = "2026-01-26";
const END_DATE   = "2026-06-20";
const REG_CLOSE  = "2026-02-22T23:59:00-05:00"; // 11:59 PM US/Eastern
const LOCATION   = "American Youth Dance Theater - NORTH";

// ── Session definitions ───────────────────────────────────────────────────────
// Each entry drives class + schedule + session + price_tier creation.
//
// min_grade/max_grade use AYDT encoding:
//   -2=Pre-K3("Pre-School")  -1=Pre-K4("Pre-K")  0=K  1=1st … 12=12th
//
// division:  "junior" = $796.40 tuition + SR fees (SR Recital $65 + Video $15)
//            "early_childhood" = $775.99 tuition + JR fees (JR Recital $55)
//
// Descriptions sourced from Active.com session detail pages.

const BALLET_DESC = `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT® National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student's goals and levels of ability.`;

const BALLET_SENIOR_DESC = `${BALLET_DESC} This is a senior level class with performance.`;

const HH_DESC = `High energy dance to popular music. This class is a great strength-building and cardio-workout that includes warm-up, stretching and building a vocabulary of steps and combinations. All students perform. This is a Senior level class with performance.`;

const BROADWAY_DESC = `This exciting program introduces students to Broadway style theater jazz. Class work consists of just warm up, stretching, and building a vocabulary of steps and combinations. Broadway dancers are encouraged to take ballet and tap to complement their training. This is a senior level class with performance.`;

const TAP_SENIOR_DESC = `The tap program at AYDT focuses on teaching students classical tap steps, rhythm and technique. Class consists of warm-up, stretching and building a vocabulary of steps and combinations. This is a senior with performance.`;

const TAP_INTRO_DESC = `The tap program at AYDT focuses on teaching students classical tap steps, rhythm and technique. Class consists of warm-up, stretching and building a vocabulary of steps and combinations. This is a junior level class with performance.`;

const PRE_BALLET_DESC = `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT® National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student's goals and levels of ability. This is a Junior Level Class with performance.`;

interface SessionDef {
  classId:     string;
  schedId:     string;
  sessId:      string;
  name:        string;
  discipline:  string;
  division:    "junior" | "early_childhood";
  day:         string; // "saturday" | "tuesday"
  startTime:   string; // HH:MM:SS
  endTime:     string;
  capacity:    number;
  minGrade:    number;
  maxGrade:    number;
  tuition:     number;
  description: string;
}

const SESSION_DEFS: SessionDef[] = [
  // ── SATURDAY – Ballet ──────────────────────────────────────────────────────
  {
    classId: C_BALLET_1A_SAT, schedId: SC_BALLET_1A_SAT, sessId: SS_BALLET_1A_SAT,
    name: "Ballet 1A (Sat)", discipline: "ballet", division: "junior",
    day: "saturday", startTime: "10:00:00", endTime: "11:00:00",
    capacity: 10, minGrade: 1, maxGrade: 2,
    tuition: 796.40, description: BALLET_DESC,
  },
  {
    classId: C_BALLET_1B_SAT, schedId: SC_BALLET_1B_SAT, sessId: SS_BALLET_1B_SAT,
    name: "Ballet 1B (Sat)", discipline: "ballet", division: "junior",
    day: "saturday", startTime: "10:00:00", endTime: "11:00:00",
    capacity: 10, minGrade: 2, maxGrade: 3,
    tuition: 796.40, description: BALLET_DESC,
  },
  {
    classId: C_BALLET_2_SAT, schedId: SC_BALLET_2_SAT, sessId: SS_BALLET_2_SAT,
    name: "Ballet 2 (Sat)", discipline: "ballet", division: "junior",
    day: "saturday", startTime: "11:00:00", endTime: "12:00:00",
    capacity: 8, minGrade: 3, maxGrade: 4,
    tuition: 796.40, description: BALLET_SENIOR_DESC,
  },
  {
    classId: C_OLB3_SAT, schedId: SC_OLB3_SAT, sessId: SS_OLB3_SAT,
    name: "Open Level Ballet 3 (Sat)", discipline: "ballet", division: "junior",
    day: "saturday", startTime: "11:00:00", endTime: "12:00:00",
    capacity: 7, minGrade: 4, maxGrade: 6,
    tuition: 796.40, description: BALLET_SENIOR_DESC,
  },
  // ── SATURDAY – Broadway ────────────────────────────────────────────────────
  {
    classId: C_BROADWAY_1_SAT, schedId: SC_BROADWAY_1_SAT, sessId: SS_BROADWAY_1_SAT,
    name: "Broadway 1 (Sat)", discipline: "broadway", division: "junior",
    day: "saturday", startTime: "12:00:00", endTime: "13:00:00",
    capacity: 7, minGrade: 3, maxGrade: 6,
    tuition: 796.40, description: BROADWAY_DESC,
  },
  // ── TUESDAY – Hip Hop ──────────────────────────────────────────────────────
  {
    classId: C_HH1_TUES, schedId: SC_HH1_TUES, sessId: SS_HH1_TUES,
    name: "Hip Hop 1 (Tues)", discipline: "hip_hop", division: "junior",
    day: "tuesday", startTime: "15:45:00", endTime: "16:45:00",
    capacity: 10, minGrade: 1, maxGrade: 2,
    tuition: 796.40, description: HH_DESC,
  },
  {
    classId: C_HH2_TUES, schedId: SC_HH2_TUES, sessId: SS_HH2_TUES,
    name: "Hip Hop 2 (Tues)", discipline: "hip_hop", division: "junior",
    day: "tuesday", startTime: "16:45:00", endTime: "17:45:00",
    capacity: 10, minGrade: 3, maxGrade: 4,
    tuition: 796.40, description: HH_DESC,
  },
  {
    classId: C_HH3_TUES, schedId: SC_HH3_TUES, sessId: SS_HH3_TUES,
    name: "Hip Hop 3 (Tues)", discipline: "hip_hop", division: "junior",
    day: "tuesday", startTime: "16:45:00", endTime: "17:45:00",
    capacity: 10, minGrade: 5, maxGrade: 6,
    tuition: 796.40, description: HH_DESC,
  },
  {
    classId: C_HH4_TUES, schedId: SC_HH4_TUES, sessId: SS_HH4_TUES,
    name: "Hip Hop 4 (Tues)", discipline: "hip_hop", division: "junior",
    day: "tuesday", startTime: "16:45:00", endTime: "17:45:00",
    capacity: 10, minGrade: 7, maxGrade: 8,
    tuition: 796.40, description: HH_DESC,
  },
  // ── SATURDAY – Pre-Ballet ──────────────────────────────────────────────────
  {
    classId: C_PB1_SAT, schedId: SC_PB1_SAT, sessId: SS_PB1_SAT,
    name: "Pre-Ballet 1 (Sat)", discipline: "ballet", division: "early_childhood",
    day: "saturday", startTime: "10:00:00", endTime: "10:45:00",
    capacity: 6, minGrade: -2, maxGrade: -1, // Pre-School to Pre-K
    tuition: 775.99, description: PRE_BALLET_DESC,
  },
  {
    classId: C_PB2_SAT, schedId: SC_PB2_SAT, sessId: SS_PB2_SAT,
    name: "Pre-Ballet 2 (Sat)", discipline: "ballet", division: "early_childhood",
    day: "saturday", startTime: "10:45:00", endTime: "11:30:00",
    capacity: 6, minGrade: -1, maxGrade: -1, // Pre-K
    tuition: 775.99, description: PRE_BALLET_DESC,
  },
  {
    classId: C_PB3_SAT, schedId: SC_PB3_SAT, sessId: SS_PB3_SAT,
    name: "Pre-Ballet 3 (Sat)", discipline: "ballet", division: "early_childhood",
    day: "saturday", startTime: "10:45:00", endTime: "11:30:00",
    capacity: 10, minGrade: 0, maxGrade: 0, // K
    tuition: 775.99, description: PRE_BALLET_DESC,
  },
  // ── TUESDAY – Pre-Ballet ───────────────────────────────────────────────────
  {
    classId: C_PB1_TUES, schedId: SC_PB1_TUES, sessId: SS_PB1_TUES,
    name: "Pre-Ballet 1 (Tues)", discipline: "ballet", division: "early_childhood",
    day: "tuesday", startTime: "15:15:00", endTime: "16:00:00",
    capacity: 5, minGrade: -2, maxGrade: -1, // Pre-School to Pre-K
    tuition: 775.99, description: PRE_BALLET_DESC,
  },
  {
    classId: C_PB2_TUES, schedId: SC_PB2_TUES, sessId: SS_PB2_TUES,
    name: "Pre-Ballet 2 (Tues)", discipline: "ballet", division: "early_childhood",
    day: "tuesday", startTime: "15:15:00", endTime: "16:00:00",
    capacity: 6, minGrade: -1, maxGrade: -1, // Pre-K
    tuition: 775.99, description: PRE_BALLET_DESC,
  },
  {
    classId: C_PB3_TUES, schedId: SC_PB3_TUES, sessId: SS_PB3_TUES,
    name: "Pre-Ballet 3 (Tues)", discipline: "ballet", division: "early_childhood",
    day: "tuesday", startTime: "16:00:00", endTime: "16:45:00",
    capacity: 10, minGrade: 0, maxGrade: 0, // K
    tuition: 775.99, description: PRE_BALLET_DESC,
  },
  // ── TUESDAY – Tap ─────────────────────────────────────────────────────────
  {
    classId: C_TAP_INTRO_TUES, schedId: SC_TAP_INTRO_TUES, sessId: SS_TAP_INTRO_TUES,
    name: "Tap Intro (Tues)", discipline: "tap", division: "early_childhood",
    day: "tuesday", startTime: "16:00:00", endTime: "16:45:00",
    capacity: 10, minGrade: -1, maxGrade: 0, // Pre-K to K
    tuition: 775.99, description: TAP_INTRO_DESC,
  },
  {
    classId: C_TAP1A_TUES, schedId: SC_TAP1A_TUES, sessId: SS_TAP1A_TUES,
    name: "Tap 1A (Tues)", discipline: "tap", division: "junior",
    day: "tuesday", startTime: "16:45:00", endTime: "17:45:00",
    capacity: 5, minGrade: 1, maxGrade: 3,
    tuition: 796.40, description: TAP_SENIOR_DESC,
  },
  {
    classId: C_TAP1B_TUES, schedId: SC_TAP1B_TUES, sessId: SS_TAP1B_TUES,
    name: "Tap 1B (Tues)", discipline: "tap", division: "junior",
    day: "tuesday", startTime: "16:45:00", endTime: "17:45:00",
    capacity: 5, minGrade: 3, maxGrade: 5,
    tuition: 796.40, description: TAP_SENIOR_DESC,
  },
];

// ── Registration form elements ────────────────────────────────────────────────
// Only custom elements — system fields (first name, last name, DOB, grade,
// email, address) are not stored here.

const FORM_ELEMENTS = [
  // 1. Attendance policy warning (orange text block)
  {
    id: "sp26n-form-elem-001",
    type: "text_block",
    htmlContent:
      "<p><strong>AYDT adheres to a strict attendance policy for ages 3.5-Teens to ensure the success of our performances in December &amp; June. We DO NOT make exceptions. PLEASE COMPARE OUR CALENDAR TO YOUR CHILD'S SCHOOL CALENDAR. If you think you are going to miss more than 2 classes and you don't want to pay for private lessons to make up for the absences, it's best not to register this semester. Please CHECK REHEARSAL &amp; RECITAL DATES and mark them in your calendar before registering to make sure this is something you can commit to. NOTE: The Senior recital (grades 1-12) is a multi-day commitment. THERE ARE NO EXCEPTIONS.</strong></p>",
    textFormatting: {
      style: "normal",
      bold: true,
      italic: false,
      underline: false,
      color: "indigo",
    },
    sessionIds: [],
  },
  // 2. School Name
  {
    id: "sp26n-form-elem-002",
    type: "question",
    label: "School Name",
    reportLabel: "School Name",
    inputType: "short_answer",
    required: false,
    sessionIds: [],
  },
  // 3. Pre-school grade instruction (orange text block)
  {
    id: "sp26n-form-elem-003",
    type: "text_block",
    htmlContent:
      "<p><strong>If your child is not in school yet please select \"pre-school\" for the Grade question.</strong></p>",
    textFormatting: {
      style: "normal",
      bold: true,
      italic: false,
      underline: false,
      color: "indigo",
    },
    sessionIds: [],
  },
  // 4. Home phone number (participant)
  {
    id: "sp26n-form-elem-004",
    type: "question",
    label: "Home phone number",
    reportLabel: "Home Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
  // 5. Nanny/Caregiver
  {
    id: "sp26n-form-elem-005",
    type: "question",
    label: "Nanny/Caregiver",
    reportLabel: "Nanny/Caregiver",
    inputType: "short_answer",
    required: false,
    sessionIds: [],
  },
  // 6. How did you hear about our school?
  {
    id: "sp26n-form-elem-006",
    type: "question",
    label: "How did you hear about our school?",
    reportLabel: "How Did You Hear About Us",
    inputType: "short_answer",
    required: false,
    sessionIds: [],
  },
  // 7. Emergency Contact section header
  {
    id: "sp26n-form-elem-007",
    type: "subheader",
    label: "Emergency Contact Information",
    sessionIds: [],
  },
  // 8. Emergency Contact Name (required)
  {
    id: "sp26n-form-elem-008",
    type: "question",
    label: "Emergency Contact Name",
    reportLabel: "Emergency Contact Name",
    inputType: "short_answer",
    required: true,
    sessionIds: [],
  },
  // 9. Emergency Contact Relationship (required)
  {
    id: "sp26n-form-elem-009",
    type: "question",
    label: "Emergency Contact Relationship to the Child",
    reportLabel: "Emergency Contact Relationship",
    inputType: "short_answer",
    required: true,
    sessionIds: [],
  },
  // 10. Emergency Contact Cell Phone (required)
  {
    id: "sp26n-form-elem-010",
    type: "question",
    label: "Emergency Contact Cell Phone",
    reportLabel: "Emergency Contact Cell Phone",
    inputType: "phone_number",
    required: true,
    sessionIds: [],
  },
  // 11. Second parent notice (orange text block)
  {
    id: "sp26n-form-elem-011",
    type: "text_block",
    htmlContent:
      "<p><strong>IN THE EVENT THAT WE NEED TO CONTACT A SECOND PARENT LIVING IN SEPARATE QUARTERS, PLEASE ADD SECONDARY PARENT/GUARDIAN INFORMATION BELOW.</strong></p>",
    textFormatting: {
      style: "normal",
      bold: true,
      italic: false,
      underline: false,
      color: "indigo",
    },
    sessionIds: [],
  },
  // 12. Parent cell phone
  {
    id: "sp26n-form-elem-012",
    type: "question",
    label: "Cell phone number",
    reportLabel: "Parent Cell Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
  // 13. Parent home phone
  {
    id: "sp26n-form-elem-013",
    type: "question",
    label: "Home phone number",
    reportLabel: "Parent Home Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
  // 14. Parent business phone
  {
    id: "sp26n-form-elem-014",
    type: "question",
    label: "Business phone number",
    reportLabel: "Parent Business Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seeding AYDT North: Washington Heights – Spring Season 2026…\n");

  // ── 1. Semester ──────────────────────────────────────────────────────────
  await upsert("semesters", {
    id: SEM_ID,
    name: "AYDT North: Washington Heights - Spring Season 2026",
    description:
      "Spring 2026 semester at American Youth Dance Theater – North (United Palace Theatre, Washington Heights). Classes run January 26 – June 20, 2026.",
    status: "published",
    publish_at: new Date("2026-01-01").toISOString(),
    published_at: new Date("2026-01-01").toISOString(),
    created_by: ADMIN_ID,
    updated_by: ADMIN_ID,
    tracking_mode: false,
    capacity_warning_threshold: 3,
    registration_form: { elements: FORM_ELEMENTS },
    confirmation_email: {
      subject: "You're registered for AYDT Spring 2026!",
      senderName: "AYDT Studio",
      senderEmail: "no-reply@aydt.com",
      bodyHtml:
        "<p>Hi {{first_name}},</p><p>Thank you for registering for the Spring 2026 semester at AYDT North! We look forward to seeing you in class.</p>",
    },
    waitlist_settings: {
      enabled: true,
      inviteExpiryHours: 48,
      stopDaysBeforeClose: 3,
    },
  });
  console.log(`  ✓ Semester: AYDT North: Washington Heights - Spring Season 2026`);

  // ── 2. Fee config ─────────────────────────────────────────────────────────
  await upsert(
    "semester_fee_config",
    {
      semester_id: SEM_ID,
      registration_fee_per_child: 40.00,    // "Spring 2026 Registration fee"
      family_discount_amount: 50.00,
      auto_pay_admin_fee_monthly: 5.00,
      auto_pay_installment_count: 5,
      senior_video_fee_per_registrant: 15.00, // "Required Sr. Video Fee"
      senior_costume_fee_per_class: 65.00,    // "SR Recital Fee"
      junior_costume_fee_per_class: 55.00,    // "JR Recital Fee"
    },
    "semester_id",
  );
  console.log("  ✓ Fee config");

  // ── 3. Payment plan: pay_in_full ──────────────────────────────────────────
  // "Customers must pay in full in order to check out."
  await upsert(
    "semester_payment_plans",
    {
      semester_id: SEM_ID,
      type: "pay_in_full",
      deposit_amount: null,
      deposit_percent: null,
      installment_count: null,
      due_date: END_DATE, // required NOT NULL; pay_in_full = due at time of checkout
    },
    "semester_id",
  );
  console.log("  ✓ Payment plan: pay_in_full");

  // ── 4. Tuition rate bands ─────────────────────────────────────────────────
  await del("tuition_rate_bands", "semester_id", SEM_ID);
  await upsert("tuition_rate_bands", [
    // early_childhood: Pre-Ballet / Tap Intro — $775.99 base tuition
    {
      semester_id: SEM_ID,
      division: "early_childhood",
      weekly_class_count: 1,
      base_tuition: 775.99,
      progressive_discount_percent: 0,
      semester_total: 815.99, // base + $40 reg fee
      autopay_installment_amount: null,
    },
    // junior: Ballet, Broadway, Hip Hop, Tap 1A/1B — $796.40 base tuition
    {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 1,
      base_tuition: 796.40,
      progressive_discount_percent: 0,
      semester_total: 836.40,
      autopay_installment_amount: null,
    },
    {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 2,
      base_tuition: 1592.80,
      progressive_discount_percent: 0,
      semester_total: 1632.80,
      autopay_installment_amount: null,
    },
  ]);
  console.log("  ✓ Tuition rate bands (3 rows)");

  // ── 5. Classes ────────────────────────────────────────────────────────────
  const classRows = SESSION_DEFS.map((s) => ({
    id: s.classId,
    semester_id: SEM_ID,
    name: s.name,
    discipline: s.discipline,
    division: s.division,
    description: s.description,
    min_grade: s.minGrade,
    max_grade: s.maxGrade,
    is_active: true,
    is_competition_track: false,
    requires_teacher_rec: false,
    visibility: "public",
    enrollment_type: "standard",
  }));
  await upsert("classes", classRows);
  console.log(`  ✓ Classes (${classRows.length})`);

  // ── 6. Class schedules ────────────────────────────────────────────────────
  const schedRows = SESSION_DEFS.map((s) => ({
    id: s.schedId,
    class_id: s.classId,
    semester_id: SEM_ID,
    days_of_week: [s.day],
    start_time: s.startTime,
    end_time: s.endTime,
    start_date: START_DATE,
    end_date: END_DATE,
    location: LOCATION,
    instructor_name: null,
    capacity: s.capacity,
    registration_open_at: null,
    registration_close_at: REG_CLOSE,
    gender_restriction: "no_restriction",
    pricing_model: "full_schedule",
  }));
  await upsert("class_schedules", schedRows);
  console.log(`  ✓ Class schedules (${schedRows.length})`);

  // ── 7. Schedule price tiers (one per schedule) ────────────────────────────
  // Delete all price tiers for this semester's schedules individually
  for (const s of SESSION_DEFS) {
    const { error } = await sb
      .from("schedule_price_tiers")
      .delete()
      .eq("schedule_id", s.schedId);
    if (error) console.warn(`  ⚠ clearing price tiers for ${s.name}: ${error.message}`);
  }
  const priceTierRows = SESSION_DEFS.map((s, i) => ({
    id: `00002026-0001-0005-0000-${String(i + 1).padStart(12, "0")}`,
    schedule_id: s.schedId,
    label: "Price",
    amount: Math.round(s.tuition * 100),
    sort_order: 0,
    is_default: true,
  }));
  await upsert("schedule_price_tiers", priceTierRows);
  console.log(`  ✓ Schedule price tiers (${priceTierRows.length})`);

  // ── 8. Class sessions (one per schedule) ─────────────────────────────────
  const sessionRows = SESSION_DEFS.map((s) => ({
    id: s.sessId,
    class_id: s.classId,
    schedule_id: s.schedId,
    semester_id: SEM_ID,
    day_of_week: s.day,
    start_time: s.startTime,
    end_time: s.endTime,
    start_date: START_DATE,
    end_date: END_DATE,
    location: LOCATION,
    instructor_name: null,
    capacity: s.capacity,
    cloned_from_session_id: null,
    registration_close_at: REG_CLOSE,
    is_active: true,
  }));
  await upsert("class_sessions", sessionRows);
  console.log(`  ✓ Class sessions (${sessionRows.length})`);

  // ── 9. Session groups ─────────────────────────────────────────────────────
  await upsert("session_groups", [
    { id: SG_BALLET,     semester_id: SEM_ID, name: "Ballet",     description: null },
    { id: SG_BROADWAY,   semester_id: SEM_ID, name: "Broadway",   description: null },
    { id: SG_HIP_HOP,    semester_id: SEM_ID, name: "Hip Hop",    description: null },
    { id: SG_PRE_BALLET, semester_id: SEM_ID, name: "Pre-Ballet", description: null },
    { id: SG_TAP,        semester_id: SEM_ID, name: "Tap",        description: null },
  ]);
  console.log("  ✓ Session groups (5)");

  // ── 10. Session group memberships ─────────────────────────────────────────
  // Clear existing memberships for these groups then re-insert
  for (const gid of [SG_BALLET, SG_BROADWAY, SG_HIP_HOP, SG_PRE_BALLET, SG_TAP]) {
    await del("session_group_sessions", "session_group_id", gid);
  }

  const groupMemberships: { session_group_id: string; session_id: string }[] = [
    // Ballet group: Ballet 1A, 1B, 2, Open Level Ballet 3
    { session_group_id: SG_BALLET, session_id: SS_BALLET_1A_SAT },
    { session_group_id: SG_BALLET, session_id: SS_BALLET_1B_SAT },
    { session_group_id: SG_BALLET, session_id: SS_BALLET_2_SAT },
    { session_group_id: SG_BALLET, session_id: SS_OLB3_SAT },
    // Broadway group: Broadway 1
    { session_group_id: SG_BROADWAY, session_id: SS_BROADWAY_1_SAT },
    // Hip Hop group: Hip Hop 1–4
    { session_group_id: SG_HIP_HOP, session_id: SS_HH1_TUES },
    { session_group_id: SG_HIP_HOP, session_id: SS_HH2_TUES },
    { session_group_id: SG_HIP_HOP, session_id: SS_HH3_TUES },
    { session_group_id: SG_HIP_HOP, session_id: SS_HH4_TUES },
    // Pre-Ballet group: all 6 Pre-Ballet sessions
    { session_group_id: SG_PRE_BALLET, session_id: SS_PB1_SAT },
    { session_group_id: SG_PRE_BALLET, session_id: SS_PB2_SAT },
    { session_group_id: SG_PRE_BALLET, session_id: SS_PB3_SAT },
    { session_group_id: SG_PRE_BALLET, session_id: SS_PB1_TUES },
    { session_group_id: SG_PRE_BALLET, session_id: SS_PB2_TUES },
    { session_group_id: SG_PRE_BALLET, session_id: SS_PB3_TUES },
    // Tap group: Tap Intro, Tap 1A, Tap 1B
    { session_group_id: SG_TAP, session_id: SS_TAP_INTRO_TUES },
    { session_group_id: SG_TAP, session_id: SS_TAP1A_TUES },
    { session_group_id: SG_TAP, session_id: SS_TAP1B_TUES },
  ];
  await upsert("session_group_sessions", groupMemberships);
  console.log(`  ✓ Session group memberships (${groupMemberships.length})`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
Done ✓

  Semester ID : ${SEM_ID}
  Sessions    : ${SESSION_DEFS.length} (8 Saturday + 10 Tuesday)
  Groups      : 5 (Ballet, Broadway, Hip Hop, Pre-Ballet, Tap)
  Payment plan: pay_in_full (customers must pay in full to check out)
  Form fields : ${FORM_ELEMENTS.length} custom elements

  Run \`npx tsx scripts/seed-spring-2026-north.ts\` again to re-seed safely.
`);
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
