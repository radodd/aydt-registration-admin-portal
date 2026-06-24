import { Discount, HydratedDiscount, SemesterDiscount, type FamilyAccountCreditWithAdmin } from "@/types";
import { createClient } from "@/utils/supabase/client";

const CREDIT_SELECT = `
  id, family_id, amount, reason, is_active,
  created_at, used_at, source_batch_id, used_in_batch_id,
  issued_by_admin:users!family_account_credits_issued_by_admin_id_fkey(first_name, last_name)
`;

/** All credits for a single family, newest first. */
export async function getFamilyCredits(familyId: string): Promise<FamilyAccountCreditWithAdmin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("family_account_credits")
    .select(CREDIT_SELECT)
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  if (error) console.error("getFamilyCredits:", error.message);
  return (data ?? []) as FamilyAccountCreditWithAdmin[];
}

/** All credits across all families, newest first. Includes family name. */
export async function getAllCredits(): Promise<FamilyAccountCreditWithAdmin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("family_account_credits")
    .select(`${CREDIT_SELECT}, families(family_name)`)
    .order("created_at", { ascending: false });
  if (error) console.error("getAllCredits:", error.message);
  return (data ?? []) as FamilyAccountCreditWithAdmin[];
}

export async function getFamilies() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("families")
    .select(
      `
      id,
      family_name,
      created_at,

      users:users!family_id (
        id,
        first_name,
        last_name,
        email,
        phone_number,
        is_primary_parent
      ),

      dancers:dancers!family_id (
        id,
        first_name,
        last_name,
        is_self,

        registrations:meeting_enrollments!dancer_id (
          id,
          status,
          class_meetings!meeting_id (
            id,
            day_of_week,
            start_time,
            end_time,
            classes ( name )
          )
        )
      )
    `,
    )
    .order("family_name", { ascending: true });

  if (error) {
    console.error("Failed to load families:", error);
  }

  return data;
}
export async function getDancers() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("dancers")
    .select(
      `
          id,
          first_name,
          middle_name,
          last_name,
          gender,
          birth_date,
          grade,
          email,
          phone_number,
          address_line1,
          address_line2,
          city,
          state,
          zipcode,
          is_self,
          created_at,
          users (
            id,
            first_name,
            last_name,
            email
          )
          
        `,
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load dancers.", error.message);
  }
  return data;
}

/**
 * Phase 1: returns classes with nested class_meetings.
 * Optional semesterId restricts to a specific semester.
 */
export async function getClasses(semesterId?: string) {
  const supabase = createClient();

  let query = supabase
    .from("classes")
    .select("*, class_meetings(*), class_sections(id, start_date, end_date)")
    .order("created_at", { ascending: false });

  if (semesterId) {
    query = query.eq("semester_id", semesterId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load classes.", error.message);
  }
  return data ?? [];
}

/** @deprecated Use getClasses(). Legacy callers receive all classes. */
export async function getSessions(_excludeSemesterId?: string) {
  return getClasses();
}

export async function getUsers() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("users")
    .select(
      `
            id,
            family_id,
            email,
            first_name,
            middle_name,
            last_name,
            phone_number,
            is_primary_parent,
            role,
            status,
            created_at

          `,
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load users.", error.message);
  }
  return data;
}

export interface Registrant {
  id: string;
  dancerId: string | null;
  dancerName: string;
  birthDate: string | null;
  grade: string | null;
  parentEmail: string | null;
  parentName: string | null;
  status: string;
  sessionLabel: string;
  enrollmentType: "per_session" | "full_schedule";
  createdAt: string;
  sessionId: string | null;
}

export async function getClassWithSemester(classId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classes")
    .select("*, class_meetings(*), semesters(id, name, status)")
    .eq("id", classId)
    .single();
  if (error) console.error("Failed to load class.", error.message);
  return data;
}

