import { Discount, HydratedDiscount, SemesterDiscount } from "@/types";
import { createClient } from "@/utils/supabase/client";

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

        registrations:registrations!dancer_id (
          id,
          status,
          class_sessions!session_id (
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
 * Phase 1: returns classes with nested class_sessions.
 * Optional semesterId restricts to a specific semester.
 */
export async function getClasses(semesterId?: string) {
  const supabase = createClient();

  let query = supabase
    .from("classes")
    .select("*, class_sessions(*)")
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
  dancerName: string;
  parentEmail: string | null;
  parentName: string | null;
  status: string;
  sessionLabel: string;
  enrollmentType: "per_session" | "full_schedule";
  createdAt: string;
}

export async function getClassWithSemester(classId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classes")
    .select("*, class_sessions(*), semesters(id, name, status)")
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
    .from("class_sessions")
    .select("id, day_of_week, start_time, end_time")
    .eq("class_id", classId);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  if (sessionIds.length > 0) {
    const { data: regs } = await supabase
      .from("registrations")
      .select(
        "id, status, session_id, created_at, dancers(id, first_name, last_name), users(id, first_name, last_name, email), class_sessions(day_of_week, start_time, end_time)"
      )
      .in("session_id", sessionIds)
      .neq("status", "cancelled");

    for (const r of regs ?? []) {
      const dancer = Array.isArray(r.dancers) ? r.dancers[0] : r.dancers;
      const user = Array.isArray(r.users) ? r.users[0] : r.users;
      const cs = Array.isArray(r.class_sessions)
        ? r.class_sessions[0]
        : r.class_sessions;
      const day = cs?.day_of_week
        ? cs.day_of_week.charAt(0).toUpperCase() + cs.day_of_week.slice(1)
        : "";
      results.push({
        id: r.id,
        dancerName: dancer
          ? `${dancer.first_name} ${dancer.last_name}`
          : "Unknown",
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
      });
    }
  }

  // --- Full-schedule model ---
  const { data: schedules } = await supabase
    .from("class_schedules")
    .select("id, days_of_week, start_time, end_time")
    .eq("class_id", classId);

  const scheduleIds = (schedules ?? []).map((s) => s.id);

  if (scheduleIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("schedule_enrollments")
      .select(
        "id, status, schedule_id, created_at, dancers(id, first_name, last_name), registration_batches(id, parent_id)"
      )
      .in("schedule_id", scheduleIds)
      .neq("status", "cancelled");

    const parentIds = [
      ...new Set(
        (enrollments ?? [])
          .map((e) => {
            const rb = Array.isArray(e.registration_batches)
              ? e.registration_batches[0]
              : e.registration_batches;
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
      const rb = Array.isArray(e.registration_batches)
        ? e.registration_batches[0]
        : e.registration_batches;
      const parent = rb?.parent_id ? parentMap[rb.parent_id] : null;
      const sch = scheduleMap[e.schedule_id];
      const days = (sch?.days_of_week as string[] | null)
        ?.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3))
        .join("/");
      results.push({
        id: e.id,
        dancerName: dancer
          ? `${dancer.first_name} ${dancer.last_name}`
          : "Unknown",
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
      });
    }
  }

  return results;
}

export async function getClassCapacity(classId: string) {
  const supabase = createClient();

  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("id, capacity")
    .eq("class_id", classId);

  const { data: schedules } = await supabase
    .from("class_schedules")
    .select("id, capacity")
    .eq("class_id", classId);

  const totalCapacity = [
    ...(sessions ?? []).map((s) => s.capacity ?? 0),
    ...(schedules ?? []).map((s) => s.capacity ?? 0),
  ].reduce((a, b) => a + b, 0);

  return { totalCapacity, sessionCount: (sessions ?? []).length };
}

export async function getDiscounts(): Promise<HydratedDiscount[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("discounts")
    .select(
      `
      *,
      discount_rules (*),
      discount_rule_sessions ( session_id )
        `,
    )

    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load discounts.", error.message);
  }
  return data ?? [];
}
