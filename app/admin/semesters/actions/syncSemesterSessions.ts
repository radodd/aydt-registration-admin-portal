"use server";

import { createClient } from "@/utils/supabase/server";
import type {
  DraftClass,
  DraftClassRequirement,
  DraftClassSchedule,
  DraftSchedulePriceTier,
  DraftSessionExcludedDate,
  DraftSessionOption,
  DraftSessionPriceRow,
} from "@/types";

/**
 * Per-day enrollment model — syncs `classes` + `class_schedules` + generated
 * `class_sessions` for a semester.
 *
 * Given the current DraftClass[] from the SemesterDraft state, this function:
 *  1. Deletes classes removed from the list (CASCADE removes their schedules + sessions).
 *  2. Upserts each DraftClass into `classes`.
 *  3. For each class, syncs its DraftClassSchedule[] into `class_schedules`.
 *  4. For each schedule, computes expected calendar dates and diffs against existing
 *     `class_sessions` — INSERTs new dates, UPDATEs non-destructive fields, and
 *     attempts to DELETE removed dates (blocked by DB trigger if registrations exist).
 *  5. Syncs price rows, options, and excluded dates per schedule.
 *  6. Syncs class_requirements.
 *
 * Returns a Map<scheduleId, dbSessionId[]> for downstream use.
 */
