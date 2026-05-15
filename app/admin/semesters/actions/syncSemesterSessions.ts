"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import type {
  DraftClass,
  DraftClassRequirement,
  DraftClassSchedule,
  DraftClassTier,
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
  await requireAdmin();
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

    // Treat empty string as NULL division (drop-in classes have no division).
    const divisionForWrite =
      draftClass.division && draftClass.division !== "" ? draftClass.division : null;

    if (draftClass.id && existingClassIds.has(draftClass.id)) {
      // UPDATE existing class
      const isCompTrack = draftClass.isCompetitionTrack ?? false;
      const { error: updateErr } = await supabase
        .from("classes")
        .update({
          name: draftClass.name,
          display_name: draftClass.displayName ?? null,
          discipline: draftClass.discipline,
          division: divisionForWrite,
          description: draftClass.description ?? null,
          min_age: draftClass.minAge ?? null,
          max_age: draftClass.maxAge ?? null,
          min_grade: draftClass.minGrade ?? null,
          max_grade: draftClass.maxGrade ?? null,
          is_competition_track: isCompTrack,
          is_tiered: draftClass.isTiered ?? false,
          requires_teacher_rec: draftClass.requiresTeacherRec ?? false,
          tuition_override_amount: draftClass.tuitionOverride ?? null,
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
          division: divisionForWrite,
          description: draftClass.description ?? null,
          min_age: draftClass.minAge ?? null,
          max_age: draftClass.maxAge ?? null,
          min_grade: draftClass.minGrade ?? null,
          max_grade: draftClass.maxGrade ?? null,
          is_competition_track: isCompTrackNew,
          is_tiered: draftClass.isTiered ?? false,
          requires_teacher_rec: draftClass.requiresTeacherRec ?? false,
          tuition_override_amount: draftClass.tuitionOverride ?? null,
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
    /* 4. Sync class_tiers (Phase 2)                                         */
    /* -------------------------------------------------------------------- */

    await syncClassTiers(supabase, classId, draftClass.tiers ?? []);

    /* -------------------------------------------------------------------- */
    /* 5. Sync class_requirements                                            */
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
    await generateSessionsForSchedule(
      supabase,
      scheduleId,
      semesterId,
      classId,
      draftSchedule,
    );

    // Map draft schedule keys → DB schedule ID.
    // syncSemesterSessionGroups uses these to expand each schedule to its sessions.
    sessionIdMap.set(draftSchedule._clientKey, scheduleId);
    if (draftSchedule.id) sessionIdMap.set(draftSchedule.id, scheduleId);

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

/** Empty string → null. Postgres rejects "" for date/time/uuid columns. */
function emptyToNull<T>(v: T | "" | null | undefined): T | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v as T;
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
    start_time: emptyToNull(s.startTime),
    end_time: emptyToNull(s.endTime),
    start_date: emptyToNull(s.startDate),
    end_date: emptyToNull(s.endDate),
    location: emptyToNull(s.location),
    instructor_name: emptyToNull(s.instructorName),
    capacity: s.capacity ?? null,
    registration_open_at: s.registrationOpenAt ?? null,
    registration_close_at: s.registrationCloseAt ?? null,
    gender_restriction: s.genderRestriction ?? null,
    urgency_threshold: s.urgencyThreshold ?? null,
    pricing_model: s.pricingModel ?? "full_schedule",
    is_drop_in: s.isDropIn ?? false,
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
  const overridesByDate = new Map(
    (schedule.perDateOverrides ?? []).map((o) => [o.date, o]),
  );
  // Resolve effective per-date values, layering schedule defaults under overrides.
  // Full_schedule sessions: capacity/drop_in_price stay null (enforced at schedule level).
  // Per_session sessions: per-date override → schedule default → null.
  function effectiveForDate(date: string) {
    const o = overridesByDate.get(date);
    const startTime = (o?.startTime ?? schedule.startTime) || null;
    const endTime = (o?.endTime ?? schedule.endTime) || null;
    if (pricingModel === "per_session") {
      return {
        start_time: startTime,
        end_time: endTime,
        capacity: o?.capacity ?? schedule.capacity ?? null,
        drop_in_price: o?.dropInPrice ?? schedule.dropInPrice ?? null,
      };
    }
    return {
      start_time: startTime,
      end_time: endTime,
      capacity: null,
      drop_in_price: null,
    };
  }

  // INSERT new sessions (dates in expected but not in DB)
  const datesToInsert = [...expectedDates].filter(
    (d) => !existingByDate.has(d),
  );
  if (datesToInsert.length > 0) {
    const rows = datesToInsert.map((date) => {
      const eff = effectiveForDate(date);
      return {
        schedule_id: scheduleId,
        class_id: classId,
        semester_id: semesterId,
        schedule_date: date,
        day_of_week: getDayOfWeek(date),
        start_time: eff.start_time,
        end_time: eff.end_time,
        location: schedule.location ?? null,
        instructor_name: schedule.instructorName ?? null,
        capacity: eff.capacity,
        drop_in_price: eff.drop_in_price,
        registration_open_at: schedule.registrationOpenAt ?? null,
        registration_close_at: schedule.registrationCloseAt ?? null,
        gender_restriction: schedule.genderRestriction ?? null,
        urgency_threshold: schedule.urgencyThreshold ?? null,
        is_active: true,
      };
    });

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

  // UPDATE existing sessions per-date so per-date overrides are honoured.
  // Capacity downgrades are validated against existing registration counts.
  const datesToUpdate = [...expectedDates].filter((d) => existingByDate.has(d));
  for (const date of datesToUpdate) {
    const sessionId = existingByDate.get(date)!;
    const eff = effectiveForDate(date);

    if (pricingModel === "per_session" && eff.capacity != null) {
      const { count: enrolledCount } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .neq("status", "cancelled");
      if ((enrolledCount ?? 0) > eff.capacity) {
        throw new Error(
          `Cannot reduce capacity to ${eff.capacity} for session on ${date} — ${enrolledCount} registrations exist.`,
        );
      }
    }

    const { error: updErr } = await supabase
      .from("class_sessions")
      .update({
        start_time: eff.start_time,
        end_time: eff.end_time,
        location: schedule.location ?? null,
        instructor_name: schedule.instructorName ?? null,
        capacity: eff.capacity,
        drop_in_price: eff.drop_in_price,
        registration_open_at: schedule.registrationOpenAt ?? null,
        registration_close_at: schedule.registrationCloseAt ?? null,
        gender_restriction: schedule.genderRestriction ?? null,
        urgency_threshold: schedule.urgencyThreshold ?? null,
      })
      .eq("id", sessionId);
    if (updErr) throw new Error(updErr.message);
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
/* Class tiers (Phase 2)                                                       */
/* -------------------------------------------------------------------------- */

async function syncClassTiers(
  supabase: SupabaseClient,
  classId: string,
  tiers: DraftClassTier[],
) {
  const { error: delErr } = await supabase
    .from("class_tiers")
    .delete()
    .eq("class_id", classId);
  if (delErr) throw new Error(`Tier sync (delete): ${delErr.message}`);

  if (tiers.length === 0) return;

  // Validate + normalize each tier; surface the offending row by label so the
  // admin can find it. Empty strings on time columns must become NULL — Postgres
  // `time` rejects "" with "invalid input syntax for type time".
  const rows = tiers.map((t, idx) => {
    const tierName = t.label?.trim() || `Tier ${idx + 1}`;

    const start = normalizeTimeForDb(t.startTime, tierName, "start time");
    const end = normalizeTimeForDb(t.endTime, tierName, "end time");

    let priceCents: number | null = null;
    if (t.price != null && (t.price as unknown) !== "") {
      const n = Number(t.price);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Tier "${tierName}": price must be a non-negative number (got "${t.price}").`);
      }
      priceCents = Math.round(n * 100);
    }

    if (!t.label || !t.label.trim()) {
      throw new Error(`Tier ${idx + 1}: name is required.`);
    }

    return {
      class_id: classId,
      label: t.label.trim(),
      start_time: start,
      end_time: end,
      price_cents: priceCents,
      sort_order: t.sortOrder ?? idx,
      is_default: t.isDefault ?? false,
    };
  });

  const { error: insErr } = await supabase.from("class_tiers").insert(rows);
  if (insErr) {
    throw new Error(formatPostgrestError("class_tiers insert", insErr));
  }
}

/**
 * Normalize a tier-time string for Postgres `time` column. Accepts "HH:MM",
 * "HH:MM:SS", or null/undefined/"" (→ null). Anything else throws a labeled
 * error so the admin can locate the offending field.
 */
function normalizeTimeForDb(
  raw: string | null | undefined,
  tierName: string,
  fieldLabel: string,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  // Strict HH:MM or HH:MM:SS in 24-hour form.
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    throw new Error(
      `Tier "${tierName}": ${fieldLabel} "${trimmed}" is not a valid time. Use the picker or HH:MM (24-hour) format.`,
    );
  }
  return trimmed;
}

function formatPostgrestError(
  context: string,
  err: { message?: string; details?: string | null; hint?: string | null; code?: string | null },
): string {
  const parts = [context, err.message ?? "unknown error"];
  if (err.details) parts.push(`details: ${err.details}`);
  if (err.hint) parts.push(`hint: ${err.hint}`);
  if (err.code) parts.push(`code: ${err.code}`);
  return parts.join(" · ");
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

  const { data: inserted, error: insErr } = await supabase
    .from("class_requirements")
    .insert(rows)
    .select("id");
  if (insErr) throw new Error(insErr.message);

  // Sync approved-dancer lists for teacher_recommendation requirements.
  // Build a map from old id → new id (re-insert gives new id when old id wasn't preserved).
  const insertedIds = (inserted ?? []).map((r: { id: string }) => r.id);

  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i];
    if (req.requirement_type !== "teacher_recommendation") continue;
    const approvedIds = req.approvedDancerIds ?? [];
    // Determine the DB requirement id: either the preserved id or the freshly inserted one.
    const reqDbId = req.id ?? insertedIds[i];
    if (!reqDbId) continue;

    // Delete existing approved dancers for this requirement then re-insert.
    const { error: delApprovedErr } = await supabase
      .from("class_requirement_approved_dancers")
      .delete()
      .eq("class_requirement_id", reqDbId);
    if (delApprovedErr) throw new Error(delApprovedErr.message);

    if (approvedIds.length > 0) {
      const approvedRows = approvedIds.map((dancerId) => ({
        class_requirement_id: reqDbId,
        dancer_id: dancerId,
      }));
      const { error: insApprovedErr } = await supabase
        .from("class_requirement_approved_dancers")
        .insert(approvedRows);
      if (insApprovedErr) throw new Error(insApprovedErr.message);
    }
  }
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
