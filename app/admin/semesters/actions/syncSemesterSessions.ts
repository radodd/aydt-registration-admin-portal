"use server";

import { createClient } from "@/utils/supabase/server";
import { SemesterSession } from "@/types";

export async function syncSemesterSessions(
  semesterId: string,
  appliedSessions: SemesterSession[],
) {
  const supabase = await createClient();

  // 1️⃣ Remove existing semester sessions
  const { error: deleteError } = await supabase
    .from("sessions")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!appliedSessions?.length) return new Map();

  // 2️⃣ Insert new sessions (materialized copy)
  const rows = appliedSessions.map((s) => ({
    semester_id: semesterId,

    // Required fields
    title: s.overriddenTitle ?? s.title,
    category: s.overriddenCategory ?? "general", // must not be null
    type: s.overriddenType ?? s.type,
    capacity: s.overriddenCapacity ?? s.capacity,

    start_date: s.overriddenStartDate ?? s.startDate,
    end_date: s.overriddenEndDate ?? s.endDate,
    days_of_week: s.overriddenDaysOfWeek ?? s.daysOfWeek,

    // Required by schema but not in your type — must supply defaults
    description: null,
    location: null,
    price: 0,
    registration_fee: null,
    start_time: "00:00",
    end_time: "00:00",
    is_active: true,
  }));

  const { data, error } = await supabase.from("sessions").insert(rows).select(); // ← critical

  if (error) throw new Error(error.message);

  // Build mapping
  const idMap = new Map<string, string>();

  appliedSessions.forEach((draftSession, index) => {
    idMap.set(draftSession.sessionId, data[index].id);
  });

  return idMap;
}
