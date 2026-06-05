/**
 * scripts/seed-spring-2026-ues-active.ts
 *
 * Builds a fresh AYDT semester from the authoritative ACTIVE Works CSV export:
 *   scrape-spring-2026-export.csv   (gitignored — client roster, do NOT commit)
 *
 * This is a NEW, self-contained seed. It does NOT touch scripts/seed-spring-2026-ues.ts
 * (which used an older, inferior export). Its own SEM_ID namespace, so the two
 * semesters coexist. Re-runnable (deterministic IDs + upsert / delete+reinsert).
 *
 * Run:  npx tsx scripts/seed-spring-2026-ues-active.ts
 *
 * Source of truth (confirmed 2026-06-04): the CSV's per-row tuition/grades/days/
 * capacity/visibility. The UI-scrape JSON (scrape-spring-2026.json) is SUPERSEDED
 * and ignored here.
 *
 * ── Mapping rules ─────────────────────────────────────────────────────────────
 *  • ACTIVE "Session" (one row per weekday) → one AYDT class_schedule. Rows sharing
 *    a base class name (after stripping the trailing "(Day…)" suffix) collapse into
 *    ONE class with multiple schedules. e.g. Ballet 1A (Tues/Wed/Fri/Sat) = 1 class.
 *  • Tuition: 6 real tiers read per-row — 796.43 standard / 775.93 intro-pre /
 *    716.78 technique / 394.11 EC half-season / 842.61 Comp JR / 802.94 Comp SR.
 *  • Discipline: Session Type → ballet | hip_hop | contemporary | broadway (ACTIVE
 *    types Broadway as "Jazz") | tap; name "Technique*" → technique (fee-exempt).
 *  • Division: EC names → early_childhood; Comp Team → competition; else jr/sr from
 *    which recital fee (JR vs SR) the row carries.
 *  • Grades: Pre-School=-2, Pre-K=-1, K=0, Nth=N. Boys'/Men's HH + early-childhood
 *    use age (years or months parsed from the name / Age Restriction cols).
 *  • Visibility: "Online"→public, "Internal only"→hidden, "Inactive"→hidden+inactive.
 *  • Fees: global semester_fee_config (matches ACTIVE exactly). Reg $40 once/child,
 *    Sr video $15, Sr costume(=recital) $65 / Jr $55, $25 deposit = $5×5 auto-pay.
 *  • Comp Team JR/SR are STANDARD classes (real Fri meeting time, hidden), NOT
 *    competition_track — so they keep their schedule. Division 'competition'
 *    auto-exempts them from the costume(recital) fee.
 *
 * ── Known approximations (logged at run end) ──────────────────────────────────
 *  • Pointe / Pre-Pointe supplements (extra Tuition/Option rows on advanced ballet,
 *    $228.82–$517.49) have no AYDT class-add-on concept → reported, not seeded.
 *  • Multi-SESSION progressive discount (2nd=5%…6th=75%) needs a pricing-engine
 *    change → deferred, not seeded. Multi-PERSON ($50 @ 2+) = family_discount_amount.
 *  • Time typos auto-fixed: Boys' HH 3/4 "04:45 AM"→PM; First Steps S2 Tue "11:45 PM"→AM.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ADMIN_ID = "64ebf65c-e32f-4e22-9440-e7bb5a0fee8d"; // Ethan Flores
const CSV_PATH = resolve(__dirname, "../scrape-spring-2026-export.csv");

// ── Deterministic IDs — namespace 00002026-0003 = UES Spring 2026 (ACTIVE export)
const SEM_ID = "00002026-0003-0000-0000-000000000001";
const pad12 = (n: number) => String(n).padStart(12, "0");
const cId  = (n: number) => `00002026-0003-0001-0000-${pad12(n)}`;
const scId = (n: number) => `00002026-0003-0002-0000-${pad12(n)}`;
const ssId = (n: number) => `00002026-0003-0003-0000-${pad12(n)}`;
const tId  = (n: number) => `00002026-0003-0005-0000-${pad12(n)}`;
const gId  = (n: number) => `00002026-0003-0004-0000-${pad12(n)}`;

const LOCATION = "American Youth Dance Theater";

/* ────────────────────────────── CSV parser ──────────────────────────────────*/
// Handles quoted fields, escaped quotes (""), and embedded newlines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 && r.some((c) => c.trim() !== ""));
}

