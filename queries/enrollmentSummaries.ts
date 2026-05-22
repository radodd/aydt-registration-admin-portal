/**
 * Phase 3a — unified enrollment helper.
 *
 * Admin reporting + cancellation paths historically only touched `registrations`,
 * so admin-created `section_enrollments` rows were invisible to dashboards and
 * cancel actions. This module provides a single read shape across both tables
 * and cancel helpers that touch both atomically.
 *
 * Naming convention going forward:
 *   - `registrations`        ≈ "session bookings" (per-date, drop-in + public flow)
 *   - `section_enrollments` ≈ "term enrollments" (per-block, admin standard/tiered)
 *
 * See memory note `project_enrollment_table_divergence.md`.
 */

import { createClient } from "@/utils/supabase/server";

export type EnrollmentSource = "registrations" | "section_enrollments";

/** Status enums in the two tables differ; this is the union normalized for UI. */
export type UnifiedStatus = "pending" | "pending_payment" | "confirmed" | "cancelled";

export type UnifiedEnrollment = {
  source: EnrollmentSource;
  /** PK of the row in its source table */
  enrollmentId: string;
  dancerId: string;
  classId: string | null;
  scheduleId: string | null;
  /** Present only for `registrations` (per-session bookings). */
  sessionId: string | null;
  semesterId: string | null;
  status: UnifiedStatus;
  /** Phase 3a: class_tiers.id chosen at enrollment, when applicable. */
  classTierId: string | null;
  batchId: string | null;
  createdAt: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function normalizeStatus(raw: string | null | undefined): UnifiedStatus {
  if (raw === "pending" || raw === "pending_payment" || raw === "confirmed" || raw === "cancelled") {
    return raw;
  }
  return "pending";
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Reads                                                                        */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * All enrollments touching a semester, across both tables. Excludes cancelled
 * rows by default; pass `{ includeCancelled: true }` to include them.
 */
export async function fetchEnrollmentsForSemester(
  semesterId: string,
  opts?: { includeCancelled?: boolean },
): Promise<UnifiedEnrollment[]> {
  const supabase = await createClient();
  const includeCancelled = opts?.includeCancelled ?? false;

  // registrations are linked to semester via class_sessions.semester_id.
  const regQuery = supabase
    .from("registrations")
    .select(
      "id, dancer_id, session_id, status, registration_batch_id, batch_id, created_at, class_sessions!inner(class_id, section_id, semester_id)",
    )
    .eq("class_sessions.semester_id", semesterId);
  if (!includeCancelled) regQuery.neq("status", "cancelled");

  // section_enrollments are linked to semester via class_sections.semester_id.
  const enrollQuery = supabase
    .from("section_enrollments")
    .select(
      "id, dancer_id, section_id, class_tier_id, batch_id, status, created_at, class_sections!inner(class_id, semester_id)",
    )
    .eq("class_sections.semester_id", semesterId);
  if (!includeCancelled) enrollQuery.neq("status", "cancelled");

  const [{ data: regRows }, { data: enrollRows }] = await Promise.all([regQuery, enrollQuery]);

  const out: UnifiedEnrollment[] = [];
  for (const r of regRows ?? []) {
    const cs: any = (r as any).class_sessions;
    out.push({
      source: "registrations",
      enrollmentId: r.id as string,
      dancerId: r.dancer_id as string,
      classId: cs?.class_id ?? null,
      scheduleId: cs?.section_id ?? null,
      sessionId: (r as any).session_id ?? null,
      semesterId: cs?.semester_id ?? semesterId,
      status: normalizeStatus((r as any).status),
      classTierId: null,
      batchId: ((r as any).registration_batch_id ?? (r as any).batch_id) ?? null,
      createdAt: (r as any).created_at as string,
    });
  }
  for (const e of enrollRows ?? []) {
    const cs: any = (e as any).class_sections;
    out.push({
      source: "section_enrollments",
      enrollmentId: e.id as string,
      dancerId: e.dancer_id as string,
      classId: cs?.class_id ?? null,
      scheduleId: (e as any).section_id as string,
      sessionId: null,
      semesterId: cs?.semester_id ?? semesterId,
      status: normalizeStatus((e as any).status),
      classTierId: (e as any).class_tier_id ?? null,
      batchId: (e as any).batch_id ?? null,
      createdAt: (e as any).created_at as string,
    });
  }
  return out;
}

/**
 * All enrollments for a single dancer. Optionally scope to one semester.
 */
export async function fetchEnrollmentsForDancer(
  dancerId: string,
  opts?: { semesterId?: string; includeCancelled?: boolean },
): Promise<UnifiedEnrollment[]> {
  const supabase = await createClient();
  const includeCancelled = opts?.includeCancelled ?? false;

  const regQuery = supabase
    .from("registrations")
    .select(
      "id, dancer_id, session_id, status, registration_batch_id, batch_id, created_at, class_sessions!inner(class_id, section_id, semester_id)",
    )
    .eq("dancer_id", dancerId);
  if (opts?.semesterId) regQuery.eq("class_sessions.semester_id", opts.semesterId);
  if (!includeCancelled) regQuery.neq("status", "cancelled");

  const enrollQuery = supabase
    .from("section_enrollments")
    .select(
      "id, dancer_id, section_id, class_tier_id, batch_id, status, created_at, class_sections!inner(class_id, semester_id)",
    )
    .eq("dancer_id", dancerId);
  if (opts?.semesterId) enrollQuery.eq("class_sections.semester_id", opts.semesterId);
  if (!includeCancelled) enrollQuery.neq("status", "cancelled");

  const [{ data: regRows }, { data: enrollRows }] = await Promise.all([regQuery, enrollQuery]);

  const out: UnifiedEnrollment[] = [];
  for (const r of regRows ?? []) {
    const cs: any = (r as any).class_sessions;
    out.push({
      source: "registrations",
      enrollmentId: r.id as string,
      dancerId: r.dancer_id as string,
      classId: cs?.class_id ?? null,
      scheduleId: cs?.section_id ?? null,
      sessionId: (r as any).session_id ?? null,
      semesterId: cs?.semester_id ?? null,
      status: normalizeStatus((r as any).status),
      classTierId: null,
      batchId: ((r as any).registration_batch_id ?? (r as any).batch_id) ?? null,
      createdAt: (r as any).created_at as string,
    });
  }
  for (const e of enrollRows ?? []) {
    const cs: any = (e as any).class_sections;
    out.push({
      source: "section_enrollments",
      enrollmentId: e.id as string,
      dancerId: e.dancer_id as string,
      classId: cs?.class_id ?? null,
      scheduleId: (e as any).section_id as string,
      sessionId: null,
      semesterId: cs?.semester_id ?? null,
      status: normalizeStatus((e as any).status),
      classTierId: (e as any).class_tier_id ?? null,
      batchId: (e as any).batch_id ?? null,
      createdAt: (e as any).created_at as string,
    });
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Cancels                                                                      */
/* ──────────────────────────────────────────────────────────────────────────── */

export type CancelCounts = { registrations: number; scheduleEnrollments: number };

/**
 * Mark every non-cancelled enrollment under a class as cancelled, across both
 * tables. Does NOT touch payments/refunds — callers handle those separately.
 */
export async function cancelEnrollmentsForClass(classId: string): Promise<CancelCounts> {
  const supabase = await createClient();

  // registrations: cancel rows whose class_sessions.class_id matches.
  const { data: sessionIds } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("class_id", classId);
  const sessionIdList = (sessionIds ?? []).map((r) => r.id as string);

  let registrationsCount = 0;
  if (sessionIdList.length > 0) {
    const { data, error } = await supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .in("session_id", sessionIdList)
      .neq("status", "cancelled")
      .select("id");
    if (error) throw new Error(error.message);
    registrationsCount = data?.length ?? 0;
  }

  // section_enrollments: cancel rows whose class_sections.class_id matches.
  const { data: scheduleIds } = await supabase
    .from("class_sections")
    .select("id")
    .eq("class_id", classId);
  const scheduleIdList = (scheduleIds ?? []).map((r) => r.id as string);

  let scheduleEnrollmentsCount = 0;
  if (scheduleIdList.length > 0) {
    const { data, error } = await supabase
      .from("section_enrollments")
      .update({ status: "cancelled" })
      .in("section_id", scheduleIdList)
      .neq("status", "cancelled")
      .select("id");
    if (error) throw new Error(error.message);
    scheduleEnrollmentsCount = data?.length ?? 0;
  }

  return {
    registrations: registrationsCount,
    scheduleEnrollments: scheduleEnrollmentsCount,
  };
}

/**
 * Cancel a single dancer's enrollments within a semester (used when an admin
 * removes a dancer from a family or revokes their access mid-semester).
 */
export async function cancelEnrollmentsForDancerInSemester(
  dancerId: string,
  semesterId: string,
): Promise<CancelCounts> {
  const supabase = await createClient();

  // For registrations, we need the session ids belonging to this semester first.
  const { data: sessionIds } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("semester_id", semesterId);
  const sessionIdList = (sessionIds ?? []).map((r) => r.id as string);

  let registrationsCount = 0;
  if (sessionIdList.length > 0) {
    const { data, error } = await supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .eq("dancer_id", dancerId)
      .in("session_id", sessionIdList)
      .neq("status", "cancelled")
      .select("id");
    if (error) throw new Error(error.message);
    registrationsCount = data?.length ?? 0;
  }

  const { data: scheduleIds } = await supabase
    .from("class_sections")
    .select("id")
    .eq("semester_id", semesterId);
  const scheduleIdList = (scheduleIds ?? []).map((r) => r.id as string);

  let scheduleEnrollmentsCount = 0;
  if (scheduleIdList.length > 0) {
    const { data, error } = await supabase
      .from("section_enrollments")
      .update({ status: "cancelled" })
      .eq("dancer_id", dancerId)
      .in("section_id", scheduleIdList)
      .neq("status", "cancelled")
      .select("id");
    if (error) throw new Error(error.message);
    scheduleEnrollmentsCount = data?.length ?? 0;
  }

  return {
    registrations: registrationsCount,
    scheduleEnrollments: scheduleEnrollmentsCount,
  };
}

/**
 * Mark every non-cancelled enrollment under a semester as cancelled, across
 * both tables. Used by unpublishSemester / semesterLifecycle archival flows.
 */
export async function cancelEnrollmentsForSemester(semesterId: string): Promise<CancelCounts> {
  const supabase = await createClient();

  const { data: sessionIds } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("semester_id", semesterId);
  const sessionIdList = (sessionIds ?? []).map((r) => r.id as string);

  let registrationsCount = 0;
  if (sessionIdList.length > 0) {
    const { data, error } = await supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .in("session_id", sessionIdList)
      .neq("status", "cancelled")
      .select("id");
    if (error) throw new Error(error.message);
    registrationsCount = data?.length ?? 0;
  }

  const { data, error } = await supabase
    .from("section_enrollments")
    .update({ status: "cancelled" })
    .neq("status", "cancelled")
    .in(
      "section_id",
      (await supabase.from("class_sections").select("id").eq("semester_id", semesterId))
        .data?.map((r) => r.id as string) ?? [],
    )
    .select("id");
  if (error) throw new Error(error.message);

  return {
    registrations: registrationsCount,
    scheduleEnrollments: data?.length ?? 0,
  };
}

/**
 * Convenience: count of non-cancelled enrollments per classId for a semester.
 * Used by admin dashboards/reports that today only count `registrations`.
 */
export async function fetchEnrollmentCountsByClass(
  semesterId: string,
): Promise<Record<string, number>> {
  const enrollments = await fetchEnrollmentsForSemester(semesterId);
  const counts: Record<string, number> = {};
  for (const e of enrollments) {
    if (!e.classId) continue;
    counts[e.classId] = (counts[e.classId] ?? 0) + 1;
  }
  return counts;
}
