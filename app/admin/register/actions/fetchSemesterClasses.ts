"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export type AdminSessionInfo = {
  sessionId: string;
  scheduleId: string;
  classId: string;
  className: string;
  discipline: string;
  division: string;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  /** YYYY-MM-DD when this session occurs (per-day model). Null for legacy rows. */
  scheduleDate: string | null;
  location: string | null;
  instructorName: string | null;
  capacity: number | null;
  enrolled: number;
  /** Pricing model inherited from the parent schedule. */
  pricingModel: "full_schedule" | "per_session";
  /** Per-session price when pricingModel === "per_session". */
  dropInPrice: number | null;
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
      "id, name, division, discipline, min_age, max_age, class_schedules(id, pricing_model), class_sessions(id, schedule_id, day_of_week, start_time, end_time, start_date, end_date, schedule_date, location, instructor_name, capacity, drop_in_price)"
    )
    .eq("semester_id", semesterId)
    .order("name");

  if (error || !classes) return [];

  // Collect unique schedule IDs for enrollment count
  const allScheduleIds = [
    ...new Set(
      (classes as any[]).flatMap((c) =>
        ((c.class_sessions as any[]) ?? [])
          .map((s: any) => s.schedule_id as string)
          .filter(Boolean)
      )
    ),
  ];

  // Count enrollments at the schedule level (new class-based registration model)
  const enrollmentCounts: Record<string, number> = {};
  if (allScheduleIds.length > 0) {
    const { data: enrollRows } = await supabase
      .from("schedule_enrollments")
      .select("schedule_id")
      .in("schedule_id", allScheduleIds)
      .neq("status", "cancelled");

    for (const r of enrollRows ?? []) {
      const sid = (r as any).schedule_id as string;
      enrollmentCounts[sid] = (enrollmentCounts[sid] ?? 0) + 1;
    }
  }

  return (classes as any[]).map((c) => {
    const pricingByScheduleId = new Map<string, "full_schedule" | "per_session">();
    for (const sched of (c.class_schedules as any[]) ?? []) {
      pricingByScheduleId.set(
        sched.id as string,
        ((sched.pricing_model as string) === "per_session" ? "per_session" : "full_schedule"),
      );
    }
    const sessions: AdminSessionInfo[] = ((c.class_sessions as any[]) ?? []).map((s) => ({
      sessionId: s.id as string,
      scheduleId: (s.schedule_id ?? "") as string,
      classId: c.id as string,
      className: c.name as string,
      discipline: c.discipline as string,
      division: c.division as string,
      dayOfWeek: s.day_of_week ?? null,
      startTime: s.start_time ?? null,
      endTime: s.end_time ?? null,
      startDate: s.start_date ?? null,
      endDate: s.end_date ?? null,
      scheduleDate: s.schedule_date ?? null,
      location: s.location ?? null,
      instructorName: s.instructor_name ?? null,
      capacity: s.capacity ?? null,
      enrolled: enrollmentCounts[s.schedule_id] ?? 0,
      pricingModel: pricingByScheduleId.get(s.schedule_id as string) ?? "full_schedule",
      dropInPrice: s.drop_in_price != null ? Number(s.drop_in_price) : null,
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