/* ────────────────────────────── Helpers ─────────────────────────────────────*/
const DAY_COLS: Record<string, string> = {
  "Days of The week - Monday": "monday",
  "Days of The week - Tuesday": "tuesday",
  "Days of The week - Wednesday": "wednesday",
  "Days of The week - Thursday": "thursday",
  "Days of The week - Friday": "friday",
  "Days of The week - Saturday": "saturday",
  "Days of The week - Sunday": "sunday",
};

function parseTime(raw: string): string | null {
  // "03:45 PM" -> "15:45:00"
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}:00`;
}

function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function gradeToInt(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "pre-school" || s === "preschool") return -2;
  if (s === "pre-k" || s === "prek") return -1;
  if (s === "k" || s === "kindergarten") return 0;
  const m = s.match(/^(\d{1,2})/);
  return m ? parseInt(m[1], 10) : null;
}

function disciplineFor(name: string, sessionType: string): string {
  if (/^technique/i.test(name)) return "technique";
  const t = sessionType.trim().toLowerCase();
  if (t === "hip hop") return "hip_hop";
  if (t === "tap") return "tap";
  if (t === "contemporary") return "contemporary";
  if (t === "jazz") return "broadway"; // ACTIVE types Broadway as "Jazz"; client wants "broadway"
  if (t === "competition") return "ballet";
  return "ballet"; // Ballet, Pre-Ballet, default
}

function isEarlyChildhoodName(name: string): boolean {
  return /pre-ballet|first steps|dance with me/i.test(name);
}

type FeeFlags = { jrRecital: boolean; srRecital: boolean; srVideo: boolean; pointe: string[] };

function scanOptionsAndTuitions(row: string[], idx: Record<string, number>): FeeFlags {
  const flags: FeeFlags = { jrRecital: false, srRecital: false, srVideo: false, pointe: [] };
  for (let i = 1; i <= 10; i++) {
    const oName = (row[idx[`Option${i} - Name`]] ?? "").trim();
    const oPrice = (row[idx[`Option${i} - Price`]] ?? "").trim();
    if (/jr recital/i.test(oName)) flags.jrRecital = true;
    if (/sr recital/i.test(oName)) flags.srRecital = true;
    if (/sr\.? video|video fee/i.test(oName)) flags.srVideo = true;
    if (/pointe/i.test(oName)) flags.pointe.push(`${oName} ($${oPrice})`);
  }
  // Pointe supplements can also appear as extra Tuition rows (Tuition2+).
  for (let i = 2; i <= 10; i++) {
    const tName = (row[idx[`Tuition${i} - Name`]] ?? "").trim();
    const tPrice = (row[idx[`Tuition${i} - Price`]] ?? "").trim();
    if (/pointe/i.test(tName)) flags.pointe.push(`${tName} ($${tPrice})`);
  }
  return flags;
}

function visibilityFor(displayStatus: string): { visibility: string; active: boolean } {
  const s = displayStatus.trim().toLowerCase();
  if (s === "internal only") return { visibility: "hidden", active: true };
  if (s === "inactive") return { visibility: "hidden", active: false };
  return { visibility: "public", active: true };
}

// Strip trailing "(Tues)", "(Tues, 3:40pm)", "(SAT)", etc. to get the canonical class name.
function baseName(name: string): string {
  return name
    .replace(/\s*\((?:mon|tue?s?|wed|thu(?:rs)?|fri|sat|sun)[^)]*\)\s*$/i, "")
    .trim();
}

// Parse age (years or months) from the class name where present.
function ageFromName(name: string): { minMonths?: number; maxMonths?: number; minYears?: number; maxYears?: number } {
  const mMonths = name.match(/(\d+)\s*months?\s*-\s*(\d+)\s*months?/i);
  if (mMonths) return { minMonths: parseInt(mMonths[1], 10), maxMonths: parseInt(mMonths[2], 10) };
  const mDwm = name.match(/AGES\s*2\.4\s*-\s*3\s*years/i);
  if (mDwm) return { minMonths: 29, maxMonths: 36 }; // "2.4–3 years"
  const mYears = name.match(/AGES\s*(\d+)\s*-\s*(\d+)/i);
  if (mYears) return { minYears: parseInt(mYears[1], 10), maxYears: parseInt(mYears[2], 10) };
  return {};
}

/* ────────────────────────────── Row model ───────────────────────────────────*/
interface SessionRow {
  name: string;
  base: string;
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  minGrade: number | null;
  maxGrade: number | null;
  ageFromCol: number | null;
  ageToCol: number | null;
  capacity: number | null;
  visibility: string;
  active: boolean;
  tuition: number;
  discipline: string;
  sessionType: string;
  fees: FeeFlags;
  description: string;
  closeReg: string | null;
}

function timeTypoFix(name: string, day: string | null, start: string | null, end: string | null) {
  // Boys' HH 3/4 (Fri) exported as 04:45 AM–05:45 AM → afternoon class.
  if (/boys' hip hop and breakdancing 3\/4/i.test(name)) return { start: "16:45:00", end: "17:45:00" };
  // First Steps Session 2 (Tues) exported with end "11:45 PM".
  if (/first steps, session 2/i.test(name) && end === "23:45:00") return { start, end: "11:45:00" };
  return { start, end };
}

async function main() {
  console.log("🌱  Seeding AYDT Main: UES Spring 2026 (from ACTIVE CSV export)…\n");

  let raw: string;
  try {
    raw = readFileSync(CSV_PATH, "utf8");
  } catch {
    throw new Error(`Could not read ${CSV_PATH} — save the ACTIVE export there first.`);
  }
  const table = parseCSV(raw);
  const header = table[0];
  const idx: Record<string, number> = {};
  header.forEach((h, i) => (idx[h.trim()] = i));

  const rows: SessionRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const name = (row[idx["Session Name"]] ?? "").trim();
    if (!name) continue;

    let day: string | null = null;
    for (const [col, d] of Object.entries(DAY_COLS)) {
      if ((row[idx[col]] ?? "").trim().toLowerCase() === "yes") { day = d; break; }
    }

    const sessionType = (row[idx["Session Type Name"]] ?? "").trim();
    const fees = scanOptionsAndTuitions(row, idx);
    const vis = visibilityFor(row[idx["Display Status"]] ?? "");
    let start = parseTime(row[idx["Start Time"]] ?? "");
    let end = parseTime(row[idx["End Time"]] ?? "");
    ({ start, end } = timeTypoFix(name, day, start, end));

    rows.push({
      name,
      base: baseName(name),
      day,
      startTime: start,
      endTime: end,
      startDate: parseDate(row[idx["Start Date"]] ?? ""),
      endDate: parseDate(row[idx["End Date"]] ?? ""),
      minGrade: gradeToInt(row[idx["Grade Restriction - From"]] ?? ""),
      maxGrade: gradeToInt(row[idx["Grade Restriction - To"]] ?? ""),
      ageFromCol: (row[idx["Age Restriction - From"]] ?? "").trim() ? parseInt(row[idx["Age Restriction - From"]], 10) : null,
      ageToCol: (row[idx["Age Restriction - To"]] ?? "").trim() ? parseInt(row[idx["Age Restriction - To"]], 10) : null,
      capacity: (row[idx["Session Capacity"]] ?? "").trim() ? parseInt(row[idx["Session Capacity"]], 10) : null,
      visibility: vis.visibility,
      active: vis.active,
      tuition: parseFloat(row[idx["Tuition1 - Price"]] ?? "0") || 0,
      discipline: disciplineFor(name, sessionType),
      sessionType,
      fees,
      description: (row[idx["Description"]] ?? "").trim(),
      closeReg: (row[idx["Close Registration On"]] ?? "").trim() || null,
    });
  }

  console.log(`  Parsed ${rows.length} session rows from CSV.`);

  // ── Group rows into classes by base name ────────────────────────────────────
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) {
    if (!groups.has(row.base)) groups.set(row.base, []);
    groups.get(row.base)!.push(row);
  }
  console.log(`  → ${groups.size} distinct classes.\n`);

  // ── 1. Semester ─────────────────────────────────────────────────────────────
  await upsert("semesters", {
    id: SEM_ID,
    name: "AYDT Main: UES - Spring Season 2026",
    description:
      "Spring 2026 semester — UES Main. Imported from the studio's ACTIVE Works season (Jan 26 – Jun 20, 2026).",
    status: "draft",
    created_by: ADMIN_ID,
    updated_by: ADMIN_ID,
    tracking_mode: false,
    capacity_warning_threshold: 90,
    capacity_warning_mode: "percent", // ACTIVE's 90 = warn at 90% full (requires 20260605010000 migration)
    registration_form: { elements: FORM_ELEMENTS },
    confirmation_email: {
      subject: "You're registered for AYDT — UES Spring 2026!",
      senderName: "American Youth Dance Theater",
      senderEmail: "admin@aydt.nyc",
      bodyHtml:
        "<p>Hi {{first_name}},</p><p>Thank you for registering for the Spring 2026 semester at American Youth Dance Theater! We look forward to seeing you in class. Please review our policies, refund terms, and uniform requirements in your account.</p>",
    },
    waitlist_settings: { enabled: true, inviteExpiryHours: 24, stopDaysBeforeClose: 3 },
  });
  console.log("  ✓ Semester");

  // ── 2. Fee config (matches ACTIVE exactly) ──────────────────────────────────
  await upsert(
    "semester_fee_config",
    {
      semester_id: SEM_ID,
      registration_fee_per_child: 40.0,
      family_discount_amount: 50.0, // multi-person discount ($50 @ 2+)
      auto_pay_admin_fee_monthly: 5.0,
      auto_pay_installment_count: 5, // 5 × $5 = the $25 "Deposit and Payment Plan"
      senior_video_fee_per_registrant: 15.0,
      senior_costume_fee_per_class: 65.0, // SR Recital Fee
      junior_costume_fee_per_class: 55.0, // JR Recital Fee
      costume_fee_exempt_keys: ["technique", "pointe", "competition"],
    },
    "semester_id",
  );
  console.log("  ✓ Fee config");

  // ── 3. Payment plan ─────────────────────────────────────────────────────────
  await upsert(
    "semester_payment_plans",
    { semester_id: SEM_ID, type: "pay_in_full", deposit_amount: null, deposit_percent: null, installment_count: null, due_date: "2026-06-20" },
    "semester_id",
  );
  console.log("  ✓ Payment plan (pay_in_full; $25 plan = auto-pay installments)");

  // ── 4. Classes + schedules + price tiers + sessions ─────────────────────────
  const classRows: Record<string, unknown>[] = [];
  const schedRows: Record<string, unknown>[] = [];
  const tierRows: Record<string, unknown>[] = [];
  const sessionRows: Record<string, unknown>[] = [];
  const groupSeed: Record<string, Set<string>> = {}; // discipline -> set of sessionIds
  const pointeReport: string[] = [];
  const oddRows: string[] = [];

  let ci = 0, si = 0, ti = 0;
  for (const [base, gRows] of groups) {
    ci++;
    const head = gRows[0];
    const isComp = /^comp team/i.test(base);
    const age = ageFromName(base);

    // Division
    let division: string;
    if (isEarlyChildhoodName(base)) division = "early_childhood";
    else if (isComp) division = "competition";
    else if (gRows.some((r) => r.fees.jrRecital)) division = "junior";
    else division = "senior";

    // Age vs grade: Boys'/Men's HH carry Age cols (years); EC carry month/year ages in name.
    const usesAgeCol = head.ageFromCol != null && head.maxGrade == null && head.minGrade == null;
    const minAgeYears = age.minYears ?? (usesAgeCol ? head.ageFromCol : null);
    const maxAgeYears = age.maxYears ?? (usesAgeCol ? head.ageToCol : null);

    if (head.tuition === 0) oddRows.push(`${base} — tuition 0 (check CSV)`);
    if (gRows.some((r) => r.tuition !== head.tuition)) oddRows.push(`${base} — schedules disagree on tuition`);
    for (const r of gRows) for (const p of r.fees.pointe) pointeReport.push(`${r.name}: ${p}`);

    classRows.push({
      id: cId(ci),
      semester_id: SEM_ID,
      name: base,
      discipline: head.discipline,
      division,
      description: head.description || null,
      min_grade: usesAgeCol ? null : head.minGrade,
      max_grade: usesAgeCol ? null : head.maxGrade,
      min_age: minAgeYears,
      max_age: maxAgeYears,
      min_age_months: age.minMonths ?? null,
      max_age_months: age.maxMonths ?? null,
      is_active: gRows.some((r) => r.active),
      is_competition_track: false, // comp teams kept as standard classes (real meeting time)
      requires_teacher_rec: false,
      registration_note: isComp ? "Placement by audition. Additional competition fees announced once the spring competition schedule is set." : null,
      visibility: head.visibility,
      enrollment_type: "standard",
    });

    for (const r of gRows) {
      si++; ti++;
      const closeAt = r.closeReg ? toIso(r.closeReg) : null;
      schedRows.push({
        id: scId(si),
        class_id: cId(ci),
        semester_id: SEM_ID,
        days_of_week: r.day ? [r.day] : [],
        start_time: r.startTime,
        end_time: r.endTime,
        start_date: r.startDate,
        end_date: r.endDate,
        location: LOCATION,
        instructor_name: null,
        capacity: r.capacity,
        registration_open_at: null,
        registration_close_at: closeAt,
        gender_restriction: /^(boys'|men's)/i.test(base) ? "male" : "no_restriction",
        pricing_model: "full_schedule",
      });
      tierRows.push({
        id: tId(ti),
        section_id: scId(si),
        label: "Tuition",
        amount: r.tuition, // section_price_tiers.amount is whole DOLLARS, not cents
        sort_order: 0,
        is_default: true,
      });
      sessionRows.push({
        id: ssId(si),
        class_id: cId(ci),
        section_id: scId(si),
        semester_id: SEM_ID,
        day_of_week: r.day,
        start_time: r.startTime,
        end_time: r.endTime,
        start_date: r.startDate,
        end_date: r.endDate,
        location: LOCATION,
        instructor_name: null,
        capacity: r.capacity,
        cloned_from_meeting_id: null,
        registration_close_at: closeAt,
        is_active: r.active,
      });
      (groupSeed[head.discipline] ??= new Set()).add(ssId(si));
    }
  }

  await upsert("classes", classRows);
  console.log(`  ✓ Classes (${classRows.length})`);
  // Clear + reinsert section children for idempotency
  for (const c of classRows) await del("class_sections", "class_id", c.id as string);
  await upsert("class_sections", schedRows);
  console.log(`  ✓ Class sections (${schedRows.length})`);
  for (const s of schedRows) await del("section_price_tiers", "section_id", s.id as string);
  await upsert("section_price_tiers", tierRows);
  console.log(`  ✓ Section price tiers (${tierRows.length})`);
  for (const c of classRows) await del("class_meetings", "class_id", c.id as string);
  await upsert("class_meetings", sessionRows);
  console.log(`  ✓ Class meetings (${sessionRows.length})`);

  // ── 5. Session groups by discipline ─────────────────────────────────────────
  const DISC_LABEL: Record<string, string> = {
    ballet: "Ballet", technique: "Technique", hip_hop: "Hip Hop",
    contemporary: "Contemporary", broadway: "Broadway", tap: "Tap",
  };
  const groupRows: Record<string, unknown>[] = [];
  const memberRows: Record<string, unknown>[] = [];
  let gi = 0;
  for (const [disc, ids] of Object.entries(groupSeed)) {
    gi++;
    groupRows.push({ id: gId(gi), semester_id: SEM_ID, name: DISC_LABEL[disc] ?? disc, description: `${DISC_LABEL[disc] ?? disc} classes` });
    for (const sid of ids) memberRows.push({ meeting_group_id: gId(gi), meeting_id: sid });
  }
  for (const g of groupRows) await del("meeting_group_meetings", "meeting_group_id", g.id as string);
  await upsert("meeting_groups", groupRows);
  await upsert("meeting_group_meetings", memberRows);
  console.log(`  ✓ Session groups (${groupRows.length}) + memberships (${memberRows.length})`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const tierCounts: Record<string, number> = {};
  for (const r of rows) tierCounts[r.tuition] = (tierCounts[r.tuition] ?? 0) + 1;
  console.log(`
