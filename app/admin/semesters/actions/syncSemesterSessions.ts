"use server";

import { createClient } from "@/utils/supabase/server";
import type { DraftClass, DraftClassRequirement, DraftClassSession } from "@/types";

/**
 * Phase 1 rewrite — syncs `classes` + `class_sessions` for a semester.
 *
 * Given the current DraftClass[] from the SemesterDraft state, this function:
 *  1. Deletes any classes (and their class_sessions via CASCADE) that are no
 *     longer present in the incoming list.
 *  2. Upserts each DraftClass into `classes` (INSERT if no id, UPDATE if id).
 *  3. For each class, deletes removed class_sessions, then upserts remaining ones.
 *
 * Returns a Map<draftClassSessionId, dbClassSessionId> so that
 * `syncSemesterSessionGroups` can remap group membership to real DB ids.
 * For new class_sessions (no draft id), the DB-assigned UUID is used as both
 * key and value after insertion.
 */
export async function syncSemesterSessions(
  semesterId: string,
  incomingClasses: DraftClass[],
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const classSessionIdMap = new Map<string, string>();

  /* ---------------------------------------------------------------------- */
  /* 1. Delete classes removed from the list                                 */
  /* ---------------------------------------------------------------------- */

  const { data: existingClasses, error: fetchErr } = await supabase
    .from("classes")
    .select("id")
    .eq("semester_id", semesterId);

  if (fetchErr) throw new Error(fetchErr.message);

  const existingClassIds = new Set(existingClasses.map((c) => c.id));
  const incomingClassIds = new Set(
    incomingClasses.map((c) => c.id).filter(Boolean) as string[],
  );

  const classIdsToDelete = [...existingClassIds].filter(
    (id) => !incomingClassIds.has(id),
  );

  if (classIdsToDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("classes")
      .delete()
      .in("id", classIdsToDelete);
    if (deleteErr) throw new Error(deleteErr.message);
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Upsert each class + its class_sessions                               */
  /* ---------------------------------------------------------------------- */

  for (const draftClass of incomingClasses) {
    let classId: string;

    if (draftClass.id && existingClassIds.has(draftClass.id)) {
      // UPDATE existing class
      const { error: updateErr } = await supabase
        .from("classes")
        .update({
          name: draftClass.name,
          discipline: draftClass.discipline,
          division: draftClass.division,
          level: draftClass.level ?? null,
          description: draftClass.description ?? null,
          min_age: draftClass.minAge ?? null,
          max_age: draftClass.maxAge ?? null,
          is_competition_track: draftClass.isCompetitionTrack ?? false,
          requires_teacher_rec: draftClass.requiresTeacherRec ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftClass.id);
      if (updateErr) throw new Error(updateErr.message);
      classId = draftClass.id;
    } else {
      // INSERT new class
      const { data: inserted, error: insertErr } = await supabase
        .from("classes")
        .insert({
          semester_id: semesterId,
          name: draftClass.name,
          discipline: draftClass.discipline,
          division: draftClass.division,
          level: draftClass.level ?? null,
          description: draftClass.description ?? null,
          min_age: draftClass.minAge ?? null,
          max_age: draftClass.maxAge ?? null,
          is_competition_track: draftClass.isCompetitionTrack ?? false,
          requires_teacher_rec: draftClass.requiresTeacherRec ?? false,
          is_active: true,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) throw new Error(insertErr?.message ?? "Class insert failed");
      classId = inserted.id;
    }

    /* -------------------------------------------------------------------- */
    /* 2b. Sync class_sessions for this class                                */
    /* -------------------------------------------------------------------- */

    const { data: existingSessions, error: sessionFetchErr } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("class_id", classId);

    if (sessionFetchErr) throw new Error(sessionFetchErr.message);

    const existingSessionIds = new Set(existingSessions.map((s) => s.id));
    const incomingSessionIds = new Set(
      draftClass.sessions.map((s) => s.id).filter(Boolean) as string[],
    );

    // Delete removed sessions
    const sessionIdsToDelete = [...existingSessionIds].filter(
      (id) => !incomingSessionIds.has(id),
    );
    if (sessionIdsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("class_sessions")
        .delete()
        .in("id", sessionIdsToDelete);
      if (delErr) throw new Error(delErr.message);
    }

    // Upsert each class_session
    for (const draftSession of draftClass.sessions) {
      const sessionRow = buildSessionRow(draftSession, classId, semesterId);

      if (draftSession.id && existingSessionIds.has(draftSession.id)) {
        // UPDATE
        const { error: updErr } = await supabase
          .from("class_sessions")
          .update(sessionRow)
          .eq("id", draftSession.id);
        if (updErr) throw new Error(updErr.message);
        classSessionIdMap.set(draftSession.id, draftSession.id);
      } else {
        // INSERT
        const { data: newSession, error: insErr } = await supabase
          .from("class_sessions")
          .insert({ ...sessionRow, class_id: classId, semester_id: semesterId })
          .select("id")
          .single();
        if (insErr || !newSession) throw new Error(insErr?.message ?? "Session insert failed");
        // Map draft id (if any) to new DB id; also register DB id → itself
        if (draftSession.id) classSessionIdMap.set(draftSession.id, newSession.id);
        classSessionIdMap.set(newSession.id, newSession.id);
      }
    }

    /* -------------------------------------------------------------------- */
    /* 2c. Sync class_requirements for this class (Phase 6)                  */
    /* -------------------------------------------------------------------- */

    await syncClassRequirements(supabase, classId, draftClass.requirements ?? []);
  }

  return classSessionIdMap;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function buildSessionRow(
  s: DraftClassSession,
  classId: string,
  semesterId: string,
) {
  return {
    class_id: classId,
    semester_id: semesterId,
    day_of_week: s.dayOfWeek.toLowerCase(),
    start_time: s.startTime ?? null,
    end_time: s.endTime ?? null,
    start_date: s.startDate ?? null,
    end_date: s.endDate ?? null,
    location: s.location ?? null,
    instructor_name: s.instructorName ?? null,
    capacity: s.capacity ?? null,
    registration_close_at: s.registrationCloseAt ?? null,
    is_active: true,
  };
}

type SupabaseClient = Awaited<ReturnType<typeof import("@/utils/supabase/server").createClient>>;

/**
 * Phase 6 — Replaces all class_requirements for a class with the incoming list.
 * Delete-then-reinsert keeps the logic simple and idempotent.
 */
async function syncClassRequirements(
  supabase: SupabaseClient,
  classId: string,
  requirements: DraftClassRequirement[],
) {
  // Delete all existing requirements for this class
  const { error: delErr } = await supabase
    .from("class_requirements")
    .delete()
    .eq("class_id", classId);
  if (delErr) throw new Error(delErr.message);

  if (requirements.length === 0) return;

  const rows = requirements.map((r) => ({
    ...(r.id ? { id: r.id } : {}),
    class_id: classId,
    requirement_type: r.requirement_type,
    description: r.description,
    enforcement: r.enforcement,
    is_waivable: r.is_waivable,
    required_discipline: r.required_discipline ?? null,
    required_level: r.required_level ?? null,
    required_class_id: r.required_class_id ?? null,
  }));

  const { error: insErr } = await supabase
    .from("class_requirements")
    .insert(rows);
  if (insErr) throw new Error(insErr.message);
}
