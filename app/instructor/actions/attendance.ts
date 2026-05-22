"use server";

import { createClient } from "@/utils/supabase/server";
import { requireInstructor } from "@/utils/requireInstructor";
import type { AttendanceStatus } from "@/types";

export interface AttendanceRecordInput {
  dancerId:  string;
  status:    AttendanceStatus;
  note:      string | null;
}

/**
 * Bulk upsert attendance records for a single (session, occurrence date) pair.
 *
 * Rules:
 *  - New records are inserted with marked_by = current instructor.
 *  - Existing records I previously marked are updated.
 *  - Records marked by a *different* instructor are left untouched.
 *
 * The server client is used so Supabase RLS (instructor INSERT/UPDATE policies)
 * still applies as a secondary guard.
 */
export async function upsertAttendance(
  sessionId:         string,
  occurrenceDateId:  string,
  records:           AttendanceRecordInput[],
): Promise<void> {
  const { userId } = await requireInstructor();
  const supabase   = await createClient();

  // 1. Fetch existing records for this session + occurrence date.
  const { data: existing, error: fetchErr } = await supabase
    .from("attendance")
    .select("id, dancer_id, marked_by")
    .eq("meeting_id",        sessionId)
    .eq("occurrence_date_id", occurrenceDateId);

  if (fetchErr) throw new Error(fetchErr.message);

  const existingMap = new Map(
    (existing ?? []).map((r) => [
      r.dancer_id,
      { id: r.id, markedBy: r.marked_by as string },
    ]),
  );

  const toInsert: object[] = [];
  const toUpdate: { id: string; status: AttendanceStatus; note: string | null }[] = [];

  for (const rec of records) {
    const ex = existingMap.get(rec.dancerId);
    if (ex) {
      if (ex.markedBy === userId) {
        // My record — update it.
        toUpdate.push({ id: ex.id, status: rec.status, note: rec.note || null });
      }
      // else: another instructor marked this student — leave it.
    } else {
      // No existing record — insert.
      toInsert.push({
        meeting_id:         sessionId,
        occurrence_date_id: occurrenceDateId,
        dancer_id:          rec.dancerId,
        status:             rec.status,
        note:               rec.note || null,
        marked_by:          userId,
      });
    }
  }

  // 2. Execute both sets in parallel.
  const ops: Promise<void>[] = [];

  if (toInsert.length > 0) {
    ops.push(
      supabase
        .from("attendance")
        .insert(toInsert)
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  for (const rec of toUpdate) {
    ops.push(
      supabase
        .from("attendance")
        .update({ status: rec.status, note: rec.note })
        .eq("id", rec.id)
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  await Promise.all(ops);
}