Done ✓
  Semester ID : ${SEM_ID}  (status: draft)
  Classes     : ${classRows.length}
  Schedules   : ${schedRows.length}  (= ACTIVE sessions)
  Tuition tiers (sessions): ${Object.entries(tierCounts).map(([p, n]) => `$${p}×${n}`).join("  ")}
  Groups      : ${groupRows.length} by discipline

  ⚠ Reported (not seeded):
    Pointe/Pre-Pointe supplements (${pointeReport.length}): ${pointeReport.slice(0, 6).join(" | ")}${pointeReport.length > 6 ? " …" : ""}
    Multi-session progressive discount: DEFERRED (needs computePricingQuote engine change)
${oddRows.length ? "  ⚠ Odd rows: " + oddRows.join(" | ") : ""}

  Re-run \`npx tsx scripts/seed-spring-2026-ues-active.ts\` anytime (idempotent).
`);
}

function toIso(active: string): string {
  // "02/22/2026 11:59 PM" -> ISO (US/Eastern, -05:00)
  const m = active.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return active;
  let h = parseInt(m[4], 10);
  if (/pm/i.test(m[6]) && h !== 12) h += 12;
  if (/am/i.test(m[6]) && h === 12) h = 0;
  return `${m[3]}-${m[1]}-${m[2]}T${String(h).padStart(2, "0")}:${m[5]}:00-05:00`;
}

