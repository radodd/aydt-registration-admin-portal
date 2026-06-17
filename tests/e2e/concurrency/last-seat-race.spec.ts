import { test, expect } from "@playwright/test";
import { db } from "../shared/db";

/**
 * Meeting-plan #26 — concurrency stress test (first-to-insert wins the last seat).
 *
 * Proves the DB-layer capacity invariant that the whole "no double-book" promise
 * rests on: the `check_schedule_enrollment_capacity()` trigger on
 * `section_enrollments` takes a `SELECT … FOR UPDATE` lock on the parent
 * `class_sections` row, so concurrent inserts for the last seat are serialized —
 * exactly `capacity` of them commit and the rest are rejected with
 * "Section is at capacity".
 *
 * This is the structural backstop behind the reconfirmed race decision
 * (2026-05-29 demo, transcript ~41:48): whoever registers first gets the seat,
 * everyone else is waitlisted; no over-capacity row is ever written.
 *
 * ⚠️ SCOPE: this races as SERVICE-ROLE, so it proves the trigger's FOR-UPDATE
 * serialization + arithmetic, but NOT the RLS-context counting. Service-role
 * bypasses RLS, so it cannot catch a SECURITY INVOKER capacity trigger going
 * blind to other users' rows (the 2026-06-10 overbook bug). The authenticated,
 * cross-user guarantee is proven by seat-hold-race.spec.ts (#37) — keep that one
 * green to guard the double-book class of bug.
 *
 * Pure-DB test (no browser): fires N concurrent service-role inserts against the
 * SAME section with DISTINCT dancers and asserts the survivor count == capacity.
 *
 * Runs against the dev Supabase in .env.local. All rows it creates are namespaced
 * with a unique marker and torn down in `finally`, even on assertion failure.
 */

const CAPACITY_ERROR = /at capacity/i;

/** Build a throwaway class + capacity-limited section + N dancers + a batch. */
async function seedRace(opts: { capacity: number; racers: number; tag: string }) {
  const sb = db();

  // Attach to any existing semester to satisfy NOT NULL FKs (class + section + batch).
  const { data: sem, error: semErr } = await sb
    .from("semesters")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (semErr || !sem) throw new Error(`seedRace: no semester to attach to (${semErr?.message ?? "none"})`);
  const semesterId = sem.id as string;

  const { data: cls, error: clsErr } = await sb
    .from("classes")
    .insert({ semester_id: semesterId, name: `__e2e race ${opts.tag}` })
    .select("id")
    .single();
  if (clsErr || !cls) throw new Error(`seedRace: class insert failed (${clsErr?.message})`);
  const classId = cls.id as string;

  const { data: section, error: secErr } = await sb
    .from("class_sections")
    .insert({
      class_id: classId,
      semester_id: semesterId,
      days_of_week: ["monday"],
      capacity: opts.capacity,
    })
    .select("id")
    .single();
  if (secErr || !section) throw new Error(`seedRace: section insert failed (${secErr?.message})`);
  const sectionId = section.id as string;

  const { data: fam, error: famErr } = await sb
    .from("families")
    .insert({})
    .select("id")
    .single();
  if (famErr || !fam) throw new Error(`seedRace: family insert failed (${famErr?.message})`);
  const familyId = fam.id as string;

  const dancerRows = Array.from({ length: opts.racers }, (_, i) => ({
    family_id: familyId,
    first_name: `Racer${i}`,
    last_name: opts.tag,
  }));
  const { data: dancers, error: dncErr } = await sb
    .from("dancers")
    .insert(dancerRows)
    .select("id");
  if (dncErr || !dancers || dancers.length !== opts.racers) {
    throw new Error(`seedRace: dancers insert failed (${dncErr?.message})`);
  }
  const dancerIds = dancers.map((d) => d.id as string);

  const { data: batch, error: batchErr } = await sb
    .from("registration_orders")
    .insert({ semester_id: semesterId, family_id: familyId, status: "pending" })
    .select("id")
    .single();
  if (batchErr || !batch) throw new Error(`seedRace: batch insert failed (${batchErr?.message})`);
  const batchId = batch.id as string;

  return { semesterId, classId, sectionId, familyId, dancerIds, batchId };
}