function formatTimeLabel(start: string | null, end: string | null) {
  const fmt = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

export async function getClassRegistrants(
  classId: string
): Promise<Registrant[]> {
  const supabase = createClient();
  const results: Registrant[] = [];

  // --- Per-session model ---
  const { data: sessions } = await supabase
    .from("class_meetings")
    .select("id, day_of_week, start_time, end_time")
    .eq("class_id", classId);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  if (sessionIds.length > 0) {
    const { data: regs } = await supabase
      .from("meeting_enrollments")
      .select(
        "id, status, meeting_id, created_at, dancers(id, first_name, last_name, birth_date, grade), users(id, first_name, last_name, email), class_meetings(day_of_week, start_time, end_time)"
      )
      .in("meeting_id", sessionIds)
      .neq("status", "cancelled");

    for (const r of regs ?? []) {
      const dancer = Array.isArray(r.dancers) ? r.dancers[0] : r.dancers;
      const user = Array.isArray(r.users) ? r.users[0] : r.users;
      const cs = Array.isArray(r.class_meetings)
        ? r.class_meetings[0]
        : r.class_meetings;
      const day = cs?.day_of_week
        ? cs.day_of_week.charAt(0).toUpperCase() + cs.day_of_week.slice(1)
        : "";
      results.push({
        id: r.id,
        dancerId: dancer?.id ?? null,
        dancerName: dancer
          ? `${dancer.first_name} ${dancer.last_name}`
          : "Unknown",
        birthDate: dancer?.birth_date ?? null,
        grade: dancer?.grade ?? null,
        parentEmail: user?.email ?? null,
        parentName: user
          ? `${user.first_name} ${user.last_name}`
          : null,
        status: r.status,
        sessionLabel: day
          ? `${day} ${formatTimeLabel(cs?.start_time, cs?.end_time)}`
          : "—",
        enrollmentType: "per_session",
        createdAt: r.created_at,
        sessionId: r.meeting_id,
      });
    }
  }

  // --- Full-schedule model ---
  const { data: schedules } = await supabase
    .from("class_sections")
    .select("id, days_of_week, start_time, end_time")
    .eq("class_id", classId);

  const scheduleIds = (schedules ?? []).map((s) => s.id);

  if (scheduleIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("section_enrollments")
      .select(
        "id, status, section_id, created_at, dancers(id, first_name, last_name, birth_date, grade), registration_orders(id, parent_id)"
      )
      .in("section_id", scheduleIds)
      .neq("status", "cancelled");

    const parentIds = [
      ...new Set(
        (enrollments ?? [])
          .map((e) => {
            const rb = Array.isArray(e.registration_orders)
              ? e.registration_orders[0]
              : e.registration_orders;
            return rb?.parent_id as string | null;
          })
          .filter(Boolean)
      ),
    ] as string[];

    let parentMap: Record<
      string,
      { first_name: string; last_name: string; email: string }
    > = {};
    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", parentIds);
      for (const p of parents ?? []) {
        parentMap[p.id] = p;
      }
    }

    const scheduleMap = Object.fromEntries(
      (schedules ?? []).map((s) => [s.id, s])
    );

    for (const e of enrollments ?? []) {
      const dancer = Array.isArray(e.dancers) ? e.dancers[0] : e.dancers;
      const rb = Array.isArray(e.registration_orders)
        ? e.registration_orders[0]
        : e.registration_orders;
      const parent = rb?.parent_id ? parentMap[rb.parent_id] : null;
      const sch = scheduleMap[e.section_id];
      const days = (sch?.days_of_week as string[] | null)
        ?.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3))
        .join("/");
      results.push({
        id: e.id,
        dancerId: dancer?.id ?? null,
        dancerName: dancer
          ? `${dancer.first_name} ${dancer.last_name}`
          : "Unknown",
        birthDate: dancer?.birth_date ?? null,
        grade: dancer?.grade ?? null,
        parentEmail: parent?.email ?? null,
        parentName: parent
          ? `${parent.first_name} ${parent.last_name}`
          : null,
        status: e.status,
        sessionLabel: days
          ? `${days} ${formatTimeLabel(sch?.start_time, sch?.end_time)}`
          : "—",
        enrollmentType: "full_schedule",
        createdAt: e.created_at,
        sessionId: null,
      });
    }
  }

  return results;
}

