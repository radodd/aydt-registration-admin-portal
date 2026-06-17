import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db, deleteUser } from "../shared/db";

/**
 * Meeting-plan #37 — one-spot waitlist guardrail (refines #26 / #28).
 *
 * #28 made seat reservation *reserve-at-cart*: a `seat_holds` row is created the
 * moment a class is added to cart, and that hold counts toward capacity. The
 * `check_seat_hold_capacity()` trigger takes a `SELECT … FOR UPDATE` lock on the
 * parent `class_sections` row and only RAISEs when occupied (enrollments + active
 * holds) >= capacity. That is the structural backstop behind #37's rule:
 *
 *   - Multi-spot class, simultaneous carts → ALL that fit succeed. No false
 *     waitlisting while spots remain. (Active's "3 waitlisted for 1 spot" can't
 *     happen here.)
 *   - Exactly-one-spot, two racers → exactly one wins the hold; the loser is
 *     blocked ("at capacity") and the client routes them to the waitlist
 *     (first-to-cart wins — confirmed product decision, 2026-06-10).
 *   - One spot, single uncontended user → simply gets it.
 *
 * ⚠️ RACES AS AUTHENTICATED USERS — NOT service-role. This is load-bearing.
 * The capacity trigger COUNT(*)s the RLS-protected `seat_holds` (owner-only
 * SELECT). A 2026-06-10 bug had these triggers as SECURITY INVOKER, so each
 * racer's COUNT was blind to OTHER users' holds → double-book. A service-role
 * race (like the sibling last-seat-race.spec.ts) bypasses RLS and CANNOT catch
 * that class of bug — it returned green the whole time the live UI overbooked.
 * So each racer here signs in with the anon key and inserts under its own RLS
 * context, exactly like the real add-to-cart server action. The fix
 * (20260610000000_fix_capacity_trigger_rls_security_definer.sql) makes the
 * triggers SECURITY DEFINER so the COUNT sees all rows; this test guards it.
 *
 * Runs against the dev Supabase in .env.local; all rows are namespaced and torn
 * down in `finally`, even on assertion failure.
 */

const CAPACITY_ERROR = /at capacity/i;
const HOLD_TTL_MS = 20 * 60 * 1000;
const RACER_PASSWORD = "Test1234!holdrace";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** A signed-in, RLS-bound client for one racer — mirrors the real server action. */
async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`authedClient sign-in failed for ${email}: ${error.message}`);
  return c;
}

interface HoldRaceSeed {
  semesterId: string;
  classId: string;
  sectionId: string;
  familyIds: string[];
  userIds: string[];
  /** Per-racer login emails (index-aligned with userIds) for authenticated races. */
  emails: string[];
}

/** Build a throwaway class + capacity-limited section + N parent users. */
async function seedHoldRace(opts: {
  capacity: number;
  racers: number;
  tag: string;
}): Promise<HoldRaceSeed> {
  const sb = db();

  // Attach to any existing semester to satisfy NOT NULL FKs.
  const { data: sem, error: semErr } = await sb
    .from("semesters")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (semErr || !sem) {
    throw new Error(`seedHoldRace: no semester to attach to (${semErr?.message ?? "none"})`);
  }
  const semesterId = sem.id as string;

  const { data: cls, error: clsErr } = await sb
    .from("classes")
    .insert({ semester_id: semesterId, name: `__e2e hold-race ${opts.tag}` })
    .select("id")
    .single();
  if (clsErr || !cls) throw new Error(`seedHoldRace: class insert failed (${clsErr?.message})`);
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
  if (secErr || !section) throw new Error(`seedHoldRace: section insert failed (${secErr?.message})`);
  const sectionId = section.id as string;

  // Each racer is a DISTINCT signed-in parent (seat_holds.user_id is owner-scoped).
  const userIds: string[] = [];
  const emails: string[] = [];
  const familyIds: string[] = [];
  for (let i = 0; i < opts.racers; i++) {
    const email = `e2e-holdrace-${opts.tag}-${i}@example.test`;
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: RACER_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "parent", first_name: `Racer${i}`, last_name: opts.tag },
    });
    if (error || !data.user) throw new Error(`seedHoldRace: user ${i} create failed (${error?.message})`);
    const userId = data.user.id;
    userIds.push(userId);
    emails.push(email);

    // handle_new_user may attach a throwaway family; capture it so capacity
    // counting is realistic and teardown can remove it.
    const { data: row } = await sb.from("users").select("family_id").eq("id", userId).single();
    if (row?.family_id) familyIds.push(row.family_id as string);
  }

  return { semesterId, classId, sectionId, familyIds, userIds, emails };
}