export async function syncSemesterSessions(
  semesterId: string,
  incomingClasses: DraftClass[],
): Promise<Map<string, string>> {
  const supabase = await createClient();
  // For backward-compat with session group sync; maps any session UUID to itself
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
  /* 2. Upsert each class + its schedules + generated sessions               */
  /* ---------------------------------------------------------------------- */

  for (const draftClass of incomingClasses) {
    let classId: string;

    if (draftClass.id && existingClassIds.has(draftClass.id)) {
      // UPDATE existing class
      const isCompTrack = draftClass.isCompetitionTrack ?? false;
      const { error: updateErr } = await supabase
        .from("classes")
        .update({
          name: draftClass.name,
          display_name: draftClass.displayName ?? null,
          discipline: draftClass.discipline,
          division: draftClass.division,
          level: draftClass.level ?? null,
          description: draftClass.description ?? null,
          min_age: draftClass.minAge ?? null,
          max_age: draftClass.maxAge ?? null,
          min_grade: draftClass.minGrade ?? null,
          max_grade: draftClass.maxGrade ?? null,
          is_competition_track: isCompTrack,
          requires_teacher_rec: draftClass.requiresTeacherRec ?? false,
          // Enforce derived invariants: competition tracks are always invite_only + audition.
          visibility: isCompTrack ? "invite_only" : (draftClass.visibility ?? "public"),
          enrollment_type: isCompTrack ? "audition" : (draftClass.enrollmentType ?? "standard"),
          // Competition track transactional email configs (null for standard classes)
          invite_email: draftClass.inviteEmail ?? null,
          audition_booking_email: draftClass.auditionBookingEmail ?? null,
          competition_acceptance_email: draftClass.competitionAcceptanceEmail ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftClass.id);
      if (updateErr) throw new Error(updateErr.message);
      classId = draftClass.id;
    } else {
      // INSERT new class
      const isCompTrackNew = draftClass.isCompetitionTrack ?? false;
      const { data: inserted, error: insertErr } = await supabase
        .from("classes")
        .insert({
          semester_id: semesterId,
          name: draftClass.name,
          display_name: draftClass.displayName ?? null,
          discipline: draftClass.discipline,
          division: draftClass.division,
          level: draftClass.level ?? null,
          description: draftClass.description ?? null,
          min_age: draftClass.minAge ?? null,
          max_age: draftClass.maxAge ?? null,
          min_grade: draftClass.minGrade ?? null,
          max_grade: draftClass.maxGrade ?? null,
          is_competition_track: isCompTrackNew,
          requires_teacher_rec: draftClass.requiresTeacherRec ?? false,
          // Enforce derived invariants: competition tracks are always invite_only + audition.
          visibility: isCompTrackNew ? "invite_only" : (draftClass.visibility ?? "public"),
          enrollment_type: isCompTrackNew ? "audition" : (draftClass.enrollmentType ?? "standard"),
          // Competition track transactional email configs (null for standard classes)
          invite_email: draftClass.inviteEmail ?? null,
          audition_booking_email: draftClass.auditionBookingEmail ?? null,
          competition_acceptance_email: draftClass.competitionAcceptanceEmail ?? null,
          is_active: true,
        })
        .select("id")
        .single();
      if (insertErr || !inserted)
        throw new Error(insertErr?.message ?? "Class insert failed");
      classId = inserted.id;
    }

    /* -------------------------------------------------------------------- */
    /* 3. Sync class_schedules for this class                                */
    /* -------------------------------------------------------------------- */

    // Competition tracks have no class_sessions — they use audition_sessions instead.
    // The hard boundary is enforced here: even if a DraftClass with isCompetitionTrack=true
    // arrives with non-empty schedules, we skip session generation entirely.
    // Audition slot creation only happens in manageInvites.createAuditionSession,
    // called from InviteManagerClient — never from this sync path.
    if (!draftClass.isCompetitionTrack) {
      await syncClassSchedules(
        supabase,
        classId,
        semesterId,
        draftClass.schedules ?? [],
        classSessionIdMap,
      );
    }

    /* -------------------------------------------------------------------- */
    /* 4. Sync class_requirements                                            */
    /* -------------------------------------------------------------------- */

    await syncClassRequirements(
      supabase,
      classId,
      draftClass.requirements ?? [],
    );
  }

  return classSessionIdMap;
}

/* -------------------------------------------------------------------------- */
/* Schedule sync + per-day session generation                                  */
/* -------------------------------------------------------------------------- */

type SupabaseClient = Awaited<
  ReturnType<typeof import("@/utils/supabase/server").createClient>
>;

async function syncClassSchedules(
  supabase: SupabaseClient,
  classId: string,
  semesterId: string,
  schedules: DraftClassSchedule[],
  sessionIdMap: Map<string, string>,
) {
  // Fetch existing schedules for this class
  const { data: existingSchedules, error: schFetchErr } = await supabase
    .from("class_schedules")
    .select("id")
    .eq("class_id", classId);
  if (schFetchErr) throw new Error(schFetchErr.message);

  const existingScheduleIds = new Set(existingSchedules.map((s) => s.id));
  const incomingScheduleIds = new Set(
    schedules.map((s) => s.id).filter(Boolean) as string[],
  );

  // Delete removed schedules (only if no class_sessions remain — ON DELETE RESTRICT)
  const scheduleIdsToDelete = [...existingScheduleIds].filter(
    (id) => !incomingScheduleIds.has(id),
  );
  // for (const scheduleId of scheduleIdsToDelete) {
  //   // Attempt delete; DB trigger blocks if enrolled sessions exist
  //   const { error: delErr } = await supabase
  //     .from("class_schedules")
  //     .delete()
  //     .eq("id", scheduleId);
  //   if (delErr) throw new Error(delErr.message);
  // }
  for (const scheduleId of scheduleIdsToDelete) {
    // Fetch session IDs so we can clear FK references before deleting
    const { data: sessionsToRemove } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("schedule_id", scheduleId);

    const removedIds = (sessionsToRemove ?? []).map((s) => s.id);

    if (removedIds.length > 0) {
      // Clear session_group_sessions references first (FK would block class_sessions delete)
      await supabase
        .from("session_group_sessions")
        .delete()
        .in("session_id", removedIds);
    }

    // Delete generated sessions (DB trigger blocks if registrations exist)
    const { error: sessionDelErr } = await supabase
      .from("class_sessions")
      .delete()
      .eq("schedule_id", scheduleId);

    if (sessionDelErr) throw new Error(sessionDelErr.message);

    // now delete the schedule
    const { error: delErr } = await supabase
      .from("class_schedules")
      .delete()
      .eq("id", scheduleId);

    if (delErr) throw new Error(delErr.message);
  }

  // Upsert each schedule + regenerate its sessions
  for (const draftSchedule of schedules) {
    let scheduleId: string;

    if (draftSchedule.id && existingScheduleIds.has(draftSchedule.id)) {
      // UPDATE
      const { error: updErr } = await supabase
        .from("class_schedules")
        .update(buildScheduleRow(draftSchedule, classId, semesterId))
        .eq("id", draftSchedule.id);
      if (updErr) throw new Error(updErr.message);
      scheduleId = draftSchedule.id;
    } else {
      // INSERT
      const { data: newSch, error: insErr } = await supabase
        .from("class_schedules")
        .insert(buildScheduleRow(draftSchedule, classId, semesterId))
        .select("id")
        .single();
      if (insErr || !newSch)
        throw new Error(insErr?.message ?? "Schedule insert failed");
      scheduleId = newSch.id;
    }

    // Sync excluded dates for this schedule
    await syncScheduleExcludedDates(
      supabase,
      scheduleId,
      draftSchedule.excludedDates ?? [],
    );

    // Generate per-day class_sessions
    const generatedIds = await generateSessionsForSchedule(
      supabase,
      scheduleId,
      semesterId,
      classId,
      draftSchedule,
    );

    for (const id of generatedIds) {
      sessionIdMap.set(id, id);
    }

    // Pricing sync — route by pricing model
    const pricingModel = draftSchedule.pricingModel ?? "full_schedule";

    if (pricingModel === "full_schedule") {
      // Mode A: sync named tiers to schedule_price_tiers
      await syncSchedulePriceTiers(
        supabase,
        scheduleId,
        draftSchedule.priceTiers ?? [],
      );
    }
    // Mode B: drop_in_price is propagated directly onto each class_session row
    // during generateSessionsForSchedule — no extra sync needed here.

    // Add-ons apply to both modes
    if (draftSchedule.options && draftSchedule.options.length > 0) {
      await syncOptionsForSchedule(supabase, scheduleId, draftSchedule.options);
    }
  }
}

function buildScheduleRow(
  s: DraftClassSchedule,
  classId: string,
  semesterId: string,
) {
  return {
    class_id: classId,
    semester_id: semesterId,
    days_of_week: s.daysOfWeek,
    start_time: s.startTime ?? null,
    end_time: s.endTime ?? null,
    start_date: s.startDate ?? null,
    end_date: s.endDate ?? null,
    location: s.location ?? null,
    instructor_name: s.instructorName ?? null,
    capacity: s.capacity ?? null,
    registration_open_at: s.registrationOpenAt ?? null,
    registration_close_at: s.registrationCloseAt ?? null,
    gender_restriction: s.genderRestriction ?? null,
    urgency_threshold: s.urgencyThreshold ?? null,
    pricing_model: s.pricingModel ?? "full_schedule",
    updated_at: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Per-day session generation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Computes the expected set of calendar dates for a schedule, diffs against
 * existing class_sessions, and reconciles:
 *   - New dates → INSERT
 *   - Existing dates → UPDATE non-destructive fields
 *   - Removed dates → DELETE (blocked by trigger if registrations exist)
 *
 * Returns the DB ids of all sessions belonging to this schedule after sync.
 */
async function generateSessionsForSchedule(
  supabase: SupabaseClient,
  scheduleId: string,
  semesterId: string,
  classId: string,
  schedule: DraftClassSchedule,
): Promise<string[]> {
  if (
    !schedule.startDate ||
    !schedule.endDate ||
    schedule.daysOfWeek.length === 0
  ) {
    return []; // Incomplete schedule — nothing to generate yet
  }

  // Fetch excluded dates for this schedule
  const { data: excludedRows } = await supabase
    .from("class_schedule_excluded_dates")
    .select("excluded_date")
    .eq("schedule_id", scheduleId);
  const excludedSet = new Set(
    (excludedRows ?? []).map((r) => r.excluded_date as string),
  );

  // Compute expected calendar dates
  const expectedDates = new Set<string>();
  for (const day of schedule.daysOfWeek) {
    const dates = computeOccurrenceDates(
      day,
      schedule.startDate,
      schedule.endDate,
    );
    for (const d of dates) {
      if (!excludedSet.has(d)) expectedDates.add(d);
    }
  }

  // Fetch existing sessions for this schedule
  const { data: existingSessions, error: fetchErr } = await supabase
    .from("class_sessions")
    .select("id, schedule_date")
    .eq("schedule_id", scheduleId);
  if (fetchErr) throw new Error(fetchErr.message);

  const existingByDate = new Map<string, string>(); // date → id
  for (const row of existingSessions ?? []) {
    if (row.schedule_date) {
      existingByDate.set(row.schedule_date as string, row.id as string);
    }
  }

  const pricingModel = schedule.pricingModel ?? "full_schedule";
  // Per-session mode: propagate drop_in_price to each generated session.
  // Full-schedule mode: session-level price is meaningless — keep null.
  const sessionDropInPrice =
    pricingModel === "per_session" ? (schedule.dropInPrice ?? null) : null;
  // Full-schedule sessions should not block the per-session capacity trigger —
  // capacity is enforced at the schedule level via schedule_enrollments.
  // Per-session capacity is enforced per-session via registrations.
  const sessionCapacity =
    pricingModel === "per_session" ? (schedule.capacity ?? null) : null;

  // INSERT new sessions (dates in expected but not in DB)
  const datesToInsert = [...expectedDates].filter(
    (d) => !existingByDate.has(d),
  );
  if (datesToInsert.length > 0) {
    const rows = datesToInsert.map((date) => ({
      schedule_id: scheduleId,
      class_id: classId,
      semester_id: semesterId,
      schedule_date: date,
      day_of_week: getDayOfWeek(date),
      start_time: schedule.startTime ?? null,
      end_time: schedule.endTime ?? null,
      location: schedule.location ?? null,
      instructor_name: schedule.instructorName ?? null,
      capacity: sessionCapacity,
      drop_in_price: sessionDropInPrice,
      registration_open_at: schedule.registrationOpenAt ?? null,
      registration_close_at: schedule.registrationCloseAt ?? null,
      gender_restriction: schedule.genderRestriction ?? null,
      urgency_threshold: schedule.urgencyThreshold ?? null,
      is_active: true,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("class_sessions")
      .insert(rows)
      .select("id, schedule_date");
    if (insErr) throw new Error(insErr.message);

    for (const row of inserted ?? []) {
      if (row.schedule_date) {
        existingByDate.set(row.schedule_date as string, row.id as string);
      }
    }
  }

  // UPDATE existing sessions with non-destructive field changes
  const datesToUpdate = [...expectedDates].filter((d) => existingByDate.has(d));
  if (datesToUpdate.length > 0) {
    const sessionIdsToUpdate = datesToUpdate.map((d) => existingByDate.get(d)!);
    const { error: updErr } = await supabase
      .from("class_sessions")
      .update({
        start_time: schedule.startTime ?? null,
        end_time: schedule.endTime ?? null,
        location: schedule.location ?? null,
        instructor_name: schedule.instructorName ?? null,
        drop_in_price: sessionDropInPrice,
        registration_open_at: schedule.registrationOpenAt ?? null,
        registration_close_at: schedule.registrationCloseAt ?? null,
        gender_restriction: schedule.genderRestriction ?? null,
        urgency_threshold: schedule.urgencyThreshold ?? null,
      })
      .in("id", sessionIdsToUpdate);
    if (updErr) throw new Error(updErr.message);
  }

  // UPDATE per-session capacity separately — check against enrollment first.
  // For full_schedule mode, sessionCapacity is null so this block is skipped.
  if (sessionCapacity !== null && sessionCapacity !== undefined) {
    for (const [date, sessionId] of existingByDate) {
      if (!expectedDates.has(date)) continue; // Will be deleted below — skip
      const { count: enrolledCount } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .neq("status", "cancelled");

      if ((enrolledCount ?? 0) > sessionCapacity) {
        const { data: sessionInfo } = await supabase
          .from("class_sessions")
          .select("schedule_date")
          .eq("id", sessionId)
          .single();
        throw new Error(
          `Cannot reduce capacity to ${sessionCapacity} for session on ${sessionInfo?.schedule_date ?? sessionId} — ` +
            `${enrolledCount} registrations exist.`,
        );
      }
    }

    const allSessionIds = [...existingByDate.entries()]
      .filter(([date]) => expectedDates.has(date))
      .map(([, id]) => id);
    if (allSessionIds.length > 0) {
      const { error: capErr } = await supabase
        .from("class_sessions")
        .update({ capacity: sessionCapacity })
        .in("id", allSessionIds)
        .eq("schedule_id", scheduleId);
      if (capErr) throw new Error(capErr.message);
    }
  }

  // DELETE removed sessions (dates in DB but not in expected)
  // DB trigger blocks this if registrations exist.
  const datesToDelete = [...existingByDate.keys()].filter(
    (d) => !expectedDates.has(d),
  );
  if (datesToDelete.length > 0) {
    const sessionIdsToDelete = datesToDelete.map((d) => existingByDate.get(d)!);
    const { error: groupErr } = await supabase
      .from("session_group_sessions")
      .delete()
      .in("session_id", sessionIdsToDelete);

    if (groupErr) throw new Error(groupErr.message);

    const { error: delErr } = await supabase
      .from("class_sessions")
      .delete()
      .in("id", sessionIdsToDelete);
    if (delErr) throw new Error(delErr.message);

    // Remove deleted sessions from map
    for (const d of datesToDelete) existingByDate.delete(d);
  }

  return [...existingByDate.values()];
}

/* -------------------------------------------------------------------------- */
/* Schedule-level excluded dates                                               */
/* -------------------------------------------------------------------------- */

async function syncScheduleExcludedDates(
  supabase: SupabaseClient,
  scheduleId: string,
  dates: DraftSessionExcludedDate[],
) {
  const { data: existing, error: fetchErr } = await supabase
    .from("class_schedule_excluded_dates")
    .select("id, excluded_date")
    .eq("schedule_id", scheduleId);
  if (fetchErr) throw new Error(fetchErr.message);

  const incomingDates = new Set(dates.map((d) => d.date));
  const existingByDate = new Map<string, string>();
  for (const row of existing ?? []) {
    existingByDate.set(row.excluded_date as string, row.id as string);
  }

  const toInsert = dates.filter((d) => !existingByDate.has(d.date));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from("class_schedule_excluded_dates")
      .insert(
        toInsert.map((d) => ({
          schedule_id: scheduleId,
          excluded_date: d.date,
          reason: d.reason ?? null,
        })),
      );
    if (insErr) throw new Error(insErr.message);
  }

  const idsToDelete = [...existingByDate.entries()]
    .filter(([date]) => !incomingDates.has(date))
    .map(([, id]) => id);
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("class_schedule_excluded_dates")
      .delete()
      .in("id", idsToDelete);
    if (delErr) throw new Error(delErr.message);
  }
}

/* -------------------------------------------------------------------------- */
/* Mode A: schedule-level price tiers                                          */
/* -------------------------------------------------------------------------- */

/**
 * Syncs named price tiers for a schedule into schedule_price_tiers.
 * Replaces the legacy class_session_price_rows approach for full_schedule mode.
 * Uses delete+re-insert to handle label/amount/order changes cleanly.
 */
async function syncSchedulePriceTiers(
  supabase: SupabaseClient,
  scheduleId: string,
  tiers: DraftSchedulePriceTier[],
) {
  const { error: delErr } = await supabase
    .from("schedule_price_tiers")
    .delete()
    .eq("schedule_id", scheduleId);
  if (delErr) throw new Error(delErr.message);

  if (tiers.length === 0) return;

  const rows = tiers.map((t, i) => ({
    schedule_id: scheduleId,
    label: t.label,
    amount: t.amount,
    sort_order: t.sortOrder ?? i,
    is_default: t.isDefault,
  }));

  const { error: insErr } = await supabase
    .from("schedule_price_tiers")
    .insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/* -------------------------------------------------------------------------- */
/* Price rows per schedule (legacy — applied to all generated sessions)        */
/* -------------------------------------------------------------------------- */

/**
 * Syncs price rows for all class_sessions belonging to a schedule.
 * Uses delete+re-insert strategy identical to the per-session version.
 */
async function syncPriceRowsForSchedule(
  supabase: SupabaseClient,
  scheduleId: string,
  priceRows: DraftSessionPriceRow[],
) {
  // Fetch all session ids for this schedule
  const { data: sessions, error: fetchErr } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("schedule_id", scheduleId);
  if (fetchErr) throw new Error(fetchErr.message);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) return;

  // Delete existing price rows for all sessions in this schedule
  const { error: delErr } = await supabase
    .from("class_session_price_rows")
    .delete()
    .in("class_session_id", sessionIds);
  if (delErr) throw new Error(delErr.message);

  if (priceRows.length === 0) return;

  // Insert fresh rows for every session
  const rows = sessionIds.flatMap((sessionId) =>
    priceRows.map((r, i) => ({
      class_session_id: sessionId,
      label: r.label,
      amount: r.amount,
      sort_order: r.sortOrder ?? i,
      is_default: r.isDefault,
    })),
  );

  const { error: insErr } = await supabase
    .from("class_session_price_rows")
    .insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/* -------------------------------------------------------------------------- */
/* Session options per schedule                                                 */
/* -------------------------------------------------------------------------- */

async function syncOptionsForSchedule(
  supabase: SupabaseClient,
  scheduleId: string,
  options: DraftSessionOption[],
) {
  const { data: sessions, error: fetchErr } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("schedule_id", scheduleId);
  if (fetchErr) throw new Error(fetchErr.message);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) return;

  const { error: delErr } = await supabase
    .from("class_session_options")
    .delete()
    .in("class_session_id", sessionIds);
  if (delErr) throw new Error(delErr.message);

  if (options.length === 0) return;

  const rows = sessionIds.flatMap((sessionId) =>
    options.map((o, i) => ({
      class_session_id: sessionId,
      name: o.name,
      description: o.description ?? null,
      price: o.price,
      is_required: o.isRequired,
      sort_order: o.sortOrder ?? i,
    })),
  );

  const { error: insErr } = await supabase
    .from("class_session_options")
    .insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/* -------------------------------------------------------------------------- */
/* Class requirements                                                           */
/* -------------------------------------------------------------------------- */

async function syncClassRequirements(
  supabase: SupabaseClient,
  classId: string,
  requirements: DraftClassRequirement[],
) {
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

/* -------------------------------------------------------------------------- */
/* Calendar utilities                                                           */
/* -------------------------------------------------------------------------- */

const DAY_OF_WEEK_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * Returns all 'YYYY-MM-DD' strings in [startDate, endDate] that fall on dayOfWeek.
 */
function computeOccurrenceDates(
  dayOfWeek: string,
  startDate: string,
  endDate: string,
): string[] {
  const targetDay = DAY_OF_WEEK_INDEX[dayOfWeek.toLowerCase()];
  if (targetDay === undefined) return [];

  const result: string[] = [];
  const current = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");

  while (current.getUTCDay() !== targetDay) {
    current.setUTCDate(current.getUTCDate() + 1);
  }

  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return result;
}

/** Returns the lowercase day-of-week name for a 'YYYY-MM-DD' date string. */
function getDayOfWeek(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}
