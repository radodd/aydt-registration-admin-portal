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
  // Per-dancer attendance for THIS session/term:
  //   pct = (present + tardy + excused) / total marked rows × 100
  // Null if no attendance has been recorded yet for this dancer.
  termAttendancePct: number | null;
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

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export interface DashboardSession {
  sessionId:  string;
  className:  string;
  discipline: string;
  dayOfWeek:  string;
  startTime:  string | null;
  endTime:    string | null;
  location:   string | null;
  isLead:     boolean;
  dates:      string[]; // YYYY-MM-DD occurrence dates from today through Sunday, sorted asc
}

/** Sessions with occurrence dates falling between today and end-of-week (Sunday). */
export async function getDashboardSessions(userId: string): Promise<DashboardSession[]> {
  const supabase = createClient();

  const now    = new Date();
  const today  = now.toISOString().slice(0, 10);
  const dow    = now.getDay(); // 0 = Sun
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + (dow === 0 ? 0 : 7 - dow));
  const endOfWeek = sunday.toISOString().slice(0, 10);

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
        classes ( name, discipline ),
        session_occurrence_dates ( date, is_cancelled )
      )
    `)
    .eq("user_id", userId);

  if (error) {
    console.error("getDashboardSessions:", error.message);
    return [];
  }

  type RawCS = {
    id: string; day_of_week: string; start_time: string | null; end_time: string | null;
    location: string | null; is_active: boolean; cancelled_at: string | null;
    classes: { name: string; discipline: string } | { name: string; discipline: string }[] | null;
    session_occurrence_dates: { date: string; is_cancelled: boolean }[];
  };

  function extractCS(raw: unknown): RawCS | null {
    if (!raw) return null;
    return (Array.isArray(raw) ? raw[0] : raw) as RawCS ?? null;
  }

  return (data ?? [])
    .filter((row) => {
      const cs = extractCS(row.class_sessions);
      return cs && cs.is_active && cs.cancelled_at === null;
    })
    .map((row) => {
      const cs  = extractCS(row.class_sessions)!;
      const cls = Array.isArray(cs.classes) ? cs.classes[0] : cs.classes;
      const occ = Array.isArray(cs.session_occurrence_dates) ? cs.session_occurrence_dates : [];

      const dates = occ
        .filter((d) => !d.is_cancelled && d.date >= today && d.date <= endOfWeek)
        .map((d) => d.date)
        .sort();

      return {
        sessionId:  cs.id,
        className:  cls?.name       ?? "Unnamed Class",
        discipline: cls?.discipline ?? "",
        dayOfWeek:  cs.day_of_week,
        startTime:  cs.start_time,
        endTime:    cs.end_time,
        location:   cs.location,
        isLead:     row.is_lead,
        dates,
      };
    })
    .filter((s) => s.dates.length > 0)
    .sort((a, b) => {
      const da = a.dates[0] ?? "";
      const db = b.dates[0] ?? "";
      if (da !== db) return da.localeCompare(db);
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
}

/** Enrolled dancers + parent contact info for a session roster. */
export async function getSessionRoster(sessionId: string): Promise<RosterEntry[]> {
  const supabase = createClient();

  // Resolve the schedule this session occurrence belongs to. Roster lives at
  // the schedule level — one enrollment per (dancer, schedule) — so every
  // weekly date for the same schedule shares the same roster.
  const { data: session, error: sessionErr } = await supabase
    .from("class_sessions")
    .select("schedule_id")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session?.schedule_id) {
    if (sessionErr) console.error("getSessionRoster:", sessionErr.message);
    return [];
  }

  const { data, error } = await supabase
    .from("schedule_enrollments")
    .select(`
      id,
      dancers (
        id,
        first_name,
        last_name,
        birth_date,
        grade,
        email,
        phone_number,
        users (
          id,
          first_name,
          last_name,
          email,
          phone_number
        )
      )
    `)
    .eq("schedule_id", session.schedule_id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getSessionRoster:", error.message);
    return [];
  }

  // Pull attendance for this session and aggregate per-dancer term percent.
  const { data: attRows } = await supabase
    .from("attendance")
    .select("dancer_id, status")
    .eq("session_id", sessionId);

  const attByDancer = new Map<string, { good: number; total: number }>();
  for (const a of attRows ?? []) {
    const did = a.dancer_id as string;
    const cur = attByDancer.get(did) ?? { good: 0, total: 0 };
    cur.total += 1;
    if (a.status === "present" || a.status === "tardy" || a.status === "excused") {
      cur.good += 1;
    }
    attByDancer.set(did, cur);
  }

  return (data ?? []).map((row) => {
    const dancer = Array.isArray(row.dancers) ? row.dancers[0] : row.dancers;
    const parent = dancer && (Array.isArray(dancer.users) ? dancer.users[0] : dancer.users);
    const dancerId = dancer?.id ?? "";
    const counts = attByDancer.get(dancerId);
    const termAttendancePct = counts && counts.total > 0
      ? Math.round((counts.good / counts.total) * 100)
      : null;
    return {
      registrationId: row.id,
      dancer: {
        id:        dancerId,
        firstName: dancer?.first_name   ?? "Unknown",
        lastName:  dancer?.last_name    ?? "",
        birthDate: dancer?.birth_date   ?? null,
        grade:     dancer?.grade        ?? null,
        email:     dancer?.email        ?? null,
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
      termAttendancePct,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Dancer profile (full-page detail view)                                      */
/* -------------------------------------------------------------------------- */

export type AttendanceStatusValue = "present" | "absent" | "tardy" | "excused";

export interface DancerContact {
  id:           string;
  source:       "primary_parent" | "family_contact";
  type:         "primary_parent" | "alternate_parent" | "emergency_contact" | "caregiver";
  firstName:    string;
  lastName:     string;
  relationship: string | null;
  email:        string | null;
  phone:        string | null;
}

export interface AttendanceEntry {
  id:           string;
  date:         string; // YYYY-MM-DD
  status:       AttendanceStatusValue;
  note:         string | null;
}

export interface DancerNote {
  id:           string;
  note:         string;
  tag:          "progress" | "behavior" | "goal" | "general" | null;
  createdAt:    string;
  authorId:     string;
  authorFirstName: string;
  authorLastName:  string;
  // For "all classes" scope — the schedule/class this note pertains to
  // (notes are per-dancer, not per-schedule, so this is informational only).
  className?:   string | null;
}

export interface DancerProfile {
  dancer: {
    id:        string;
    firstName: string;
    lastName:  string;
    birthDate: string | null;
    grade:     string | null;
    email:     string | null;
    phone:     string | null;
    enrolledSince: string | null;  // ISO date — first schedule_enrollment.created_at
  };
  family: {
    id:        string;
    name:      string;
  } | null;
  contacts:  DancerContact[];
  thisClass: {
    sessionId:   string;
    scheduleId:  string;
    className:   string;
    discipline:  string;
    division:    string;
    semesterName: string;
    dayOfWeek:   string;
    startTime:   string | null;
    endTime:     string | null;
    location:    string | null;
    occurrenceCount: number;
    attendance:  AttendanceEntry[];
    notes:       DancerNote[];
  };
}

/**
 * Pull every piece of data shown on the dancer detail page for the
 * "This class" scope.
 */
export async function getDancerProfile(
  dancerId:  string,
  sessionId: string,
): Promise<DancerProfile | null> {
  const supabase = createClient();

  // 1. Dancer + family
  const { data: dancer, error: dErr } = await supabase
    .from("dancers")
    .select(`
      id, first_name, last_name, birth_date, grade, email, phone_number, family_id,
      families ( id, family_name )
    `)
    .eq("id", dancerId)
    .single();

  if (dErr || !dancer) {
    console.error("getDancerProfile dancer:", dErr?.message);
    return null;
  }

  const family = Array.isArray(dancer.families) ? dancer.families[0] : dancer.families;

  // 2. Session + class + semester
  const { data: session, error: sErr } = await supabase
    .from("class_sessions")
    .select(`
      id, schedule_id, day_of_week, start_time, end_time, location,
      classes ( name, discipline, division ),
      semesters:semester_id ( name )
    `)
    .eq("id", sessionId)
    .single();

  if (sErr || !session) {
    console.error("getDancerProfile session:", sErr?.message);
    return null;
  }

  const cls = Array.isArray(session.classes) ? session.classes[0] : session.classes;
  const sem = Array.isArray(session.semesters) ? session.semesters[0] : session.semesters;

  // 3. Contacts — primary parent (from users) + family_contacts rows
  const contacts: DancerContact[] = [];

  if (family?.id) {
    const { data: primaryParents } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, phone_number, is_primary_parent")
      .eq("family_id",         family.id)
      .eq("is_primary_parent", true);

    for (const p of primaryParents ?? []) {
      contacts.push({
        id:           p.id as string,
        source:       "primary_parent",
        type:         "primary_parent",
        firstName:    (p.first_name as string) ?? "",
        lastName:     (p.last_name  as string) ?? "",
        relationship: "Parent",
        email:        (p.email as string) ?? null,
        phone:        (p.phone_number as string) ?? null,
      });
    }

    const { data: fcRows } = await supabase
      .from("family_contacts")
      .select("id, type, first_name, last_name, phone, email, relationship")
      .eq("family_id", family.id);

    for (const fc of fcRows ?? []) {
      contacts.push({
        id:           fc.id as string,
        source:       "family_contact",
        type:         fc.type as DancerContact["type"],
        firstName:    (fc.first_name as string) ?? "",
        lastName:     (fc.last_name  as string) ?? "",
        relationship: (fc.relationship as string) ?? null,
        email:        (fc.email as string) ?? null,
        phone:        (fc.phone as string) ?? null,
      });
    }
  }

  // 4. Occurrence count for "9 of 16" subtitle
  const { count: occurrenceCount } = await supabase
    .from("session_occurrence_dates")
    .select("id", { count: "exact", head: true })
    .eq("session_id",   sessionId)
    .eq("is_cancelled", false);

  // 5. Attendance for this dancer on this class — joined with the date
  const { data: attRows } = await supabase
    .from("attendance")
    .select(`
      id, status, note,
      session_occurrence_dates:occurrence_date_id ( date )
    `)
    .eq("session_id", sessionId)
    .eq("dancer_id",  dancerId);

  const attendance: AttendanceEntry[] = (attRows ?? [])
    .map((r) => {
      const occ = Array.isArray(r.session_occurrence_dates)
        ? r.session_occurrence_dates[0]
        : r.session_occurrence_dates;
      return {
        id:     r.id as string,
        date:   (occ?.date as string) ?? "",
        status: r.status as AttendanceStatusValue,
        note:   (r.note as string) ?? null,
      };
    })
    .filter((r) => r.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  // 6. Enrolled since — earliest schedule_enrollment for this dancer
  const { data: firstEnrollment } = await supabase
    .from("schedule_enrollments")
    .select("created_at")
    .eq("dancer_id", dancerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // 7. Notes for this dancer (any instructor) — newest first
  const { data: noteRows } = await supabase
    .from("instructor_student_notes")
    .select(`
      id, note, tag, created_at, instructor_id,
      users:instructor_id ( first_name, last_name )
    `)
    .eq("dancer_id", dancerId)
    .order("created_at", { ascending: false });

  const notes: DancerNote[] = (noteRows ?? []).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id:              r.id as string,
      note:            r.note as string,
      tag:             (r.tag as DancerNote["tag"]) ?? null,
      createdAt:       r.created_at as string,
      authorId:        r.instructor_id as string,
      authorFirstName: (u?.first_name as string) ?? "",
      authorLastName:  (u?.last_name  as string) ?? "",
    };
  });

  return {
    dancer: {
      id:        dancer.id as string,
      firstName: (dancer.first_name as string) ?? "",
      lastName:  (dancer.last_name  as string) ?? "",
      birthDate: (dancer.birth_date as string) ?? null,
      grade:     (dancer.grade as string) ?? null,
      email:     (dancer.email as string) ?? null,
      phone:     (dancer.phone_number as string) ?? null,
      enrolledSince: (firstEnrollment?.created_at as string) ?? null,
    },
    family: family
      ? {
          id:   family.id as string,
          name: (family.family_name as string) ?? "",
        }
      : null,
    contacts,
    thisClass: {
      sessionId:   session.id as string,
      scheduleId:  session.schedule_id as string,
      className:   (cls?.name as string) ?? "Unnamed Class",
      discipline:  (cls?.discipline as string) ?? "",
      division:    (cls?.division as string) ?? "",
      semesterName: (sem?.name as string) ?? "",
      dayOfWeek:   session.day_of_week as string,
      startTime:   (session.start_time as string) ?? null,
      endTime:     (session.end_time as string) ?? null,
      location:    (session.location as string) ?? null,
      occurrenceCount: occurrenceCount ?? 0,
      attendance,
      notes,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* "All my classes" scope — every class the current instructor teaches that    */
/* this dancer is or was enrolled in.                                          */
/* -------------------------------------------------------------------------- */

export interface MyClassWithDancer {
  sessionId:    string;
  scheduleId:   string;
  className:    string;
  semesterName: string;
  dayOfWeek:    string;
  isCurrent:    boolean;
  attendance: {
    present: number;
    absent:  number;
    tardy:   number;
    excused: number;
    total:   number; // total occurrence dates (not just marked)
  };
}

/**
 * Returns every (schedule, class) the current instructor teaches that this
 * dancer is or was enrolled in, with per-class attendance counts.
 *
 * Multi-step because Supabase doesn't easily express the
 * (instructor → sessions → schedules ∩ dancer → enrollments → schedules) join.
 */
export async function getAllMyClassesForDancer(
  dancerId:    string,
  instructorId: string,
): Promise<MyClassWithDancer[]> {
  const supabase = createClient();

  // 1. All sessions assigned to this instructor.
  const { data: assignments } = await supabase
    .from("class_session_instructors")
    .select(`
      class_sessions:session_id (
        id, schedule_id, day_of_week,
        classes ( name ),
        semesters:semester_id ( name, status )
      )
    `)
    .eq("user_id", instructorId);

  const myScheduleToSession = new Map<string, {
    sessionId:    string;
    className:    string;
    semesterName: string;
    semesterStatus: string;
    dayOfWeek:    string;
  }>();

  for (const a of assignments ?? []) {
    const cs = Array.isArray(a.class_sessions) ? a.class_sessions[0] : a.class_sessions;
    if (!cs) continue;
    const cls = Array.isArray(cs.classes) ? cs.classes[0] : cs.classes;
    const sem = Array.isArray(cs.semesters) ? cs.semesters[0] : cs.semesters;
    if (!cs.schedule_id) continue;
    myScheduleToSession.set(cs.schedule_id as string, {
      sessionId:    cs.id as string,
      className:    (cls?.name as string) ?? "Unnamed",
      semesterName: (sem?.name as string) ?? "",
      semesterStatus: (sem?.status as string) ?? "",
      dayOfWeek:    cs.day_of_week as string,
    });
  }

  if (myScheduleToSession.size === 0) return [];

  // 2. Dancer enrollments restricted to schedules I teach.
  const { data: enrollments } = await supabase
    .from("schedule_enrollments")
    .select("schedule_id")
    .eq("dancer_id", dancerId)
    .neq("status",   "cancelled")
    .in("schedule_id", [...myScheduleToSession.keys()]);

  const enrolledScheduleIds = new Set(
    (enrollments ?? []).map((e) => e.schedule_id as string),
  );

  if (enrolledScheduleIds.size === 0) return [];

  // 3. Attendance for this dancer across the matching sessions.
  const sessionIds = [...enrolledScheduleIds]
    .map((schedId) => myScheduleToSession.get(schedId)!.sessionId);

  const { data: attRows } = await supabase
    .from("attendance")
    .select("session_id, status")
    .eq("dancer_id", dancerId)
    .in("session_id", sessionIds);

  const attBySession = new Map<string, { present: number; absent: number; tardy: number; excused: number }>();
  for (const r of attRows ?? []) {
    const sid = r.session_id as string;
    const cur = attBySession.get(sid) ?? { present: 0, absent: 0, tardy: 0, excused: 0 };
    const status = r.status as AttendanceStatusValue;
    cur[status] += 1;
    attBySession.set(sid, cur);
  }

  // 4. Total occurrences per session (for denominator on the card).
  const { data: occRows } = await supabase
    .from("session_occurrence_dates")
    .select("session_id")
    .in("session_id", sessionIds)
    .eq("is_cancelled", false);

  const totalBySession = new Map<string, number>();
  for (const r of occRows ?? []) {
    const sid = r.session_id as string;
    totalBySession.set(sid, (totalBySession.get(sid) ?? 0) + 1);
  }

  return [...enrolledScheduleIds].map((schedId) => {
    const meta = myScheduleToSession.get(schedId)!;
    const counts = attBySession.get(meta.sessionId) ?? { present: 0, absent: 0, tardy: 0, excused: 0 };
    return {
      sessionId:    meta.sessionId,
      scheduleId:   schedId,
      className:    meta.className,
      semesterName: meta.semesterName,
      dayOfWeek:    meta.dayOfWeek,
      isCurrent:    meta.semesterStatus === "published" || meta.semesterStatus === "scheduled",
      attendance: {
        ...counts,
        total: totalBySession.get(meta.sessionId) ?? 0,
      },
    };
  });
}

/* -------------------------------------------------------------------------- */
/* All notes for a dancer across every class                                   */
/* -------------------------------------------------------------------------- */

/**
 * Notes for a dancer with class-name context attached when possible (notes
 * themselves aren't tied to a class — we fall back to the most recent class
 * the author taught the dancer in for display).
 */
export async function getAllNotesForDancer(
  dancerId: string,
): Promise<DancerNote[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("instructor_student_notes")
    .select(`
      id, note, tag, created_at, instructor_id,
      users:instructor_id ( first_name, last_name )
    `)
    .eq("dancer_id", dancerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAllNotesForDancer:", error.message);
    return [];
  }

  return (data ?? []).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id:              r.id as string,
      note:            r.note as string,
      tag:             (r.tag as DancerNote["tag"]) ?? null,
      createdAt:       r.created_at as string,
      authorId:        r.instructor_id as string,
      authorFirstName: (u?.first_name as string) ?? "",
      authorLastName:  (u?.last_name  as string) ?? "",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Class groups — same class name + day + start_time grouped across semesters  */
/* -------------------------------------------------------------------------- */

/**
 * Encode the natural class key (name | day | start_time) into a URL-safe
 * string. We use this as the segment for /instructor/classes/series/[classKey]
 * because classes have a different `id` per semester.
 */
export function encodeClassKey(
  name: string,
  day: string,
  startTime: string | null,
): string {
  return encodeURIComponent(`${name}|${day}|${startTime ?? ""}`);
}

export function decodeClassKey(
  key: string,
): { name: string; day: string; startTime: string | null } {
  const decoded = decodeURIComponent(key);
  const [name, day, startTime] = decoded.split("|");
  return {
    name:      name ?? "",
    day:       day  ?? "",
    startTime: startTime ? startTime : null,
  };
}

export interface MyClassGroup {
  classKey:       string;
  className:      string;
  discipline:     string;
  division:       string;
  dayOfWeek:      string;
  startTime:      string | null;
  endTime:        string | null;
  location:       string | null;
  isLead:         boolean;        // true if I lead any series
  seriesCount:    number;
  currentSeriesName: string | null;   // semester name of the published instance, if any
}

/**
 * Returns one row per distinct (class name, day_of_week, start_time) the
 * current instructor teaches — across every semester.
 */
export async function getMyClassGroups(userId: string): Promise<MyClassGroup[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_session_instructors")
    .select(`
      is_lead,
      class_sessions:session_id (
        id,
        day_of_week,
        start_time,
        end_time,
        location,
        classes ( name, discipline, division ),
        semesters:semester_id ( name, status )
      )
    `)
    .eq("user_id", userId);

  if (error) {
    console.error("getMyClassGroups:", error.message);
    return [];
  }

  // Group rows by classKey
  const groups = new Map<string, {
    name: string; discipline: string; division: string;
    dayOfWeek: string; startTime: string | null; endTime: string | null;
    location: string | null;
    isLead: boolean;
    seriesCount: number;
    currentSeriesName: string | null;
  }>();

  for (const row of data ?? []) {
    const cs  = Array.isArray(row.class_sessions) ? row.class_sessions[0] : row.class_sessions;
    if (!cs) continue;
    const cls = Array.isArray(cs.classes) ? cs.classes[0] : cs.classes;
    const sem = Array.isArray(cs.semesters) ? cs.semesters[0] : cs.semesters;
    const className = (cls?.name as string) ?? "Unnamed";
    const day       = cs.day_of_week as string;
    const startTime = (cs.start_time as string) ?? null;
    const key       = encodeClassKey(className, day, startTime);

    const existing = groups.get(key) ?? {
      name:        className,
      discipline:  (cls?.discipline as string) ?? "",
      division:    (cls?.division as string) ?? "",
      dayOfWeek:   day,
      startTime,
      endTime:     (cs.end_time as string) ?? null,
      location:    (cs.location as string) ?? null,
      isLead:      false,
      seriesCount: 0,
      currentSeriesName: null,
    };
    existing.seriesCount += 1;
    if (row.is_lead) existing.isLead = true;
    if (sem?.status === "published" && !existing.currentSeriesName) {
      existing.currentSeriesName = (sem.name as string) ?? null;
    }
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([classKey, g]) => ({
      classKey,
      className: g.name,
      discipline: g.discipline,
      division: g.division,
      dayOfWeek: g.dayOfWeek,
      startTime: g.startTime,
      endTime: g.endTime,
      location: g.location,
      isLead: g.isLead,
      seriesCount: g.seriesCount,
      currentSeriesName: g.currentSeriesName,
    }))
    .sort((a, b) => a.className.localeCompare(b.className));
}

/* -------------------------------------------------------------------------- */
/* Class series page — every semester run of one class for one instructor      */
/* -------------------------------------------------------------------------- */

export type SeriesStatus = "current" | "upcoming" | "past";

export type OccurrenceState = "done" | "today" | "unmarked" | "future" | "cancelled";

export interface ClassSeries {
  sessionId:      string;
  scheduleId:     string;
  semesterId:     string;
  semesterName:   string;
  status:         SeriesStatus;
  isLead:         boolean;
  startDate:      string | null;
  endDate:        string | null;
  studentCount:   number;
  attendancePct:  number | null;
  occurrences: {
    id:          string;
    date:        string;
    isCancelled: boolean;
    state:       OccurrenceState;
  }[];
  occurrenceStats: {
    done:     number;
    unmarked: number;
    future:   number;
    cancelled: number;
    total:    number;
  };
}

export interface ClassSeriesPage {
  classKey:    string;
  className:   string;
  discipline:  string;
  division:    string;
  dayOfWeek:   string;
  startTime:   string | null;
  endTime:     string | null;
  location:    string | null;
  isLead:      boolean;
  series:      ClassSeries[];
  totals: {
    seriesCount:     number;
    currentStudents: number;
    avgAttendancePct: number | null;
    totalTaught:     number;  // past + cancelled-excluded occurrence count
  };
}

function semesterStatusToSeriesStatus(s: string): SeriesStatus {
  if (s === "scheduled") return "upcoming";
  if (s === "archived")  return "past";
  return "current"; // published / draft falls into "current" (drafts shouldn't appear)
}

/**
 * Returns every semester run of the given class (matched by name + day +
 * start_time) that this instructor teaches, with attendance stats and per-
 * occurrence state for the mini calendar.
 */
export async function getClassSeriesByKey(
  classKey: string,
  userId:   string,
): Promise<ClassSeriesPage | null> {
  const supabase = createClient();
  const { name, day, startTime } = decodeClassKey(classKey);
  const todayIso = new Date().toISOString().slice(0, 10);

  // 1. Pull every assignment for this instructor matching the class key.
  const { data: rows, error } = await supabase
    .from("class_session_instructors")
    .select(`
      is_lead,
      class_sessions:session_id (
        id, schedule_id, semester_id,
        day_of_week, start_time, end_time, location, start_date, end_date,
        classes ( name, discipline, division ),
        semesters:semester_id ( name, status ),
        session_occurrence_dates ( id, date, is_cancelled )
      )
    `)
    .eq("user_id", userId);

  if (error) {
    console.error("getClassSeriesByKey:", error.message);
    return null;
  }

  // Filter rows in memory by class key (name + day + startTime).
  const matching = (rows ?? []).filter((row) => {
    const cs = Array.isArray(row.class_sessions) ? row.class_sessions[0] : row.class_sessions;
    if (!cs) return false;
    const cls = Array.isArray(cs.classes) ? cs.classes[0] : cs.classes;
    if ((cls?.name as string) !== name) return false;
    if ((cs.day_of_week as string) !== day) return false;
    const st = (cs.start_time as string) ?? null;
    return st === startTime;
  });

  if (matching.length === 0) return null;

  // 2. Pull enrollments + attendance counts in batch for every session.
  const sessionIds  = matching.map((r) => {
    const cs = Array.isArray(r.class_sessions) ? r.class_sessions[0] : r.class_sessions;
    return (cs?.id as string) ?? "";
  }).filter(Boolean);

  const scheduleIds = matching.map((r) => {
    const cs = Array.isArray(r.class_sessions) ? r.class_sessions[0] : r.class_sessions;
    return (cs?.schedule_id as string) ?? "";
  }).filter(Boolean);

  const { data: enrollmentRows } = await supabase
    .from("schedule_enrollments")
    .select("schedule_id, status")
    .in("schedule_id", scheduleIds)
    .neq("status", "cancelled");

  const studentsBySchedule = new Map<string, number>();
  for (const e of enrollmentRows ?? []) {
    const sid = e.schedule_id as string;
    studentsBySchedule.set(sid, (studentsBySchedule.get(sid) ?? 0) + 1);
  }

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("session_id, occurrence_date_id, status")
    .in("session_id", sessionIds);

  // For "Done" state on the calendar — set of (sessionId|occurrenceDateId)
  const markedOccurrences = new Set<string>();
  // For attendance percent — counts per session
  const attCountsBySession = new Map<string, { good: number; total: number }>();
  for (const a of attendanceRows ?? []) {
    const sid    = a.session_id as string;
    const occId  = a.occurrence_date_id as string | null;
    if (occId) markedOccurrences.add(`${sid}|${occId}`);
    const counts = attCountsBySession.get(sid) ?? { good: 0, total: 0 };
    counts.total += 1;
    if (a.status === "present" || a.status === "tardy" || a.status === "excused") {
      counts.good += 1;
    }
    attCountsBySession.set(sid, counts);
  }

  // 3. Build series objects.
  const isLeadAny = matching.some((r) => r.is_lead === true);
  const firstCs = (() => {
    const cs = Array.isArray(matching[0]!.class_sessions) ? matching[0]!.class_sessions[0] : matching[0]!.class_sessions;
    return cs as NonNullable<typeof cs>;
  })();
  const firstCls = Array.isArray(firstCs.classes) ? firstCs.classes[0] : firstCs.classes;

  const series: ClassSeries[] = matching.map((row) => {
    const cs = Array.isArray(row.class_sessions) ? row.class_sessions[0] : row.class_sessions!;
    const sem = Array.isArray(cs.semesters) ? cs.semesters[0] : cs.semesters;
    const occRaw = (cs.session_occurrence_dates ?? []) as Array<{
      id: string; date: string; is_cancelled: boolean;
    }>;
    const sessionId = cs.id as string;

    const occurrences = occRaw
      .map((o) => {
        let state: OccurrenceState;
        if (o.is_cancelled) {
          state = "cancelled";
        } else if (o.date > todayIso) {
          state = "future";
        } else if (o.date === todayIso) {
          state = "today";
        } else if (markedOccurrences.has(`${sessionId}|${o.id}`)) {
          state = "done";
        } else {
          state = "unmarked";
        }
        return {
          id:          o.id,
          date:        o.date,
          isCancelled: o.is_cancelled,
          state,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const stats = occurrences.reduce(
      (acc, o) => {
        if (o.state === "cancelled") acc.cancelled += 1;
        else if (o.state === "future") acc.future += 1;
        else if (o.state === "unmarked") acc.unmarked += 1;
        else acc.done += 1; // done | today
        acc.total += 1;
        return acc;
      },
      { done: 0, unmarked: 0, future: 0, cancelled: 0, total: 0 },
    );

    const counts = attCountsBySession.get(sessionId);
    const attendancePct = counts && counts.total > 0
      ? Math.round((counts.good / counts.total) * 100)
      : null;

    return {
      sessionId,
      scheduleId:    cs.schedule_id as string,
      semesterId:    cs.semester_id as string,
      semesterName:  (sem?.name as string) ?? "",
      status:        semesterStatusToSeriesStatus((sem?.status as string) ?? "published"),
      isLead:        row.is_lead as boolean,
      startDate:     (cs.start_date as string) ?? null,
      endDate:       (cs.end_date as string) ?? null,
      studentCount:  studentsBySchedule.get(cs.schedule_id as string) ?? 0,
      attendancePct,
      occurrences,
      occurrenceStats: stats,
    };
  });

  // 4. Sort: current first, then upcoming (asc start), then past (desc end).
  const ORDER: Record<SeriesStatus, number> = { current: 0, upcoming: 1, past: 2 };
  series.sort((a, b) => {
    if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
    if (a.status === "upcoming") {
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    }
    if (a.status === "past") {
      return (b.endDate ?? "").localeCompare(a.endDate ?? "");
    }
    return 0;
  });

  // 5. Aggregated stats.
  const currentSeries = series.find((s) => s.status === "current");
  const currentStudents = currentSeries?.studentCount ?? 0;

  const pcts = series.map((s) => s.attendancePct).filter((p): p is number => p !== null);
  const avgAttendancePct = pcts.length > 0
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : null;

  const totalTaught = series.reduce(
    (acc, s) => acc + s.occurrenceStats.done + s.occurrenceStats.unmarked,
    0,
  );

  return {
    classKey,
    className:  (firstCls?.name as string) ?? "",
    discipline: (firstCls?.discipline as string) ?? "",
    division:   (firstCls?.division as string) ?? "",
    dayOfWeek:  firstCs.day_of_week as string,
    startTime:  (firstCs.start_time as string) ?? null,
    endTime:    (firstCs.end_time as string) ?? null,
    location:   (firstCs.location as string) ?? null,
    isLead:     isLeadAny,
    series,
    totals: {
      seriesCount:      series.length,
      currentStudents,
      avgAttendancePct,
      totalTaught,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Profile — "This Season" summary stats                                       */
/* -------------------------------------------------------------------------- */

export interface ThisSeasonStats {
  classCount:          number;
  studentCount:        number;
  attendanceLoggedPct: number | null;  // % of past occurrences with ≥1 attendance row
  nextClass: {
    sessionId:  string;
    classKey:   string;
    className:  string;
    date:       string;          // YYYY-MM-DD
    startTime:  string | null;
    isToday:    boolean;
  } | null;
}

/**
 * Stats for the "This Season" card on the instructor profile.
 *  - classCount:          # schedules I teach in semesters where status = 'published'
 *  - studentCount:        distinct enrolled dancers across those schedules
 *  - attendanceLoggedPct: ratio of past, non-cancelled occurrence dates that
 *                         have at least one attendance row (any dancer)
 *  - nextClass:           the next upcoming (or today) occurrence I'm assigned to
 */
export async function getInstructorThisSeasonStats(
  userId: string,
): Promise<ThisSeasonStats> {
  const supabase = createClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  // 1. Sessions I'm assigned to, with class + semester + occurrences.
  const { data: assignments } = await supabase
    .from("class_session_instructors")
    .select(`
      class_sessions:session_id (
        id, schedule_id, day_of_week, start_time,
        classes ( name ),
        semesters:semester_id ( status ),
        session_occurrence_dates ( id, date, is_cancelled )
      )
    `)
    .eq("user_id", userId);

  type Sess = {
    id:           string;
    scheduleId:   string;
    className:    string;
    startTime:    string | null;
    occurrences:  { id: string; date: string; isCancelled: boolean }[];
  };

  const currentSessions: Sess[] = [];
  const allOccurrences: { sessionId: string; occurrenceId: string; date: string }[] = [];

  for (const a of assignments ?? []) {
    const cs  = Array.isArray(a.class_sessions) ? a.class_sessions[0] : a.class_sessions;
    if (!cs) continue;
    const sem = Array.isArray(cs.semesters) ? cs.semesters[0] : cs.semesters;
    const cls = Array.isArray(cs.classes)   ? cs.classes[0]   : cs.classes;
    const occRaw = (cs.session_occurrence_dates ?? []) as Array<{
      id: string; date: string; is_cancelled: boolean;
    }>;

    if ((sem?.status as string) === "published") {
      currentSessions.push({
        id:          cs.id as string,
        scheduleId:  cs.schedule_id as string,
        className:   (cls?.name as string) ?? "Unnamed",
        startTime:   (cs.start_time as string) ?? null,
        occurrences: occRaw.map((o) => ({
          id: o.id, date: o.date, isCancelled: o.is_cancelled,
        })),
      });
    }

    for (const o of occRaw) {
      if (o.is_cancelled) continue;
      allOccurrences.push({
        sessionId:    cs.id as string,
        occurrenceId: o.id,
        date:         o.date,
      });
    }
  }

  const scheduleIds = [...new Set(currentSessions.map((s) => s.scheduleId))];
  const sessionIds  = currentSessions.map((s) => s.id);

  // 2. Distinct enrolled dancers across my current schedules.
  let studentCount = 0;
  if (scheduleIds.length > 0) {
    const { data: enrollmentRows } = await supabase
      .from("schedule_enrollments")
      .select("dancer_id")
      .in("schedule_id", scheduleIds)
      .neq("status", "cancelled");
    studentCount = new Set(
      (enrollmentRows ?? []).map((r) => r.dancer_id as string),
    ).size;
  }

  // 3. Attendance-logged percent — past occurrences that have any attendance row.
  let attendanceLoggedPct: number | null = null;
  const pastOccurrences = currentSessions.flatMap((s) =>
    s.occurrences
      .filter((o) => !o.isCancelled && o.date < todayIso)
      .map((o) => ({ sessionId: s.id, occurrenceId: o.id })),
  );
  if (pastOccurrences.length > 0 && sessionIds.length > 0) {
    const { data: attRows } = await supabase
      .from("attendance")
      .select("session_id, occurrence_date_id")
      .in("session_id", sessionIds);

    const marked = new Set(
      (attRows ?? []).map((r) => `${r.session_id}|${r.occurrence_date_id}`),
    );
    const loggedCount = pastOccurrences.filter((o) =>
      marked.has(`${o.sessionId}|${o.occurrenceId}`),
    ).length;
    attendanceLoggedPct = Math.round((loggedCount / pastOccurrences.length) * 100);
  }

  // 4. Next class — closest occurrence on or after today across all assignments.
  const upcoming = allOccurrences
    .filter((o) => o.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0] ?? null;
  let nextClass: ThisSeasonStats["nextClass"] = null;
  if (next) {
    const sess = currentSessions.find((s) => s.id === next.sessionId)
      ?? null;
    // The next occurrence might belong to a non-current semester; still want
    // to render it. Fall back to looking it up from the assignments list.
    const fallback = (assignments ?? []).find((a) => {
      const cs = Array.isArray(a.class_sessions) ? a.class_sessions[0] : a.class_sessions;
      return cs && (cs.id as string) === next.sessionId;
    });
    const fallbackCs = fallback
      ? (Array.isArray(fallback.class_sessions) ? fallback.class_sessions[0] : fallback.class_sessions)
      : null;
    const fallbackCls = fallbackCs
      ? (Array.isArray(fallbackCs.classes) ? fallbackCs.classes[0] : fallbackCs.classes)
      : null;

    const className = sess?.className ?? (fallbackCls?.name as string) ?? "Class";
    const day       = (fallbackCs?.day_of_week as string) ?? "";
    const startTime = sess?.startTime ?? (fallbackCs?.start_time as string) ?? null;

    nextClass = {
      sessionId: next.sessionId,
      classKey:  encodeClassKey(className, day, startTime),
      className,
      date:      next.date,
      startTime,
      isToday:   next.date === todayIso,
    };
  }

  return {
    classCount: currentSessions.length,
    studentCount,
    attendanceLoggedPct,
    nextClass,
  };
}
