import type { ConflictDetail, ConflictResult, SessionScheduleInfo } from "@/types";

/**
 * Pure client-side time conflict detection.
 *
 * Checks every pair of sessions in `sessionIds` against the provided
 * schedule map. Returns all overlapping pairs for a single dancer.
 *
 * Conflict definition:
 *   - Per-day sessions (scheduleDate non-null): same exact calendar date AND overlapping times.
 *   - Legacy sessions (scheduleDate null/undefined): same day_of_week AND overlapping times.
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
      if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) continue;

      // Determine whether these two sessions can conflict by date
      const aIsPerDay = !!a.scheduleDate;
      const bIsPerDay = !!b.scheduleDate;

      if (aIsPerDay && bIsPerDay) {
        // Per-day: only conflict if they fall on the exact same calendar date
        if (a.scheduleDate !== b.scheduleDate) continue;
      } else if (!aIsPerDay && !bIsPerDay) {
        // Legacy: only conflict if they share the same recurring day-of-week
        if (a.dayOfWeek !== b.dayOfWeek) continue;
      } else {
        // Mixed per-day/legacy: skip — incomparable schedule types
        continue;
      }

      // Overlap: A starts before B ends AND A ends after B starts
      if (a.startTime < b.endTime && a.endTime > b.startTime) {
        conflicts.push({ sessionA: a, sessionB: b });
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}