/** Reverse-dependency cleanup; never throws (best-effort teardown). */
async function teardownRace(seed: {
  classId: string;
  sectionId: string;
  familyId: string;
  dancerIds: string[];
  batchId: string;
}) {
  const sb = db();
  await sb.from("section_enrollments").delete().eq("section_id", seed.sectionId);
  await sb.from("registration_orders").delete().eq("id", seed.batchId);
  await sb.from("dancers").delete().in("id", seed.dancerIds);
  await sb.from("families").delete().eq("id", seed.familyId);
  // class_sections cascades on class delete (ON DELETE CASCADE).
  await sb.from("classes").delete().eq("id", seed.classId);
}

/** Fire all racers' inserts concurrently; return per-racer success/capacity outcome. */
async function raceForSeats(seed: { sectionId: string; batchId: string; dancerIds: string[] }) {
  const sb = db();
  const results = await Promise.allSettled(
    seed.dancerIds.map((dancerId) =>
      sb
        .from("section_enrollments")
        .insert({
          section_id: seed.sectionId,
          batch_id: seed.batchId,
          dancer_id: dancerId,
          price_snapshot: 0,
          status: "pending",
        })
        .select("id")
        .single()
        .then(({ data, error }) => ({ dancerId, data, error })),
    ),
  );

  const enrolled: string[] = [];
  const capacityRejected: string[] = [];
  const otherErrors: { dancerId: string; message: string }[] = [];

  for (const r of results) {
    // .then() above never rejects, so every settle is "fulfilled".
    if (r.status !== "fulfilled") {
      otherErrors.push({ dancerId: "unknown", message: String((r as PromiseRejectedResult).reason) });
      continue;
    }
    const { dancerId, data, error } = r.value;
    if (error) {
      const msg = error.message ?? JSON.stringify(error);
      if (CAPACITY_ERROR.test(msg)) capacityRejected.push(dancerId);
      else otherErrors.push({ dancerId, message: msg });
    } else if (data) {
      enrolled.push(dancerId);
    }
  }
  return { enrolled, capacityRejected, otherErrors };
}

test.describe("@concurrency last-seat race (meeting-plan #26)", () => {
  test("5 simultaneous checkouts for 1 seat → exactly one enrolls, no over-capacity row", async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const seed = await seedRace({ capacity: 1, racers: 5, tag });
    try {
      const { enrolled, capacityRejected, otherErrors } = await raceForSeats(seed);

      // No unexpected failures (e.g. unique-violation, FK, RLS).
      expect(otherErrors, `unexpected non-capacity errors: ${JSON.stringify(otherErrors)}`).toEqual([]);

      // Exactly one racer won the seat; the other four were cleanly rejected for capacity.
      expect(enrolled).toHaveLength(1);
      expect(capacityRejected).toHaveLength(4);

      // Authoritative check: the DB never wrote more than `capacity` live rows.
      const { count } = await db()
        .from("section_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("section_id", seed.sectionId)
        .neq("status", "cancelled");
      expect(count).toBe(1);
    } finally {
      await teardownRace(seed);
    }
  });

  test("8 simultaneous checkouts for a 3-seat section → exactly three enroll", async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const seed = await seedRace({ capacity: 3, racers: 8, tag });
    try {
      const { enrolled, capacityRejected, otherErrors } = await raceForSeats(seed);

      expect(otherErrors, `unexpected non-capacity errors: ${JSON.stringify(otherErrors)}`).toEqual([]);
      expect(enrolled).toHaveLength(3);
      expect(capacityRejected).toHaveLength(5);

      const { count } = await db()
        .from("section_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("section_id", seed.sectionId)
        .neq("status", "cancelled");
      expect(count).toBe(3);
    } finally {
      await teardownRace(seed);
    }
  });
});