async function upsert<T extends Record<string, unknown>>(t: string, rows: T | T[], onConflict?: string) {
  const arr = Array.isArray(rows) ? rows : [rows];
  if (!arr.length) return;
  const { error } = await sb.from(t).upsert(arr, onConflict ? { onConflict } : undefined);
  if (error) throw new Error(`[UPSERT ${t}] ${error.message}`);
}
async function del(t: string, col: string, val: string) {
  const { error } = await sb.from(t).delete().eq(col, val);
  if (error) console.warn(`  ⚠ clearing ${t}.${col}=${val}: ${error.message}`);
}

/* ── Registration form (13 participant + 7 parent + waiver) ───────────────────*/
const FORM_ELEMENTS = [
  { id: "p_first", type: "question", label: "Participant First Name", inputType: "short_answer", required: true, profileField: "dancer_first_name" },
  { id: "p_last", type: "question", label: "Participant Last Name", inputType: "short_answer", required: true, profileField: "dancer_last_name" },
  { id: "p_dob", type: "question", label: "Date of Birth", inputType: "date", required: true, profileField: "dancer_birth_date" },
  { id: "p_school", type: "question", label: "School Name", inputType: "short_answer", required: false, profileField: "dancer_school" },
  { id: "p_grade", type: "question", label: "Grade", inputType: "select", required: false, profileField: "dancer_grade" },
  { id: "p_email", type: "question", label: "Email Address", inputType: "short_answer", required: false, profileField: "dancer_email" },
  { id: "p_phone", type: "question", label: "Home Phone Number", inputType: "phone_number", required: false, profileField: "dancer_phone" },
  { id: "p_addr", type: "question", label: "Address", inputType: "address", required: false, profileField: "parent_address_line1" },
  { id: "p_caregiver", type: "question", label: "Nanny / Caregiver", inputType: "short_answer", required: false, profileField: "caregiver_first_name" },
  { id: "p_hear", type: "question", label: "How did you hear about our school?", inputType: "select", required: false, options: ["Friend / Word of mouth", "Internet search", "Social media", "Returning family", "Other"] },
  { id: "p_ec_name", type: "question", label: "Emergency Contact Name", inputType: "short_answer", required: true, profileField: "emergency_contact_first_name" },
  { id: "p_ec_rel", type: "question", label: "Emergency Contact Relationship to the Child", inputType: "short_answer", required: true, profileField: "emergency_contact_relationship" },
  { id: "p_ec_phone", type: "question", label: "Emergency Contact Cell Phone", inputType: "phone_number", required: true, profileField: "emergency_contact_phone" },
  { id: "g_first", type: "question", label: "Parent / Guardian First Name", inputType: "short_answer", required: true, profileField: "parent_first_name" },
  { id: "g_last", type: "question", label: "Parent / Guardian Last Name", inputType: "short_answer", required: true, profileField: "parent_last_name" },
  { id: "g_email", type: "question", label: "Parent Email Address", inputType: "short_answer", required: true, profileField: "parent_email" },
  { id: "g_phone", type: "question", label: "Parent Cell Phone Number", inputType: "phone_number", required: true, profileField: "parent_phone" },
  { id: "waiver", type: "waiver", label: "AMERICAN YOUTH DANCE THEATER POLICIES & AGREEMENTS", required: true, acknowledgmentLabel: "I have read and agree to the AYDT policies and agreements." },
];

main().catch((err) => { console.error("❌  Seed failed:", err); process.exit(1); });
