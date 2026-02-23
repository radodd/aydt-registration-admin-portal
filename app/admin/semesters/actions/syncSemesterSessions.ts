"use server";

import { createClient } from "@/utils/supabase/server";
import { SemesterSession } from "@/types";

export async function syncSemesterSessions(
  semesterId: string,
  appliedSessions: SemesterSession[],
): Promise<Map<string, string>> {
  const supabase = await createClient();

  // 1️⃣ Fetch session IDs currently owned by this semester
  const { data: existingSessions, error: fetchError } = await supabase
    .from("sessions")
    .select("id")
    .eq("semester_id", semesterId);

  if (fetchError) throw new Error(fetchError.message);

  const existingIds = new Set(existingSessions.map((s) => s.id));
  const incomingIds = new Set(
    appliedSessions.map((s) => s.sessionId).filter(Boolean),
  );

  // 2️⃣ Delete sessions removed from the applied list (guarded by semester ownership)
  const idsToDelete = [...existingIds].filter((id) => !incomingIds.has(id));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("semester_id", semesterId)
      .in("id", idsToDelete);

    if (deleteError) throw new Error(deleteError.message);
  }

  // 3️⃣ Classify sessions: owned (already in this semester) vs foreign (from another semester)
  const ownedSessions = appliedSessions.filter((s) =>
    existingIds.has(s.sessionId),
  );
  const foreignSessions = appliedSessions.filter(
    (s) => !existingIds.has(s.sessionId),
  );

  const idMap = new Map<string, string>();

  // 4️⃣ Update owned sessions in-place — safe because semester_id already matches
  if (ownedSessions.length > 0) {
    const ownedRows = ownedSessions.map((s) => ({
      id: s.sessionId,
      semester_id: semesterId,
      title: s.overriddenTitle ?? s.title,
      category: s.overriddenCategory ?? "general",
      type: s.overriddenType ?? s.type,
      capacity: s.overriddenCapacity ?? s.capacity,
      start_date: s.overriddenStartDate ?? s.startDate,
      end_date: s.overriddenEndDate ?? s.endDate,
      days_of_week: s.overriddenDaysOfWeek ?? s.daysOfWeek,
      description: null,
      location: null,
      price: 0,
      registration_fee: null,
      start_time: "00:00",
      end_time: "00:00",
      is_active: true,
    }));

    const { error: updateError } = await supabase
      .from("sessions")
      .upsert(ownedRows, { onConflict: "id" });

    if (updateError) throw new Error(updateError.message);

    ownedSessions.forEach((s) => idMap.set(s.sessionId, s.sessionId));
  }

  // 5️⃣ Clone foreign sessions — omit `id` so the DB assigns a new UUID
  if (foreignSessions.length > 0) {
    const cloneRows = foreignSessions.map((s) => ({
      semester_id: semesterId,
      title: s.overriddenTitle ?? s.title,
      category: s.overriddenCategory ?? "general",
      type: s.overriddenType ?? s.type,
      capacity: s.overriddenCapacity ?? s.capacity,
      start_date: s.overriddenStartDate ?? s.startDate,
      end_date: s.overriddenEndDate ?? s.endDate,
      days_of_week: s.overriddenDaysOfWeek ?? s.daysOfWeek,
      description: null,
      location: null,
      price: 0,
      registration_fee: null,
      start_time: "00:00",
      end_time: "00:00",
      is_active: true,
    }));

    const { data: cloned, error: insertError } = await supabase
      .from("sessions")
      .insert(cloneRows)
      .select("id");

    if (insertError) throw new Error(insertError.message);

    // PostgreSQL preserves insertion order for a single INSERT statement;
    // correlate returned IDs to source session IDs by position.
    foreignSessions.forEach((s, index) => {
      idMap.set(s.sessionId, cloned[index].id);
    });
  }

  return idMap;
}
