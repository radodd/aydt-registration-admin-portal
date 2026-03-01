import type { ConflictDetail, ConflictResult, SessionScheduleInfo } from "@/types";

/**
 * Pure client-side time conflict detection.
 *
 * Checks every pair of sessions in `sessionIds` against the provided
 * schedule map. Returns all overlapping pairs for a single dancer.
 *
 * Conflict definition: same day_of_week AND
 *   (start_time < other.end_time AND end_time > other.start_time)
 *
 * Time strings are 'HH:MM:SS' — lexicographic comparison is correct for
 * this format within the same day.
 */
export function detectTimeConflicts(
  sessionIds: string[],
  scheduleMap: Map<string, SessionScheduleInfo>,
): ConflictResult {
  const conflicts: ConflictDetail[] = [];

  for (let i = 0; i < sessionIds.length; i++) {
    for (let j = i + 1; j < sessionIds.length; j++) {
      const a = scheduleMap.get(sessionIds[i]);
      const b = scheduleMap.get(sessionIds[j]);

      if (!a || !b) continue;
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) continue;

      // Overlap: A starts before B ends AND A ends after B starts
      if (a.startTime < b.endTime && a.endTime > b.startTime) {
        conflicts.push({ sessionA: a, sessionB: b });
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}
