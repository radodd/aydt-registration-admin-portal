import { createClient } from "@/utils/supabase/client";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDay(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function formatDiscipline(d: string): string {
  return d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const dob   = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  ) age--;
  return age;
}

/** Returns the nearest future (or today) occurrence date that isn't cancelled. */
function nextOccurrence(
  dates: { date: string; is_cancelled: boolean }[],
): string | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    dates
      .filter((d) => !d.is_cancelled && d.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null
  );
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface InstructorSession {
  sessionId:      string;
  classId:        string;
  className:      string;
  discipline:     string;
  division:       string;
  dayOfWeek:      string;
  startTime:      string | null;
  endTime:        string | null;
  location:       string | null;
  isActive:       boolean;
  isLead:         boolean;
  nextDate:       string | null; // "YYYY-MM-DD"
}

export interface AllClassSession {
  sessionId:    string;
  classId:      string;
  className:    string;
  discipline:   string;
  division:     string;
  dayOfWeek:    string;
  startTime:    string | null;
  endTime:      string | null;
  location:     string | null;
  isActive:     boolean;
  nextDate:     string | null;
  instructors:  { userId: string; firstName: string; lastName: string; isLead: boolean }[];
  isMySession:  boolean;
}

export interface SessionDetail {
  sessionId:    string;
  classId:      string;
  className:    string;
  discipline:   string;
  division:     string;
  dayOfWeek:    string;
  startTime:    string | null;
  endTime:      string | null;
  location:     string | null;
  isActive:     boolean;
  instructors:  { userId: string; firstName: string; lastName: string; isLead: boolean }[];
  occurrenceDates: { id: string; date: string; is_cancelled: boolean }[];
}