export async function getClassCapacity(classId: string) {
  const supabase = createClient();

  const { data: sessions } = await supabase
    .from("class_meetings")
    .select("id, capacity")
    .eq("class_id", classId);

  const { data: schedules } = await supabase
    .from("class_sections")
    .select("id, capacity")
    .eq("class_id", classId);

  const totalCapacity = [
    ...(sessions ?? []).map((s) => s.capacity ?? 0),
    ...(schedules ?? []).map((s) => s.capacity ?? 0),
  ].reduce((a, b) => a + b, 0);

  return { totalCapacity, sessionCount: (sessions ?? []).length };
}

/* -------------------------------------------------------------------------- */
/* Instructors                                                                 */
/* -------------------------------------------------------------------------- */

export interface InstructorRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  status: "invited" | "active" | "inactive" | null;
  created_at: string;
  sessionCount: number;
}

export async function getInstructors(): Promise<InstructorRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone_number,
      status,
      created_at,
      class_meeting_instructors ( meeting_id )
    `)
    .eq("role", "instructor")
    .order("last_name", { ascending: true });

  if (error) {
    console.error("getInstructors:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id:           row.id,
    first_name:   row.first_name,
    last_name:    row.last_name,
    email:        row.email,
    phone_number: row.phone_number,
    status:       row.status,
    created_at:   row.created_at,
    sessionCount: Array.isArray(row.class_meeting_instructors)
      ? row.class_meeting_instructors.length
      : 0,
  }));
}

export interface SessionInstructorAssignment {
  sessionId:   string;
  dayOfWeek:   string;
  startTime:   string | null;
  endTime:     string | null;
  instructors: { userId: string; firstName: string; lastName: string; isLead: boolean }[];
}

/** Instructor assignments for all active sessions of a class. */
export async function getSessionInstructorsForClass(
  classId: string,
): Promise<SessionInstructorAssignment[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_meetings")
    .select(`
      id,
      day_of_week,
      start_time,
      end_time,
      class_meeting_instructors (
        user_id,
        is_lead,
        users ( first_name, last_name )
      )
    `)
    .eq("class_id", classId)
    .eq("is_active", true)
    .is("cancelled_at", null)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("getSessionInstructorsForClass:", error.message);
    return [];
  }

  return (data ?? []).map((s) => {
    const csi = Array.isArray(s.class_meeting_instructors)
      ? s.class_meeting_instructors
      : [];
    return {
      sessionId: s.id,
      dayOfWeek: s.day_of_week,
      startTime: s.start_time,
      endTime:   s.end_time,
      instructors: csi
        .map((i) => {
          const u = Array.isArray(i.users) ? i.users[0] : i.users;
          return {
            userId:    i.user_id,
            firstName: u?.first_name ?? "",
            lastName:  u?.last_name  ?? "",
            isLead:    i.is_lead,
          };
        })
        .filter((i) => i.userId),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Instructor Notes (admin read)                                               */
/* -------------------------------------------------------------------------- */

export interface AdminInstructorNote {
  id:           string;
  note:         string;
  updated_at:   string;
  instructor:   { first_name: string; last_name: string } | null;
}

/** All instructor notes for a dancer, newest first. Admin-only — reads all instructors' notes. */
export async function getInstructorNotesForDancer(
  dancerId: string,
): Promise<AdminInstructorNote[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("instructor_student_notes")
    .select("id, note, updated_at, users!instructor_student_notes_instructor_id_fkey(first_name, last_name)")
    .eq("dancer_id", dancerId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getInstructorNotesForDancer:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const u = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id:         row.id,
      note:       row.note,
      updated_at: row.updated_at,
      instructor: u ? { first_name: u.first_name, last_name: u.last_name } : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Attendance (admin read)                                                     */
/* -------------------------------------------------------------------------- */

export interface AdminAttendanceDate {
  dateId:        string;
  date:          string;        // "YYYY-MM-DD"
  markedCount:   number;
  enrolledCount: number;
  records: {
    dancerName:   string;
    status:       string;
    note:         string | null;
    markedBy:     string;       // "First Last" of instructor
  }[];
}

export interface AdminSessionAttendance {
  sessionId:  string;
  dayOfWeek:  string;
  startTime:  string | null;
  endTime:    string | null;
  dates:      AdminAttendanceDate[];
}

/**
 * Attendance records for all sessions of a class, grouped by occurrence date.
 * Fetches in two passes: (1) sessions + occurrence dates, (2) attendance records
 * with instructor names joined. Suitable for admin view only.
 */
export async function getAdminClassAttendance(
  classId: string,
): Promise<AdminSessionAttendance[]> {
  const supabase = createClient();

  // 1. Get sessions with their occurrence dates and enrolled dancers
  const { data: sessions, error: sessErr } = await supabase
    .from("class_meetings")
    .select(`
      id, day_of_week, start_time, end_time,
      meeting_occurrence_dates ( id, date, is_cancelled ),
      registrations ( id, status, dancers ( first_name, last_name ) )
    `)
    .eq("class_id",   classId)
    .eq("is_active",  true)
    .is("cancelled_at", null);

  if (sessErr || !sessions) {
    console.error("getAdminClassAttendance sessions:", sessErr?.message);
    return [];
  }

  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return [];

  // 2. Fetch all attendance records for these sessions, with instructor names
  const { data: attendanceRows, error: attErr } = await supabase
    .from("attendance")
    .select(`
      id, meeting_id, occurrence_date_id, dancer_id, status, note,
      dancers ( first_name, last_name ),
      users!attendance_marked_by_fkey ( first_name, last_name )
    `)
    .in("meeting_id", sessionIds);

  if (attErr) console.error("getAdminClassAttendance attendance:", attErr.message);

  // Group attendance by (meeting_id, occurrence_date_id)
  type AttRow = { meeting_id: string; occurrence_date_id: string | null; dancer_id: string; status: string; note: string | null; dancers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null; users: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null };
  const attBySessionDate = new Map<string, AttRow[]>();
  for (const row of (attendanceRows ?? []) as AttRow[]) {
    const key = `${row.meeting_id}::${row.occurrence_date_id ?? ""}`;
    if (!attBySessionDate.has(key)) attBySessionDate.set(key, []);
    attBySessionDate.get(key)!.push(row);
  }

  return sessions.map((s) => {
    const occurrences = (Array.isArray(s.meeting_occurrence_dates) ? s.meeting_occurrence_dates : [])
      .filter((d) => !d.is_cancelled)
      .sort((a, b) => b.date.localeCompare(a.date));

    const enrolledCount = (Array.isArray(s.registrations) ? s.registrations : [])
      .filter((r) => r.status !== "cancelled").length;

    const dates: AdminAttendanceDate[] = occurrences.map((occ) => {
      const key     = `${s.id}::${occ.id}`;
      const records = attBySessionDate.get(key) ?? [];

      return {
        dateId:        occ.id,
        date:          occ.date,
        markedCount:   records.length,
        enrolledCount,
        records: records.map((r) => {
          const d = Array.isArray(r.dancers) ? r.dancers[0] : r.dancers;
          const u = Array.isArray(r.users)   ? r.users[0]   : r.users;
          return {
            dancerName: d ? `${d.first_name} ${d.last_name}` : "Unknown",
            status:     r.status,
            note:       r.note,
            markedBy:   u ? `${u.first_name} ${u.last_name}` : "Unknown",
          };
        }),
      };
    });

    return {
      sessionId: s.id,
      dayOfWeek: s.day_of_week,
      startTime: s.start_time,
      endTime:   s.end_time,
      dates,
    };
  });
}

export async function getDiscounts(): Promise<HydratedDiscount[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("discounts")
    .select(
      `
      *,
      discount_rules (*),
      discount_rule_meetings ( meeting_id )
        `,
    )

    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load discounts.", error.message);
  }
  return data ?? [];
}
