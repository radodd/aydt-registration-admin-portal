/**
 * scripts/seed-spring-2026-ues.ts
 *
 * Additive (non-destructive) seed for:
 *   AYDT_MAIN: UES-SPRING-SEASON-2026
 *
 * Sources: Active.com Camp & Class Manager export (127 sessions, UES Main location).
 * Re-runnable: deterministic IDs, upsert / delete+re-insert for idempotency.
 *
 * Run: npx tsx scripts/seed-spring-2026-ues.ts
 *
 * Grade encoding (see utils/gradeLabel.ts):
 *   -3=Nursery  -2=Pre-K3  -1=Pre-K4  0=K  1=1st … 12=12th
 *
 * ── KNOWN GAPS (data present in PDF but not representable in this schema) ──────
 *
 * GAP 1 — Day of week (110 weekday classes)
 *   The Active.com export only marks "Saturday: yes/no". All 110 non-Saturday
 *   sessions are seeded with day:"monday" as a placeholder.
 *   ACTION REQUIRED: Update each weekday class to its actual day of week.
 *
 * GAP 2 — Class names
 *   The export contains no class names. All 127 classes are named "UES Dance NNN"
 *   sequentially. ACTION REQUIRED: Replace with real class names.
 *
 * GAP 3 — Discipline
 *   The export contains no discipline field. All classes default to "ballet"
 *   except $716.78 intensive classes which are set to "technique".
 *   ACTION REQUIRED: Update disciplines as needed.
 *
 * GAP 4 — Pointe add-ons (rows 48, 55, 80, 85, 91, 96, 103, 108)
 *   In Active.com these 8 sessions had a supplementary Pointe add-on class.
 *   The portal schema has no class add-on / prerequisite relationship.
 *   These are seeded as regular senior ballet classes at standard pricing.
 *   ACTION REQUIRED: Decide how to handle Pointe supplements in the portal.
 *
 * GAP 5 — Deposit payment plan
 *   UES offers a $25 deposit option (unlike North which is pay_in_full only).
 *   Seeded as deposit_flat ($25). The installment schedule / balance-due date
 *   should be verified with the studio before publishing.
 *
 * GAP 6 — Data corrections applied to export
 *   Row 17:  PDF showed end time "11:45 PM" for an 11:00 AM class — corrected to 11:45 AM.
 *   Row 113: PDF showed "4:45 AM – 5:45 AM"  — corrected to 16:45 PM – 17:45 PM.
 *   Rows 64 & 113: No grade range in export — min_grade/max_grade set to null.
 *
 * GAP 7 — Special pricing
 *   Row 89:  $842.61 (seeded in SG_SPECIAL group)
 *   Row 127: $802.94 (seeded in SG_SPECIAL group)
 *   Rows 116, 119, 122, 124: $716.78 technique/intensive (is_competition_track=true)
 *   These differ from standard tuition and may need separate rate band configuration.
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

// ── Deterministic IDs ─────────────────────────────────────────────────────────
// Namespace: 00002026-0002 = Spring 2026 UES Main
// Segment 3: 0000=semester 0001=class 0002=schedule 0003=session 0004=group 0005=tier
const SEM_ID = "00002026-0002-0000-0000-000000000001";

const pad12 = (n: number) => String(n).padStart(12, "0");
const cId  = (n: number) => `00002026-0002-0001-0000-${pad12(n)}`;
const scId = (n: number) => `00002026-0002-0002-0000-${pad12(n)}`;
const ssId = (n: number) => `00002026-0002-0003-0000-${pad12(n)}`;

// Session Groups
const SG_EARLY_CHILDHOOD = "00002026-0002-0004-0000-000000000001";
const SG_JUNIOR          = "00002026-0002-0004-0000-000000000002";
const SG_SENIOR          = "00002026-0002-0004-0000-000000000003";
const SG_SATURDAY        = "00002026-0002-0004-0000-000000000004";
const SG_OPEN            = "00002026-0002-0004-0000-000000000005"; // $394.11 open / partial-semester
const SG_SPECIAL         = "00002026-0002-0004-0000-000000000006"; // special pricing ($716.78/$842.61/$802.94)

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
const REG_A = "2026-02-22T23:59:00-05:00";
const REG_B = "2026-04-18T23:59:00-05:00";
const REG_C = "2026-06-20T23:59:00-05:00";
const LOCATION = "American Youth Dance Theater";

// Session date windows — verified against Active.com JSON export:
//   Session 1 (REG_B closes Apr 18): runs Jan 26 – Apr 18  (9 weeks)
//   Session 2 (REG_C closes Jun 20): runs Apr 20 – Jun 20  (9 weeks)
//   Full semester (REG_A):           runs Jan 26 – Jun 20
function sessionStartDate(regClose: string): string {
  if (regClose === REG_C) return "2026-04-20"; // Session 2 starts day after Session 1 closes
  return START_DATE; // "2026-01-26" for full semester (REG_A) and Session 1 (REG_B)
}
function sessionEndDate(regClose: string): string {
  if (regClose === REG_B) return "2026-04-18"; // Session 1 ends when reg closes
  return END_DATE; // "2026-06-20" for full semester (REG_A) and Session 2 (REG_C)
}

// ── Session definitions ───────────────────────────────────────────────────────
// n        — PDF row number; drives all deterministic IDs via cId/scId/ssId
// division — "early_childhood" | "junior" | "senior"
// discipline — default "ballet"; "technique" for $716.78 intensive classes
// day      — "saturday" | "monday" (monday = placeholder; see GAP 1)
// tuition  — dollars; stored as cents via Math.round(tuition * 100)
// regClose — REG_A | REG_B | REG_C; drives registration deadline + session window
//
// Grade encoding: -2=Pre-K3  -1=Pre-K4  0=K  1=1st … 12=12th  null=not specified

interface SessionDef {
  n:          number;
  name:       string;
  division:   "early_childhood" | "junior" | "senior";
  discipline: string;
  day:        string;
  startTime:  string; // "HH:MM:SS"
  endTime:    string;
  capacity:   number;
  minGrade:   number | null;
  maxGrade:   number | null;
  tuition:    number;
  regClose:   string;
}

// Helper: derive session group memberships from a session definition
function getGroups(d: SessionDef): string[] {
  const grps: string[] = [];
  if (d.tuition === 394.11) {
    grps.push(SG_OPEN);
  } else if (d.tuition === 716.78 || d.tuition === 842.61 || d.tuition === 802.94) {
    grps.push(SG_SPECIAL);
  } else if (d.division === "early_childhood") {
    grps.push(SG_EARLY_CHILDHOOD);
  } else if (d.division === "junior") {
    grps.push(SG_JUNIOR);
  } else {
    grps.push(SG_SENIOR);
  }
  if (d.day === "saturday") grps.push(SG_SATURDAY);
  return grps;
}

// ── Descriptions ─────────────────────────────────────────────────────────────
const EC_DESC =
  "AYDT provides quality early childhood dance training for students ages 3–6. Classes are taught with a nurturing and encouraging approach, introducing young dancers to proper alignment, musicality, and movement fundamentals. This is a Junior level class with performance.";

const JUNIOR_DESC =
  "AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT® National Training Curriculum, which is taught throughout the program. This is a Junior level class with performance.";

const SENIOR_DESC =
  "AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT® National Training Curriculum, which is taught throughout the program. This is a Senior level class with performance.";

const TECHNIQUE_DESC =
  "This intensive technique class provides advanced training for serious dancers. Emphasis is placed on strength, flexibility, and artistry. Students enrolled in this class are enrolled in the competition track program. This is a Senior level class with performance.";

const OPEN_DESC =
  "Open level class available for partial-semester enrollment. No grade restriction. Registration opens on a rolling basis per the session window. Perfect for students joining mid-season or seeking supplemental training.";

const SPECIAL_DESC =
  "A specialized class with individualized pricing reflecting additional instruction, extended class time, or specialized faculty. This is a Senior level class with performance.";

function getDesc(d: SessionDef): string {
  if (d.tuition === 394.11) return OPEN_DESC;
  if (d.tuition === 716.78) return TECHNIQUE_DESC;
  if (d.tuition === 842.61 || d.tuition === 802.94) return SPECIAL_DESC;
  if (d.division === "early_childhood") return EC_DESC;
  if (d.division === "junior") return JUNIOR_DESC;
  return SENIOR_DESC;
}

// ── Active.com JSON overrides (entries 1–32) ──────────────────────────────────
// Source: Active.com JSON export received 2026-03-20. The message was truncated
// after 32 entries — entries 33–127 still use stub names / "monday" placeholder.
// Add more entries to OVERRIDES as the remaining JSON is received.
//
// Discipline mapping (Active.com → schema):
//   Ballet → ballet | Hip Hop → hip_hop | Pre-Ballet → pre_ballet
//   Tap → tap | Jazz → jazz | Contemporary → contemporary
//
// Visibility: "Online" → "public"  |  "Internal only" → "hidden"
interface ClassOverride {
  name:        string;
  discipline:  string;
  day:         string;
  description: string;
  visibility:  "public" | "hidden" | "invite_only";
}

const OVERRIDES: Record<number, ClassOverride> = {
   1: { name: "Ballet 1A (Tues)",    discipline: "ballet",       day: "tuesday",   visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability.` },
   2: { name: "Hip Hop Intro (Mon)", discipline: "hip_hop",      day: "monday",    visibility: "public",
        description: `High energy dance to popular music. This class is a great strength-building and cardio workout that includes warm-up, stretching and building a vocabulary of steps and combinations. All music and movement is age-appropriate. This is a Junior Level class with performance.` },
   3: { name: "Pre-Ballet 1/ AGES 3-4 (Tues)", discipline: "pre_ballet", day: "tuesday", visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a Junior Level Class with performance.` },
   4: { name: "Open Level Ballet 4 (Wed)", discipline: "ballet", day: "wednesday", visibility: "public",
        description: `Open to students in grades 7 and up who have completed 2 years of Open Level Ballet 1 or equivalent. Older beginners are welcome but may need to take a few private lessons to catch up. AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a senior level class with performance.` },
   5: { name: "Tap Intro (Wed)",     discipline: "tap",          day: "wednesday", visibility: "public",
        description: `The tap program at AYDT focuses on teaching students classical tap steps, rhythm and technique. Class consists of warm-up, stretching and building a vocabulary of steps and combinations. This is a Junior Level class with performance.` },
   6: { name: "Contemporary 1 (Mon)", discipline: "contemporary", day: "monday",   visibility: "public",
        description: `Available to students in Ballet 5 or Open level ballet 5 and up only as an additional weekly class to complement and add versatility to their training.` },
   7: { name: "Broadway 1 (Mon)",    discipline: "jazz",         day: "monday",    visibility: "public",
        description: `This exciting program introduces students to Broadway style theater jazz. Class work consists of jazz warm up, stretching, and building vocabulary of steps and combinations. Broadway dancers are strongly encouraged to take ballet and tap to complement their training. This is a senior level class with performance.` },
   8: { name: "First Steps, Session 1 / AGES 18 months - 26 months (Tues)", discipline: "pre_ballet", day: "tuesday", visibility: "public",
        description: `AYDT\u2019s Early Childhood programs are taught by a caring faculty of professional dancers with extensive teaching experience. Twins must be accompanied by two adults, one for each child. Class is broken into two 9 week sessions.` },
   9: { name: "Broadway 1 (Tues)",   discipline: "jazz",         day: "tuesday",   visibility: "public",
        description: `This exciting program introduces students to Broadway style theater jazz. Class work consists of jazz warm up, stretching, and building vocabulary of steps and combinations. Broadway dancers are strongly encouraged to take ballet and tap to complement their training. This is a senior level class with performance.` },
  10: { name: "Tap 1A (Wed)",        discipline: "tap",          day: "wednesday", visibility: "public",
        description: `The tap program at AYDT focuses on teaching students classical tap steps, rhythm and technique. Class consists of warm-up, stretching and building a vocabulary of steps and combinations. This is a senior level class with performance.` },
  11: { name: "Hip Hop Intro (Tues)", discipline: "hip_hop",     day: "tuesday",   visibility: "public",
        description: `High energy dance to popular music. This class is a great strength-building and cardio workout that includes warm-up, stretching and building a vocabulary of steps and combinations. All music and movement is age-appropriate. This is a Junior Level class with performance.` },
  12: { name: "Ballet 1A (Wed)",     discipline: "ballet",       day: "wednesday", visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability.` },
  13: { name: "First Steps, Session 1 / AGES 18 months - 26 months (Thurs)", discipline: "pre_ballet", day: "thursday", visibility: "hidden",
        description: `AYDT\u2019s Early Childhood programs are taught by a caring faculty of professional dancers with extensive teaching experience. Twins must be accompanied by two adults, one for each child. Class is broken into two 9 week sessions.` },
  14: { name: "Contemporary 1 (Tues)", discipline: "contemporary", day: "tuesday", visibility: "public",
        description: `Available to students in Ballet 5 or Open level ballet 5 and up only as an additional weekly class to complement and add versatility to their training.` },
  15: { name: "Open Level Ballet 4 (Fri)", discipline: "ballet", day: "friday",    visibility: "public",
        description: `Open to students in grades 7 and up who have completed 2 years of Open Level Ballet 1 or equivalent. Older beginners are welcome but may need to take a few private lessons to catch up. AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a senior level class with performance.` },
  16: { name: "Pre-Ballet 1/ AGES 3-4 (Wed)", discipline: "pre_ballet", day: "wednesday", visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a Junior Level Class with performance.` },
  17: { name: "First Steps, Session 2/ AGES 18 months - 26 months (Tues)", discipline: "pre_ballet", day: "tuesday", visibility: "public",
        description: `AYDT\u2019s Early Childhood programs are taught by a caring faculty of professional dancers with extensive teaching experience. Twins must be accompanied by two adults, one for each child. Class is broken into two 9 week sessions.` },
  18: { name: "Tap 1A (Thurs)",      discipline: "tap",          day: "thursday",  visibility: "public",
        description: `The tap program at AYDT focuses on teaching students classical tap steps, rhythm and technique. Class consists of warm-up, stretching and building a vocabulary of steps and combinations. This is a senior level class with performance.` },
  19: { name: "Ballet 1A (Fri)",     discipline: "ballet",       day: "friday",    visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability.` },
  20: { name: "Pre-Ballet 1/ AGES 3-4 (Thurs)", discipline: "pre_ballet", day: "thursday", visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a Junior Level Class with performance.` },
  21: { name: "Broadway 1 (Wed)",    discipline: "jazz",         day: "wednesday", visibility: "public",
        description: `This exciting program introduces students to Broadway style theater jazz. Class work consists of jazz warm up, stretching, and building vocabulary of steps and combinations. Broadway dancers are strongly encouraged to take ballet and tap to complement their training. This is a senior level class with performance.` },
  22: { name: "Contemporary 1 (Wed)", discipline: "contemporary", day: "wednesday", visibility: "public",
        description: `Available to students in Ballet 5 or Open level ballet 5 and up only as an additional weekly class to complement and add versatility to their training.` },
  23: { name: "Hip Hop Intro (Thurs)", discipline: "hip_hop",    day: "thursday",  visibility: "public",
        description: `High energy dance to popular music. This class is a great strength-building and cardio workout that includes warm-up, stretching and building a vocabulary of steps and combinations. All music and movement is age-appropriate. This is a Junior Level class with performance.` },
  24: { name: "Open Level Ballet 4 (Sat)", discipline: "ballet", day: "saturday",  visibility: "public",
        description: `Open to students in grades 7 and up who have completed 2 years of Open Level Ballet 1 or equivalent. Older beginners are welcome but may need to take a few private lessons to catch up. AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a senior level class with performance.` },
  25: { name: "Dance with Me, Session 1/ AGES 2.4 - 3 years (Tues)", discipline: "pre_ballet", day: "tuesday", visibility: "public",
        description: `AYDT\u2019s Early Childhood programs are taught by a caring faculty of professional dancers with extensive teaching experience. Twins must be accompanied by two adults, one for each child. Class is broken into two 9 week sessions.` },
  26: { name: "First Steps, Session 2/ AGES 18 months - 26 months (Thurs)", discipline: "pre_ballet", day: "thursday", visibility: "hidden",
        description: `AYDT\u2019s Early Childhood programs are taught by a caring faculty of professional dancers with extensive teaching experience. Twins must be accompanied by two adults, one for each child. Class is broken into two 9 week sessions.` },
  27: { name: "Broadway 1 (Fri)",    discipline: "jazz",         day: "friday",    visibility: "public",
        description: `This exciting program introduces students to Broadway style theater jazz. Class work consists of jazz warm up, stretching, and building vocabulary of steps and combinations. Broadway dancers are strongly encouraged to take ballet and tap to complement their training. This is a senior level class with performance.` },
  28: { name: "Ballet 1A (Sat)",     discipline: "ballet",       day: "saturday",  visibility: "public",
        description: `AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program. Different classes are available based on individual student\u2019s goals and levels of ability. This is a senior level class with performance.` },
  29: { name: "Graded Ballet 4 (Tues)", discipline: "ballet",    day: "tuesday",   visibility: "public",
        description: `Placement is by faculty recommendation or audition only. Class meets twice a week. AYDT provides quality ballet training for students of all levels, recreational through pre-professional. All classes are taught with a motivational and caring approach and strong emphasis on technique and proper alignment. Our senior faculty is certified in the ABT\u00ae National Training Curriculum, which is taught throughout the program.` },
  30: { name: "Hip Hop 1 (Mon)",     discipline: "hip_hop",      day: "monday",    visibility: "public",
        description: `High energy dance to popular music. This class is a great strength-building and cardio workout that includes warm-up, stretching and building a vocabulary of steps and combinations. All music and movement is age-appropriate. This is a senior level class with performance.` },
  31: { name: "Tap 1B (Mon)",        discipline: "tap",          day: "monday",    visibility: "public",
        description: `The tap program at AYDT focuses on teaching students classical tap steps, rhythm and technique. Class consists of warm-up, stretching and building a vocabulary of steps and combinations. This is a senior level class with performance.` },
  32: { name: "Contemporary 1 (Thurs)", discipline: "contemporary", day: "thursday", visibility: "public",
        description: `Available to students in Ballet 5 or Open level ballet 5 and up only as an additional weekly class to complement and add versatility to their training.` },
};

// ── 127 Session Definitions ───────────────────────────────────────────────────
const DEFS: SessionDef[] = [
  // ── SATURDAY (17) ─────────────────────────────────────────────────────────
  { n:24,  name:"UES Dance 024", division:"senior",          discipline:"ballet",    day:"saturday", startTime:"09:15:00", endTime:"10:30:00", capacity:16, minGrade:5,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:28,  name:"UES Dance 028", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"09:30:00", endTime:"10:30:00", capacity:10, minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:33,  name:"UES Dance 033", division:"early_childhood", discipline:"ballet",    day:"saturday", startTime:"10:00:00", endTime:"10:45:00", capacity:9,  minGrade:-2,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:40,  name:"UES Dance 040", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"09:15:00", endTime:"10:00:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_B },
  { n:42,  name:"UES Dance 042", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"12:15:00", endTime:"13:15:00", capacity:10, minGrade:3,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:57,  name:"UES Dance 057", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"09:15:00", endTime:"10:00:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_C },
  { n:58,  name:"UES Dance 058", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"11:30:00", endTime:"12:15:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_B },
  { n:60,  name:"UES Dance 060", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"09:30:00", endTime:"10:30:00", capacity:10, minGrade:2,    maxGrade:3,    tuition:796.43, regClose:REG_A },
  { n:63,  name:"UES Dance 063", division:"early_childhood", discipline:"ballet",    day:"saturday", startTime:"10:45:00", endTime:"11:30:00", capacity:9,  minGrade:-1,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:73,  name:"UES Dance 073", division:"senior",          discipline:"ballet",    day:"saturday", startTime:"10:30:00", endTime:"12:00:00", capacity:14, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:83,  name:"UES Dance 083", division:"senior",          discipline:"ballet",    day:"saturday", startTime:"10:30:00", endTime:"11:30:00", capacity:8,  minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:84,  name:"UES Dance 084", division:"early_childhood", discipline:"ballet",    day:"saturday", startTime:"11:30:00", endTime:"12:15:00", capacity:9,  minGrade:0,    maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:87,  name:"UES Dance 087", division:"junior",          discipline:"ballet",    day:"saturday", startTime:"10:30:00", endTime:"11:30:00", capacity:10, minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:110, name:"UES Dance 110", division:"senior",          discipline:"ballet",    day:"saturday", startTime:"10:30:00", endTime:"11:45:00", capacity:13, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:119, name:"UES Dance 119", division:"senior",          discipline:"technique", day:"saturday", startTime:"12:00:00", endTime:"14:00:00", capacity:14, minGrade:5,    maxGrade:12,   tuition:716.78, regClose:REG_A },
  { n:122, name:"UES Dance 122", division:"senior",          discipline:"technique", day:"saturday", startTime:"11:30:00", endTime:"13:30:00", capacity:14, minGrade:7,    maxGrade:12,   tuition:716.78, regClose:REG_A },
  { n:124, name:"UES Dance 124", division:"senior",          discipline:"technique", day:"saturday", startTime:"11:45:00", endTime:"13:45:00", capacity:14, minGrade:8,    maxGrade:12,   tuition:716.78, regClose:REG_A },

  // ── WEEKDAY — Page 1 (19) — all day:"monday" placeholder; see GAP 1 ────────
  { n:1,   name:"UES Dance 001", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:2,   name:"UES Dance 002", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:9,  minGrade:-1,   maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:3,   name:"UES Dance 003", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:15:00", endTime:"16:00:00", capacity:7,  minGrade:-2,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:4,   name:"UES Dance 004", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:30:00", capacity:10, minGrade:5,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:5,   name:"UES Dance 005", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:10, minGrade:-1,   maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:6,   name:"UES Dance 006", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:9,  minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:7,   name:"UES Dance 007", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:15:00", capacity:10, minGrade:3,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:8,   name:"UES Dance 008", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"11:00:00", endTime:"11:45:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_B },
  { n:9,   name:"UES Dance 009", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:10, minGrade:3,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:10,  name:"UES Dance 010", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:15:00", capacity:10, minGrade:1,    maxGrade:3,    tuition:796.43, regClose:REG_A },
  { n:11,  name:"UES Dance 011", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"16:00:00", endTime:"16:45:00", capacity:9,  minGrade:-1,   maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:12,  name:"UES Dance 012", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:15:00", capacity:9,  minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:13,  name:"UES Dance 013", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"09:00:00", endTime:"09:45:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_B },
  { n:14,  name:"UES Dance 014", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:8,  minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:15,  name:"UES Dance 015", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"19:00:00", capacity:14, minGrade:5,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:16,  name:"UES Dance 016", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:7,  minGrade:-2,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:17,  name:"UES Dance 017", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"11:00:00", endTime:"11:45:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_C }, // GAP 6: end time corrected PM→AM
  { n:18,  name:"UES Dance 018", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:11, minGrade:1,    maxGrade:3,    tuition:796.43, regClose:REG_A },
  { n:19,  name:"UES Dance 019", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:30:00", capacity:9,  minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },

  // ── WEEKDAY — Page 2 (17) ──────────────────────────────────────────────────
  { n:20,  name:"UES Dance 020", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:7,  minGrade:-2,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:21,  name:"UES Dance 021", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:15:00", capacity:10, minGrade:3,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:22,  name:"UES Dance 022", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:15:00", capacity:11, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:23,  name:"UES Dance 023", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:15:00", endTime:"16:00:00", capacity:9,  minGrade:-1,   maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:25,  name:"UES Dance 025", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"11:45:00", endTime:"12:30:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_B },
  { n:26,  name:"UES Dance 026", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"09:00:00", endTime:"09:45:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_C },
  { n:27,  name:"UES Dance 027", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:3,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:29,  name:"UES Dance 029", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:45:00", capacity:13, minGrade:5,    maxGrade:7,    tuition:796.43, regClose:REG_A },
  { n:30,  name:"UES Dance 030", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:15:00", capacity:9,  minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:31,  name:"UES Dance 031", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:30:00", endTime:"17:30:00", capacity:10, minGrade:2,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:32,  name:"UES Dance 032", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"19:45:00", capacity:9,  minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:34,  name:"UES Dance 034", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"11:00:00", endTime:"11:45:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_B },
  { n:35,  name:"UES Dance 035", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:9,  minGrade:-1,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:36,  name:"UES Dance 036", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:7,  minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:37,  name:"UES Dance 037", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:10, minGrade:3,    maxGrade:6,    tuition:796.43, regClose:REG_A },
  { n:38,  name:"UES Dance 038", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:45:00", capacity:13, minGrade:5,    maxGrade:7,    tuition:796.43, regClose:REG_A },
  { n:39,  name:"UES Dance 039", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:8,  minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A },

  // ── WEEKDAY — Page 3 (16) ──────────────────────────────────────────────────
  { n:41,  name:"UES Dance 041", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:8,  minGrade:2,    maxGrade:3,    tuition:796.43, regClose:REG_A },
  { n:43,  name:"UES Dance 043", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:8,  minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:44,  name:"UES Dance 044", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:3,    maxGrade:5,    tuition:796.43, regClose:REG_A },
  { n:45,  name:"UES Dance 045", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:15:00", capacity:7,  minGrade:5,    maxGrade:9,    tuition:796.43, regClose:REG_A },
  { n:46,  name:"UES Dance 046", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"16:00:00", endTime:"16:45:00", capacity:7,  minGrade:-1,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:47,  name:"UES Dance 047", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:9,  minGrade:2,    maxGrade:3,    tuition:796.43, regClose:REG_A },
  { n:48,  name:"UES Dance 048", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:45:00", capacity:12, minGrade:6,    maxGrade:9,    tuition:796.43, regClose:REG_A }, // GAP 4: PrePointe add-on in Active.com
  { n:49,  name:"UES Dance 049", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:11, minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:50,  name:"UES Dance 050", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"11:45:00", endTime:"12:30:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_C },
  { n:51,  name:"UES Dance 051", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:11, minGrade:5,    maxGrade:9,    tuition:796.43, regClose:REG_A },
  { n:52,  name:"UES Dance 052", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:00:00", capacity:7,  minGrade:-1,   maxGrade:-1,   tuition:775.93, regClose:REG_A },
  { n:53,  name:"UES Dance 053", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:00:00", endTime:"17:00:00", capacity:10, minGrade:1,    maxGrade:2,    tuition:796.43, regClose:REG_A },
  { n:54,  name:"UES Dance 054", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:9,  minGrade:2,    maxGrade:3,    tuition:796.43, regClose:REG_A },
  { n:55,  name:"UES Dance 055", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:45:00", capacity:12, minGrade:6,    maxGrade:9,    tuition:796.43, regClose:REG_A }, // GAP 4: PrePointe add-on
  { n:56,  name:"UES Dance 056", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:30:00", endTime:"18:30:00", capacity:10, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:59,  name:"UES Dance 059", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:15:00", endTime:"17:15:00", capacity:10, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },

  // ── WEEKDAY — Page 4 (17) ──────────────────────────────────────────────────
  { n:61,  name:"UES Dance 061", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:15:00", endTime:"19:45:00", capacity:14, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:62,  name:"UES Dance 062", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"15:40:00", endTime:"16:40:00", capacity:11, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:64,  name:"UES Dance 064", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:null, maxGrade:null, tuition:796.43, regClose:REG_A }, // GAP 6: no grade range in export
  { n:65,  name:"UES Dance 065", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"11:00:00", endTime:"11:45:00", capacity:8,  minGrade:null, maxGrade:null, tuition:394.11, regClose:REG_C },
  { n:66,  name:"UES Dance 066", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:30:00", capacity:9,  minGrade:0,    maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:67,  name:"UES Dance 067", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:11, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:68,  name:"UES Dance 068", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:15:00", capacity:10, minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:69,  name:"UES Dance 069", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"19:00:00", endTime:"20:30:00", capacity:14, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:70,  name:"UES Dance 070", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:8,  minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:71,  name:"UES Dance 071", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:40:00", endTime:"17:40:00", capacity:11, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:72,  name:"UES Dance 072", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:8,  minGrade:0,    maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:74,  name:"UES Dance 074", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:9,  minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:75,  name:"UES Dance 075", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:8,  minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:76,  name:"UES Dance 076", division:"early_childhood", discipline:"ballet",    day:"monday",   startTime:"15:30:00", endTime:"16:15:00", capacity:9,  minGrade:0,    maxGrade:0,    tuition:775.93, regClose:REG_A },
  { n:77,  name:"UES Dance 077", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:6,  minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:78,  name:"UES Dance 078", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:79,  name:"UES Dance 079", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },

  // ── WEEKDAY — Page 5 (15) ──────────────────────────────────────────────────
  { n:80,  name:"UES Dance 080", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:45:00", capacity:10, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A }, // GAP 4: PrePointe add-on
  { n:81,  name:"UES Dance 081", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:15:00", capacity:6,  minGrade:4,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:82,  name:"UES Dance 082", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:11, minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:85,  name:"UES Dance 085", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"19:15:00", capacity:15, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A }, // GAP 4: BegPointe add-on
  { n:86,  name:"UES Dance 086", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:30:00", endTime:"19:30:00", capacity:10, minGrade:4,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:88,  name:"UES Dance 088", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"15:45:00", endTime:"16:45:00", capacity:10, minGrade:3,    maxGrade:4,    tuition:796.43, regClose:REG_A },
  { n:89,  name:"UES Dance 089", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"20:00:00", capacity:15, minGrade:3,    maxGrade:7,    tuition:842.61, regClose:REG_A }, // GAP 7: special pricing
  { n:90,  name:"UES Dance 090", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"19:45:00", capacity:10, minGrade:6,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:91,  name:"UES Dance 091", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"19:15:00", capacity:15, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A }, // GAP 4: BegPointe add-on
  { n:92,  name:"UES Dance 092", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:40:00", endTime:"18:40:00", capacity:11, minGrade:4,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:93,  name:"UES Dance 093", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:15:00", endTime:"18:15:00", capacity:10, minGrade:5,    maxGrade:7,    tuition:796.43, regClose:REG_A },
  { n:94,  name:"UES Dance 094", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:30:00", endTime:"17:45:00", capacity:10, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:95,  name:"UES Dance 095", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:30:00", endTime:"19:30:00", capacity:9,  minGrade:6,    maxGrade:10,   tuition:796.43, regClose:REG_A },
  { n:96,  name:"UES Dance 096", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"20:15:00", capacity:15, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A }, // GAP 4: IntPointe add-on
  { n:97,  name:"UES Dance 097", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"19:45:00", capacity:11, minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },

  // ── WEEKDAY — Page 6 (20) ──────────────────────────────────────────────────
  { n:98,  name:"UES Dance 098", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:00:00", endTime:"17:15:00", capacity:10, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:99,  name:"UES Dance 099", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:40:00", endTime:"19:40:00", capacity:11, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:100, name:"UES Dance 100", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:12, minGrade:5,    maxGrade:7,    tuition:796.43, regClose:REG_A },
  { n:101, name:"UES Dance 101", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:00:00", endTime:"18:00:00", capacity:11, minGrade:5,    maxGrade:7,    tuition:796.43, regClose:REG_A },
  { n:102, name:"UES Dance 102", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:9,  minGrade:6,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:103, name:"UES Dance 103", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"20:15:00", capacity:15, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A }, // GAP 4: IntPointe add-on
  { n:104, name:"UES Dance 104", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:30:00", endTime:"17:45:00", capacity:14, minGrade:4,    maxGrade:8,    tuition:796.43, regClose:REG_A },
  { n:105, name:"UES Dance 105", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:10, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:106, name:"UES Dance 106", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:10, minGrade:5,    maxGrade:7,    tuition:796.43, regClose:REG_A },
  { n:107, name:"UES Dance 107", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:10, minGrade:8,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:108, name:"UES Dance 108", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"20:15:00", capacity:8,  minGrade:9,    maxGrade:12,   tuition:796.43, regClose:REG_A }, // GAP 4: Pointe add-on
  { n:109, name:"UES Dance 109", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:12, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:111, name:"UES Dance 111", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:00:00", endTime:"17:15:00", capacity:13, minGrade:3,    maxGrade:6,    tuition:796.43, regClose:REG_A },
  { n:112, name:"UES Dance 112", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"20:15:00", capacity:8,  minGrade:8,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:113, name:"UES Dance 113", division:"junior",          discipline:"ballet",    day:"monday",   startTime:"16:45:00", endTime:"17:45:00", capacity:10, minGrade:null, maxGrade:null, tuition:796.43, regClose:REG_A }, // GAP 6: null grade; times corrected AM→PM
  { n:114, name:"UES Dance 114", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:14, minGrade:7,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:115, name:"UES Dance 115", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"16:00:00", endTime:"17:15:00", capacity:13, minGrade:3,    maxGrade:6,    tuition:796.43, regClose:REG_A },
  { n:116, name:"UES Dance 116", division:"senior",          discipline:"technique", day:"monday",   startTime:"18:45:00", endTime:"20:45:00", capacity:12, minGrade:5,    maxGrade:12,   tuition:716.78, regClose:REG_A }, // GAP 7: technique / competition track
  { n:117, name:"UES Dance 117", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:11, minGrade:8,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:118, name:"UES Dance 118", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:15:00", endTime:"19:15:00", capacity:11, minGrade:7,    maxGrade:9,    tuition:796.43, regClose:REG_A },

  // ── WEEKDAY — Page 7 (6) ───────────────────────────────────────────────────
  { n:120, name:"UES Dance 120", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:00:00", endTime:"19:00:00", capacity:10, minGrade:7,    maxGrade:9,    tuition:796.43, regClose:REG_A },
  { n:121, name:"UES Dance 121", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"17:45:00", endTime:"18:45:00", capacity:10, minGrade:7,    maxGrade:9,    tuition:796.43, regClose:REG_A },
  { n:123, name:"UES Dance 123", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"19:45:00", capacity:10, minGrade:9,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:125, name:"UES Dance 125", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"19:00:00", endTime:"20:00:00", capacity:9,  minGrade:9,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:126, name:"UES Dance 126", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"19:15:00", endTime:"20:15:00", capacity:9,  minGrade:8,    maxGrade:12,   tuition:796.43, regClose:REG_A },
  { n:127, name:"UES Dance 127", division:"senior",          discipline:"ballet",    day:"monday",   startTime:"18:45:00", endTime:"20:00:00", capacity:15, minGrade:8,    maxGrade:12,   tuition:802.94, regClose:REG_A }, // GAP 7: special pricing
];

// ── Registration form elements ────────────────────────────────────────────────
// IDs use sp26m- prefix (Main / UES). Same fields as North location.
const FORM_ELEMENTS = [
  {
    id: "sp26m-form-elem-001",
    type: "text_block",
    htmlContent:
      "<p><strong>AYDT adheres to a strict attendance policy for ages 3.5-Teens to ensure the success of our performances in December &amp; June. We DO NOT make exceptions. PLEASE COMPARE OUR CALENDAR TO YOUR CHILD'S SCHOOL CALENDAR. If you think you are going to miss more than 2 classes and you don't want to pay for private lessons to make up for the absences, it's best not to register this semester. Please CHECK REHEARSAL &amp; RECITAL DATES and mark them in your calendar before registering to make sure this is something you can commit to. NOTE: The Senior recital (grades 1-12) is a multi-day commitment. THERE ARE NO EXCEPTIONS.</strong></p>",
    textFormatting: { style: "normal", bold: true, italic: false, underline: false, color: "indigo" },
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-002",
    type: "question",
    label: "School Name",
    reportLabel: "School Name",
    inputType: "short_answer",
    required: false,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-003",
    type: "text_block",
    htmlContent:
      "<p><strong>If your child is not in school yet please select \"pre-school\" for the Grade question.</strong></p>",
    textFormatting: { style: "normal", bold: true, italic: false, underline: false, color: "indigo" },
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-004",
    type: "question",
    label: "Home phone number",
    reportLabel: "Home Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-005",
    type: "question",
    label: "Nanny/Caregiver",
    reportLabel: "Nanny/Caregiver",
    inputType: "short_answer",
    required: false,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-006",
    type: "question",
    label: "How did you hear about our school?",
    reportLabel: "How Did You Hear About Us",
    inputType: "short_answer",
    required: false,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-007",
    type: "subheader",
    label: "Emergency Contact Information",
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-008",
    type: "question",
    label: "Emergency Contact Name",
    reportLabel: "Emergency Contact Name",
    inputType: "short_answer",
    required: true,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-009",
    type: "question",
    label: "Emergency Contact Relationship to the Child",
    reportLabel: "Emergency Contact Relationship",
    inputType: "short_answer",
    required: true,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-010",
    type: "question",
    label: "Emergency Contact Cell Phone",
    reportLabel: "Emergency Contact Cell Phone",
    inputType: "phone_number",
    required: true,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-011",
    type: "text_block",
    htmlContent:
      "<p><strong>IN THE EVENT THAT WE NEED TO CONTACT A SECOND PARENT LIVING IN SEPARATE QUARTERS, PLEASE ADD SECONDARY PARENT/GUARDIAN INFORMATION BELOW.</strong></p>",
    textFormatting: { style: "normal", bold: true, italic: false, underline: false, color: "indigo" },
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-012",
    type: "question",
    label: "Cell phone number",
    reportLabel: "Parent Cell Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-013",
    type: "question",
    label: "Home phone number",
    reportLabel: "Parent Home Phone",
    inputType: "phone_number",
    required: false,
    sessionIds: [],
  },
  {
    id: "sp26m-form-elem-014",
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
  console.log("🌱  Seeding AYDT_MAIN: UES-SPRING-SEASON-2026…\n");

  // ── 1. Semester ──────────────────────────────────────────────────────────
  await upsert("semesters", {
    id: SEM_ID,
    name: "AYDT_MAIN: UES-SPRING-SEASON-2026",
    description:
      "Spring 2026 semester at American Youth Dance Theater – UES Main location. Classes run January 26 – June 20, 2026.",
    status: "published",
    publish_at: new Date("2026-01-01").toISOString(),
    published_at: new Date("2026-01-01").toISOString(),
    created_by: ADMIN_ID,
    updated_by: ADMIN_ID,
    tracking_mode: false,
    capacity_warning_threshold: 3,
    registration_form: { elements: FORM_ELEMENTS },
    confirmation_email: {
      subject: "You're registered for AYDT UES Spring 2026!",
      senderName: "AYDT Studio",
      senderEmail: "no-reply@aydt.com",
      bodyHtml:
        "<p>Hi {{first_name}},</p><p>Thank you for registering for the Spring 2026 semester at AYDT UES! We look forward to seeing you in class.</p>",
    },
    waitlist_settings: {
      enabled: true,
      inviteExpiryHours: 48,
      stopDaysBeforeClose: 3,
    },
  });
  console.log("  ✓ Semester: AYDT_MAIN: UES-SPRING-SEASON-2026");

  // ── 2. Fee config ─────────────────────────────────────────────────────────
  await upsert(
    "semester_fee_config",
    {
      semester_id: SEM_ID,
      registration_fee_per_child: 40.00,
      family_discount_amount: 50.00,
      auto_pay_admin_fee_monthly: 5.00,
      auto_pay_installment_count: 5,
      senior_video_fee_per_registrant: 15.00,
      senior_costume_fee_per_class: 65.00,
      junior_costume_fee_per_class: 55.00,
    },
    "semester_id",
  );
  console.log("  ✓ Fee config");

  // ── 3. Payment plan ───────────────────────────────────────────────────────
  // GAP 5: semester_payment_plans uses semester_id as primary key — only ONE
  // plan per semester is supported by the current schema. UES offers a $25
  // deposit option, but adding deposit_flat requires a schema migration first
  // (add composite PK on (semester_id, type) or a separate id column).
  // Seeding pay_in_full only for now.
  await upsert(
    "semester_payment_plans",
    { semester_id: SEM_ID, type: "pay_in_full", deposit_amount: null, deposit_percent: null, installment_count: null, due_date: END_DATE },
    "semester_id",
  );
  console.log("  ✓ Payment plan: pay_in_full (deposit_flat deferred — see GAP 5)");

  // ── 4. Tuition rate bands ─────────────────────────────────────────────────
  await del("tuition_rate_bands", "semester_id", SEM_ID);
  await upsert("tuition_rate_bands", [
    {
      semester_id: SEM_ID,
      division: "early_childhood",
      weekly_class_count: 1,
      base_tuition: 775.93,
      progressive_discount_percent: 0,
      semester_total: 815.93, // base + $40 reg fee
      autopay_installment_amount: null,
    },
    {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 1,
      base_tuition: 796.43,
      progressive_discount_percent: 0,
      semester_total: 836.43,
      autopay_installment_amount: null,
    },
    {
      semester_id: SEM_ID,
      division: "junior",
      weekly_class_count: 2,
      base_tuition: 1592.86,
      progressive_discount_percent: 0,
      semester_total: 1632.86,
      autopay_installment_amount: null,
    },
    {
      semester_id: SEM_ID,
      division: "senior",
      weekly_class_count: 1,
      base_tuition: 796.43,
      progressive_discount_percent: 0,
      semester_total: 836.43,
      autopay_installment_amount: null,
    },
    {
      semester_id: SEM_ID,
      division: "senior",
      weekly_class_count: 2,
      base_tuition: 1592.86,
      progressive_discount_percent: 0,
      semester_total: 1632.86,
      autopay_installment_amount: null,
    },
    {
      semester_id: SEM_ID,
      division: "senior",
      weekly_class_count: 3,
      base_tuition: 2389.29,
      progressive_discount_percent: 0,
      semester_total: 2429.29,
      autopay_installment_amount: null,
    },
  ]);
  console.log("  ✓ Tuition rate bands (6 rows)");

  // ── 5. Classes (127) ──────────────────────────────────────────────────────
  const classRows = DEFS.map((d) => {
    const ov = OVERRIDES[d.n];
    return {
      id: cId(d.n),
      semester_id: SEM_ID,
      name:        ov?.name        ?? d.name,
      discipline:  ov?.discipline  ?? d.discipline,
      division:    d.division,
      description: ov?.description ?? getDesc(d),
      min_grade:   d.minGrade,
      max_grade:   d.maxGrade,
      is_active:   true,
      is_competition_track: d.tuition === 716.78,
      requires_teacher_rec: false,
      visibility:  ov?.visibility  ?? "public",
      enrollment_type: "standard",
    };
  });
  await upsert("classes", classRows);
  console.log(`  ✓ Classes (${classRows.length})`);

  // ── 6. Class schedules (127) ──────────────────────────────────────────────
  const schedRows = DEFS.map((d) => {
    const day = OVERRIDES[d.n]?.day ?? d.day;
    return {
    id: scId(d.n),
    class_id: cId(d.n),
    semester_id: SEM_ID,
    days_of_week: [day],
    start_time: d.startTime,
    end_time: d.endTime,
    start_date: sessionStartDate(d.regClose),
    end_date: sessionEndDate(d.regClose),
    location: LOCATION,
    instructor_name: null,
    capacity: d.capacity,
    registration_open_at: null,
    registration_close_at: d.regClose,
    gender_restriction: "no_restriction",
    pricing_model: "full_schedule",
    };
  });
  await upsert("class_schedules", schedRows);
  console.log(`  ✓ Class schedules (${schedRows.length})`);

  // ── 7. Schedule price tiers (one per schedule) ────────────────────────────
  for (const d of DEFS) {
    const { error } = await sb
      .from("schedule_price_tiers")
      .delete()
      .eq("schedule_id", scId(d.n));
    if (error) console.warn(`  ⚠ clearing price tiers for n=${d.n}: ${error.message}`);
  }
  const priceTierRows = DEFS.map((d, i) => ({
    id: `00002026-0002-0005-0000-${String(i + 1).padStart(12, "0")}`,
    schedule_id: scId(d.n),
    label: "Price",
    amount: Math.round(d.tuition * 100),
    sort_order: 0,
    is_default: true,
  }));
  await upsert("schedule_price_tiers", priceTierRows);
  console.log(`  ✓ Schedule price tiers (${priceTierRows.length})`);

  // ── 8. Class sessions (one per schedule) ─────────────────────────────────
  const sessionRows = DEFS.map((d) => {
    const day = OVERRIDES[d.n]?.day ?? d.day;
    return {
    id: ssId(d.n),
    class_id: cId(d.n),
    schedule_id: scId(d.n),
    semester_id: SEM_ID,
    day_of_week: day,
    start_time: d.startTime,
    end_time: d.endTime,
    start_date: sessionStartDate(d.regClose),
    end_date: sessionEndDate(d.regClose),
    location: LOCATION,
    instructor_name: null,
    capacity: d.capacity,
    cloned_from_session_id: null,
    registration_close_at: d.regClose,
    is_active: true,
    };
  });
  await upsert("class_sessions", sessionRows);
  console.log(`  ✓ Class sessions (${sessionRows.length})`);

  // ── 9. Session groups ─────────────────────────────────────────────────────
  await upsert("session_groups", [
    { id: SG_EARLY_CHILDHOOD, semester_id: SEM_ID, name: "Early Childhood", description: "Pre-K3 through Kindergarten ballet classes" },
    { id: SG_JUNIOR,          semester_id: SEM_ID, name: "Junior",          description: "Grades 1–5 ballet classes" },
    { id: SG_SENIOR,          semester_id: SEM_ID, name: "Senior",          description: "Grades 5–12 ballet classes" },
    { id: SG_SATURDAY,        semester_id: SEM_ID, name: "Saturday",        description: "All Saturday classes" },
    { id: SG_OPEN,            semester_id: SEM_ID, name: "Open / Partial",  description: "Open-level partial-semester enrollment ($394.11)" },
    { id: SG_SPECIAL,         semester_id: SEM_ID, name: "Special",         description: "Special-pricing classes ($716.78 / $842.61 / $802.94)" },
  ]);
  console.log("  ✓ Session groups (6)");

  // ── 10. Session group memberships ─────────────────────────────────────────
  for (const gid of [SG_EARLY_CHILDHOOD, SG_JUNIOR, SG_SENIOR, SG_SATURDAY, SG_OPEN, SG_SPECIAL]) {
    await del("session_group_sessions", "session_group_id", gid);
  }

  const groupMemberships = DEFS.flatMap((d) =>
    getGroups(d).map((gid) => ({
      session_group_id: gid,
      session_id: ssId(d.n),
    })),
  );
  await upsert("session_group_sessions", groupMemberships);
  console.log(`  ✓ Session group memberships (${groupMemberships.length})`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const saturdays  = DEFS.filter((d) => d.day === "saturday").length;
  const weekdays   = DEFS.filter((d) => d.day !== "saturday").length;
  const openCount  = DEFS.filter((d) => d.tuition === 394.11).length;
  const specCount  = DEFS.filter((d) => [716.78, 842.61, 802.94].includes(d.tuition)).length;

  console.log(`
Done ✓

  Semester ID  : ${SEM_ID}
  Sessions     : ${DEFS.length} total (${saturdays} Saturday + ${weekdays} weekday)
  Open classes : ${openCount} ($394.11 partial-semester, SG_OPEN)
  Special      : ${specCount} (intensive/special pricing, SG_SPECIAL)
  Groups       : 6 (Early Childhood, Junior, Senior, Saturday, Open, Special)
  Payment plan : pay_in_full only (deposit_flat blocked — see GAP 5)
  Rate bands   : 6 (EC×1, Jr×1, Jr×2, Sr×1, Sr×2, Sr×3)
  Form fields  : ${FORM_ELEMENTS.length} custom elements

  ⚠  ACTION REQUIRED — see GAPs 1–7 in script header:
     GAP 1: Update day-of-week for all ${weekdays} weekday classes (currently "monday")
     GAP 2: Replace "UES Dance NNN" names with real class names
     GAP 3: Verify discipline assignments beyond default "ballet"
     GAP 4: Handle Pointe add-ons for rows 48,55,80,85,91,96,103,108
     GAP 5: Confirm deposit plan installment schedule
     GAP 6: Set grade ranges for rows 8,13,17,25,26,34,40,50,57,58,64,65,113
     GAP 7: Verify special pricing bands for rows 89,116,119,122,124,127

  Re-run \`npx tsx scripts/seed-spring-2026-ues.ts\` anytime to re-seed safely.
`);
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