/** Reverse-dependency cleanup; never throws (best-effort teardown). */
async function teardownHoldRace(seed: HoldRaceSeed): Promise<void> {
  const sb = db();
  await sb.from("seat_holds").delete().eq("section_id", seed.sectionId);
  // class_sections cascades on class delete (ON DELETE CASCADE).
  await sb.from("classes").delete().eq("id", seed.classId);
  for (const userId of seed.userIds) await deleteUser(userId);
  if (seed.familyIds.length) await sb.from("families").delete().in("id", seed.familyIds);
}

/**
 * Fire all racers' hold inserts concurrently AS EACH RACER (RLS-bound), return
 * per-user held/blocked outcome. Signing in per racer is what exercises the
 * SECURITY DEFINER fix — a service-role insert would bypass RLS and pass even if
 * the capacity trigger were blind to other users' holds.
 */
async function raceForHolds(seed: HoldRaceSeed) {
  const expiresAt = new Date(Date.now() + HOLD_TTL_MS).toISOString();

  // Pre-authenticate every racer so the concurrent inserts aren't serialized by
  // sign-in latency — the race is purely the inserts.
  const clients = await Promise.all(
    seed.userIds.map((_, i) => authedClient(seed.emails[i], RACER_PASSWORD)),
  );

  const results = await Promise.allSettled(
    seed.userIds.map((userId, i) =>
      clients[i]
        .from("seat_holds")
        .insert({
          section_id: seed.sectionId,
          user_id: userId,
          semester_id: seed.semesterId,
          class_id: seed.classId,
          expires_at: expiresAt,
        })
        .select("id")
        .single()
        .then(({ data, error }) => ({ userId, data, error })),
    ),
  );

  const held: string[] = [];
  const capacityBlocked: string[] = [];
  const otherErrors: { userId: string; message: string }[] = [];

  for (const r of results) {
    // .then() above never rejects, so every settle is "fulfilled".
    if (r.status !== "fulfilled") {
      otherErrors.push({ userId: "unknown", message: String((r as PromiseRejectedResult).reason) });
      continue;
    }
    const { userId, data, error } = r.value;
    if (error) {
      const msg = error.message ?? JSON.stringify(error);
      if (CAPACITY_ERROR.test(msg)) capacityBlocked.push(userId);
      else otherErrors.push({ userId, message: msg });
    } else if (data) {
      held.push(userId);
    }
  }
  return { held, capacityBlocked, otherErrors };
}

/** Count active (non-expired) holds on the section — the authoritative occupancy. */
async function activeHoldCount(sectionId: string): Promise<number | null> {
  const { count } = await db()
    .from("seat_holds")
    .select("id", { count: "exact", head: true })
    .eq("section_id", sectionId)
    .gt("expires_at", new Date().toISOString());
  return count ?? null;
}

test.describe("@concurrency seat-hold race (meeting-plan #37)", () => {
  test("3-spot section, 2 simultaneous carts → BOTH hold (no false waitlisting while spots remain)", async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const seed = await seedHoldRace({ capacity: 3, racers: 2, tag });
    try {
      const { held, capacityBlocked, otherErrors } = await raceForHolds(seed);

      expect(otherErrors, `unexpected non-capacity errors: ${JSON.stringify(otherErrors)}`).toEqual([]);
      // The #37 multi-spot guarantee: both racers get a seat, neither is waitlisted.
      expect(held).toHaveLength(2);
      expect(capacityBlocked).toHaveLength(0);
      expect(await activeHoldCount(seed.sectionId)).toBe(2);
    } finally {
      await teardownHoldRace(seed);
    }
  });

  test("1-spot section, 2 racers → exactly one holds, the other is waitlist-routed (first-to-cart wins)", async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const seed = await seedHoldRace({ capacity: 1, racers: 2, tag });
    try {
      const { held, capacityBlocked, otherErrors } = await raceForHolds(seed);

      expect(otherErrors, `unexpected non-capacity errors: ${JSON.stringify(otherErrors)}`).toEqual([]);
      // Exactly one wins the last spot; the loser is cleanly blocked (→ waitlist),
      // never a double-book.
      expect(held).toHaveLength(1);
      expect(capacityBlocked).toHaveLength(1);
      expect(await activeHoldCount(seed.sectionId)).toBe(1);
    } finally {
      await teardownHoldRace(seed);
    }
  });

  test("1-spot section, single uncontended user → simply gets it", async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const seed = await seedHoldRace({ capacity: 1, racers: 1, tag });
    try {
      const { held, capacityBlocked, otherErrors } = await raceForHolds(seed);

      expect(otherErrors, `unexpected non-capacity errors: ${JSON.stringify(otherErrors)}`).toEqual([]);
      expect(held).toHaveLength(1);
      expect(capacityBlocked).toHaveLength(0);
      expect(await activeHoldCount(seed.sectionId)).toBe(1);
    } finally {
      await teardownHoldRace(seed);
    }
  });
});