export interface RosterEntry {
  registrationId: string;
  dancer: {
    id:         string;
    firstName:  string;
    lastName:   string;
    birthDate:  string | null;
    grade:      string | null;
    email:      string | null;
    phone:      string | null;
  };
  parent: {
    id:         string;
    firstName:  string;
    lastName:   string;
    email:      string;
    phone:      string | null;
  } | null;
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Sessions assigned to the current instructor (My Classes view). */
export async function getMyInstructorSessions(
  userId: string,
): Promise<InstructorSession[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_session_instructors")
    .select(`
      is_lead,
      class_sessions (
        id,
        day_of_week,
        start_time,
        end_time,
        location,
        is_active,
        cancelled_at,
        class_id,
        classes (
          id,
          name,
          discipline,
          division
        ),
        session_occurrence_dates (
          date,
          is_cancelled
        )
      )
    `)
    .eq("user_id", userId);

  if (error) {
    console.error("getMyInstructorSessions:", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.class_sessions !== null)
    .map((row) => {
      const cs  = row.class_sessions as NonNullable<typeof row.class_sessions>;
      const cls = Array.isArray(cs.classes) ? cs.classes[0] : cs.classes;
      const occ = Array.isArray(cs.session_occurrence_dates)
        ? cs.session_occurrence_dates
        : [];
      return {
        sessionId:  cs.id,
        classId:    cs.class_id,
        className:  cls?.name  ?? "Unnamed Class",
        discipline: cls?.discipline ?? "",
        division:   cls?.division   ?? "",
        dayOfWeek:  cs.day_of_week,
        startTime:  cs.start_time,
        endTime:    cs.end_time,
        location:   cs.location,
        isActive:   cs.is_active && cs.cancelled_at === null,
        isLead:     row.is_lead,
        nextDate:   nextOccurrence(occ),
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className));
}

/** All active class sessions (All Classes browse view). */
export async function getAllClassSessions(
  myUserId: string,
): Promise<AllClassSession[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_sessions")
    .select(`
      id,
      class_id,
      day_of_week,
      start_time,
      end_time,
      location,
      is_active,
      cancelled_at,
      classes (
        id,
        name,
        discipline,
        division
      ),
      class_session_instructors (
        user_id,
        is_lead,
        users (
          first_name,
          last_name
        )
      ),
      session_occurrence_dates (
        date,
        is_cancelled
      )
    `)
    .eq("is_active", true)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAllClassSessions:", error.message);
    return [];
  }

  return (data ?? []).map((cs) => {
    const cls  = Array.isArray(cs.classes) ? cs.classes[0] : cs.classes;
    const csi  = Array.isArray(cs.class_session_instructors) ? cs.class_session_instructors : [];
    const occ  = Array.isArray(cs.session_occurrence_dates)  ? cs.session_occurrence_dates  : [];

    const instructors = csi.map((i) => {
      const u = Array.isArray(i.users) ? i.users[0] : i.users;
      return {
        userId:    i.user_id,
        firstName: u?.first_name ?? "",
        lastName:  u?.last_name  ?? "",
        isLead:    i.is_lead,
      };
    });

    return {
      sessionId:   cs.id,
      classId:     cs.class_id,
      className:   cls?.name       ?? "Unnamed Class",
      discipline:  cls?.discipline ?? "",
      division:    cls?.division   ?? "",
      dayOfWeek:   cs.day_of_week,
      startTime:   cs.start_time,
      endTime:     cs.end_time,
      location:    cs.location,
      isActive:    cs.is_active && cs.cancelled_at === null,
      nextDate:    nextOccurrence(occ),
      instructors,
      isMySession: csi.some((i) => i.user_id === myUserId),
    };
  }).sort((a, b) => a.className.localeCompare(b.className));
}

/** Full session detail for the session detail page. */
export async function getInstructorSessionDetail(
  sessionId: string,
): Promise<SessionDetail | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_sessions")
    .select(`
      id,
      class_id,
      day_of_week,
      start_time,
      end_time,
      location,
      is_active,
      cancelled_at,
      classes (
        id,
        name,
        discipline,
        division
      ),
      class_session_instructors (
        user_id,
        is_lead,
        users (
          first_name,
          last_name
        )
      ),
      session_occurrence_dates (
        id,
        date,
        is_cancelled
      )
    `)
    .eq("id", sessionId)
    .single();

  if (error || !data) {
    console.error("getInstructorSessionDetail:", error?.message);
    return null;
  }

  const cls = Array.isArray(data.classes) ? data.classes[0] : data.classes;
  const csi = Array.isArray(data.class_session_instructors) ? data.class_session_instructors : [];
  const occ = Array.isArray(data.session_occurrence_dates)  ? data.session_occurrence_dates  : [];

  return {
    sessionId:    data.id,
    classId:      data.class_id,
    className:    cls?.name       ?? "Unnamed Class",
    discipline:   cls?.discipline ?? "",
    division:     cls?.division   ?? "",
    dayOfWeek:    data.day_of_week,
    startTime:    data.start_time,
    endTime:      data.end_time,
    location:     data.location,
    isActive:     data.is_active && data.cancelled_at === null,
    instructors:  csi.map((i) => {
      const u = Array.isArray(i.users) ? i.users[0] : i.users;
      return { userId: i.user_id, firstName: u?.first_name ?? "", lastName: u?.last_name ?? "", isLead: i.is_lead };
    }),
    occurrenceDates: occ
      .map((d) => ({ id: d.id, date: d.date, is_cancelled: d.is_cancelled }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Fetch the current instructor's private note for a specific dancer (if any).
 * One note per (instructor, dancer) is the expected cardinality.
 */
export async function getStudentNote(
  dancerId:     string,
  instructorId: string,
): Promise<{ id: string; note: string; updated_at: string } | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("instructor_student_notes")
    .select("id, note, updated_at")
    .eq("dancer_id",     dancerId)
    .eq("instructor_id", instructorId)
    .limit(1)
    .maybeSingle();

  if (error) console.error("getStudentNote:", error.message);
  return data ?? null;
}

/**
 * All attendance records for a session across all occurrence dates.
 * Fetched once on component mount; the UI groups and filters by date.
 */
export async function getAttendanceForSession(
  sessionId: string,
): Promise<import("@/types").AttendanceRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("attendance")
    .select("id, session_id, occurrence_date_id, dancer_id, status, note, marked_by, created_at, updated_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) console.error("getAttendanceForSession:", error.message);
  return (data ?? []) as import("@/types").AttendanceRecord[];
}

/** Enrolled dancers + parent contact info for a session roster. */
export async function getSessionRoster(sessionId: string): Promise<RosterEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("registrations")
    .select(`
      id,
      dancers (
        id,
        first_name,
        last_name,
        birth_date,
        grade,
        email,
        phone_number
      ),
      users (
        id,
        first_name,
        last_name,
        email,
        phone_number
      )
    `)
    .eq("session_id", sessionId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getSessionRoster:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const dancer = Array.isArray(row.dancers) ? row.dancers[0] : row.dancers;
    const parent = Array.isArray(row.users)   ? row.users[0]   : row.users;
    return {
      registrationId: row.id,
      dancer: {
        id:        dancer?.id         ?? "",
        firstName: dancer?.first_name ?? "Unknown",
        lastName:  dancer?.last_name  ?? "",
        birthDate: dancer?.birth_date ?? null,
        grade:     dancer?.grade      ?? null,
        email:     dancer?.email      ?? null,
        phone:     dancer?.phone_number ?? null,
      },
      parent: parent
        ? {
            id:        parent.id,
            firstName: parent.first_name,
            lastName:  parent.last_name,
            email:     parent.email,
            phone:     parent.phone_number ?? null,
          }
        : null,
    };
  });
}
