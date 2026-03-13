"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export type AdminSessionInfo = {
  sessionId: string;
  classId: string;
  className: string;
  discipline: string;
  division: string;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  instructorName: string | null;
  capacity: number | null;
  enrolled: number;
};

export type AdminClassGroup = {
  classId: string;
  name: string;
  division: string;
  discipline: string;
  minAge: number | null;
  maxAge: number | null;
  /** Aggregated from sessions — earliest start date */
  startDate: string | null;
  /** Aggregated from sessions — latest end date */
  endDate: string | null;
  /** Primary location (first non-null across sessions) */
  location: string | null;
  sessions: AdminSessionInfo[];
};

export async function fetchSemesterClasses(semesterId: string): Promise<AdminClassGroup[]> {
  await requireAdmin();
  if (!semesterId) return [];
  const supabase = await createClient();

  const { data: classes, error } = await supabase
    .from("classes")
    .select(
      "id, name, division, discipline, min_age, max_age, class_sessions(id, day_of_week, start_time, end_time, start_date, end_date, location, instructor_name, capacity)"
    )
    .eq("semester_id", semesterId)
    .order("name");

  if (error || !classes) return [];

  // Collect session IDs for enrollment count
  const allSessionIds = (classes as any[]).flatMap((c) =>
    ((c.class_sessions as any[]) ?? []).map((s: any) => s.id)
  );

  const enrollmentCounts: Record<string, number> = {};
  if (allSessionIds.length > 0) {
    const { data: regRows } = await supabase
      .from("registrations")
      .select("session_id")
      .in("session_id", allSessionIds)
      .neq("status", "cancelled");

    for (const r of regRows ?? []) {
      const sid = (r as any).session_id as string;
      enrollmentCounts[sid] = (enrollmentCounts[sid] ?? 0) + 1;
    }
  }

  return (classes as any[]).map((c) => {
    const sessions: AdminSessionInfo[] = ((c.class_sessions as any[]) ?? []).map((s) => ({
      sessionId: s.id as string,
      classId: c.id as string,
      className: c.name as string,
      discipline: c.discipline as string,
      division: c.division as string,
      dayOfWeek: s.day_of_week ?? null,
      startTime: s.start_time ?? null,
      endTime: s.end_time ?? null,
      startDate: s.start_date ?? null,
      endDate: s.end_date ?? null,
      location: s.location ?? null,
      instructorName: s.instructor_name ?? null,
      capacity: s.capacity ?? null,
      enrolled: enrollmentCounts[s.id] ?? 0,
    }));

    // Aggregate location and date range from sessions
    const locations = sessions.map((s) => s.location).filter(Boolean);
    const startDates = sessions.map((s) => s.startDate).filter(Boolean).sort();
    const endDates = sessions.map((s) => s.endDate).filter(Boolean).sort();

    return {
      classId: c.id as string,
      name: c.name as string,
      division: c.division as string,
      discipline: c.discipline as string,
      minAge: c.min_age ?? null,
      maxAge: c.max_age ?? null,
      startDate: startDates.length > 0 ? startDates[0] : null,
      endDate: endDates.length > 0 ? endDates[endDates.length - 1] : null,
      location: locations.length > 0 ? locations[0]! : null,
      sessions,
    };
  });
}
