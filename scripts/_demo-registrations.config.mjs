/**
 * scripts/_demo-registrations.config.mjs
 *
 * Shared, deterministic config for the TEMPORARY demo-registrations seed.
 * Imported by both seed-demo-registrations.mjs and teardown-demo-registrations.mjs.
 *
 * Everything created by the seed lives under ONE fake family + ONE fake order, so
 * teardown is fully scoped by two fixed IDs (FAMILY_ID, ORDER_ID). The order has
 * `ON DELETE CASCADE` on section_enrollments.batch_id, so deleting it removes every
 * seeded enrollment automatically.
 *
 * All IDs share the recognizable prefix  dede0000-0000-4000-8000-  → easy to spot
 * in the DB and impossible to collide with real gen_random_uuid() rows.
 */

// Spring 2026 — the semester whose classes we attach demo registrations to.
export const SEMESTER_ID = "bba3a0a5-36a5-48a8-9398-a9cbe2ce4c44";

// Single fake family + order that own everything (teardown anchors).
export const FAMILY_ID = "dede0000-0000-4000-8000-0000000000f1";
export const ORDER_ID = "dede0000-0000-4000-8000-0000000000a1";

export const FAMILY_NAME = "ZZ — DEMO Test Family (safe to delete)";
export const PAYMENT_REF = "AYDT-DEMO-DELETE-ME";

// Fake dancers (no user_id → no auth.users needed). Names are obviously demo data.
export const DANCERS = [
  { id: "dede0000-0000-4000-8000-000000000101", first_name: "Ava",  last_name: "Demoson (DEMO)",    gender: "female", birth_date: "2016-03-04", grade: "3" },
  { id: "dede0000-0000-4000-8000-000000000102", first_name: "Liam", last_name: "Demoson (DEMO)",    gender: "male",   birth_date: "2015-07-19", grade: "4" },
  { id: "dede0000-0000-4000-8000-000000000103", first_name: "Mia",  last_name: "Testerly (DEMO)",   gender: "female", birth_date: "2014-11-02", grade: "5" },
  { id: "dede0000-0000-4000-8000-000000000104", first_name: "Noah", last_name: "Testerly (DEMO)",   gender: "male",   birth_date: "2013-01-28", grade: "6" },
  { id: "dede0000-0000-4000-8000-000000000105", first_name: "Ella", last_name: "Sampleton (DEMO)",  gender: "female", birth_date: "2016-09-15", grade: "3" },
  { id: "dede0000-0000-4000-8000-000000000106", first_name: "Owen", last_name: "Sampleton (DEMO)",  gender: "male",   birth_date: "2015-05-22", grade: "4" },
];

// Target sample classes (Spring 2026) → which dancers to enroll, by dancer index.
// section IDs were read live from the DB; class names are labels for logging.
export const TARGET_SECTIONS = [
  { className: "Tap 1A",         section_id: "b5df2a3c-013f-4198-afa2-d7d64e7b77d7", dancerIdx: [0, 1, 2] },
  { className: "Hip Hop 2",      section_id: "ef58675b-1aa7-459f-892f-500847f431c6", dancerIdx: [2, 3, 4] },
  { className: "Contemporary 1", section_id: "9594caf5-bb4b-4414-bb3f-6fb4bc1beaa4", dancerIdx: [4, 5, 0] },
];

// Deterministic enrollment id from section + dancer index (re-runnable upsert).
// Final UUID group must be exactly 12 hex digits: "000002" + sIdx(3) + dIdx(3).
export function enrollmentId(sectionIdx, dancerIdx) {
  const s = String(sectionIdx).padStart(3, "0");
  const d = String(dancerIdx).padStart(3, "0");
  return `dede0000-0000-4000-8000-000002${s}${d}`;
}

export const PRICE_SNAPSHOT = 79643; // mirrors existing rows' cents-in-numeric convention
