"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export type AdminSessionInfo = {
  sessionId: string;
  scheduleId: string;
  classId: string;
  className: string;
  discipline: string;
  division: string | null;
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
  /** Phase 2: per-schedule drop-in flag (new source of truth). */
  isDropIn: boolean;
};

/** Phase 2: per-class tier (used when isTiered=true). */
export type AdminClassTier = {
  id: string;
  label: string;
  startTime: string | null;
  endTime: string | null;
  price: number | null;
  sortOrder: number;
  isDefault: boolean;
};

export type AdminClassGroup = {
  classId: string;
  name: string;
  division: string | null;
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
  /** Phase 2: per-class tiered flag. */
  isTiered: boolean;
  /** Phase 2: per-class tiers list (empty when isTiered=false). */
  tiers: AdminClassTier[];
  /** Phase 2: true if ANY schedule on this class is is_drop_in (mirrors UI cascade). */
  isDropIn: boolean;
};

export async function fetchSemesterClasses(semesterId: string): Promise<AdminClassGroup[]> {
  await requireAdmin();
  if (!semesterId) return [];
  const supabase = await createClient();

  const { data: classes, error } = await supabase
    .from("classes")
    .select(
      "id, name, division, discipline, min_age, max_age, is_tiered, class_sections(id, pricing_model, is_drop_in), class_meetings(id, section_id, day_of_week, start_time, end_time, start_date, end_date, schedule_date, location, instructor_name, capacity, drop_in_price), class_tiers(id, label, start_time, end_time, price_cents, sort_order, is_default), division_info:divisions(is_drop_in)"
    )
    .eq("semester_id", semesterId)
    .order("name");

  if (error || !classes) return [];

  // Collect unique schedule IDs for enrollment count
  const allScheduleIds = [
    ...new Set(
      (classes as any[]).flatMap((c) =>
        ((c.class_meetings as any[]) ?? [])
          .map((s: any) => s.section_id as string)
          .filter(Boolean)
      )
    ),
  ];

  // Count enrollments at the schedule level (new class-based registration model)
  const enrollmentCounts: Record<string, number> = {};
  if (allScheduleIds.length > 0) {
    const { data: enrollRows } = await supabase
      .from("section_enrollments")
      .select("section_id")
      .in("section_id", allScheduleIds)
      .neq("status", "cancelled");

    for (const r of enrollRows ?? []) {
      const sid = (r as any).section_id as string;
      enrollmentCounts[sid] = (enrollmentCounts[sid] ?? 0) + 1;
    }
  }

  return (classes as any[]).map((c) => {
    const pricingByScheduleId = new Map<string, "full_schedule" | "per_session">();
    const dropInByScheduleId = new Map<string, boolean>();
    const legacyDivisionDropIn = c.division_info?.is_drop_in === true;
    for (const sched of (c.class_sections as any[]) ?? []) {
      pricingByScheduleId.set(
        sched.id as string,
        ((sched.pricing_model as string) === "per_session" ? "per_session" : "full_schedule"),
      );
      // New source of truth, falls back to legacy division flag for unmigrated rows.
      dropInByScheduleId.set(sched.id as string, sched.is_drop_in === true || legacyDivisionDropIn);
    }
    const sessions: AdminSessionInfo[] = ((c.class_meetings as any[]) ?? []).map((s) => ({
      sessionId: s.id as string,
      scheduleId: (s.section_id ?? "") as string,
      classId: c.id as string,
      className: c.name as string,
      discipline: c.discipline as string,
      division: c.division ?? null,
      dayOfWeek: s.day_of_week ?? null,
      startTime: s.start_time ?? null,
      endTime: s.end_time ?? null,
      startDate: s.start_date ?? null,
      endDate: s.end_date ?? null,
      scheduleDate: s.schedule_date ?? null,
      location: s.location ?? null,
      instructorName: s.instructor_name ?? null,
      capacity: s.capacity ?? null,
      enrolled: enrollmentCounts[s.section_id] ?? 0,
      pricingModel: pricingByScheduleId.get(s.section_id as string) ?? "full_schedule",
      dropInPrice: s.drop_in_price != null ? Number(s.drop_in_price) : null,
      isDropIn: dropInByScheduleId.get(s.section_id as string) ?? false,
    }));

    // Aggregate location and date range from sessions
    const locations = sessions.map((s) => s.location).filter(Boolean);
    const startDates = sessions.map((s) => s.startDate).filter(Boolean).sort();
    const endDates = sessions.map((s) => s.endDate).filter(Boolean).sort();

    const tiers: AdminClassTier[] = ((c.class_tiers as any[]) ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((t: any) => ({
        id: t.id as string,
        label: t.label as string,
        startTime: t.start_time ? String(t.start_time).slice(0, 5) : null,
        endTime: t.end_time ? String(t.end_time).slice(0, 5) : null,
        price: t.price_cents != null ? Number(t.price_cents) / 100 : null,
        sortOrder: t.sort_order ?? 0,
        isDefault: t.is_default === true,
      }));

    return {
      classId: c.id as string,
      name: c.name as string,
      division: c.division ?? null,
      discipline: c.discipline as string,
      minAge: c.min_age ?? null,
      maxAge: c.max_age ?? null,
      startDate: startDates.length > 0 ? startDates[0] : null,
      endDate: endDates.length > 0 ? endDates[endDates.length - 1] : null,
      location: locations.length > 0 ? locations[0]! : null,
      sessions,
      isTiered: c.is_tiered === true,
      tiers,
      isDropIn: sessions.some((s) => s.isDropIn),
    };
  });
}
