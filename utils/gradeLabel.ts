/**
 * Converts a grade integer to a human-readable label.
 *
 * Convention used throughout the AYDT portal:
 *   -3 → Nursery
 *   -2 → Pre-K3
 *   -1 → Pre-K4
 *    0 → K
 *    1 → 1st
 *    2 → 2nd
 *    3 → 3rd
 *    4–12 → 4th–12th
 */
export function gradeLabel(grade: number): string {
  if (grade <= -3) return "Nursery";
  if (grade === -2) return "Pre-K3";
  if (grade === -1) return "Pre-K4";
  if (grade === 0) return "K";
  return `${grade}${gradeSuffix(grade)}`;
}

function gradeSuffix(grade: number): string {
  if (grade === 1) return "st";
  if (grade === 2) return "nd";
  if (grade === 3) return "rd";
  return "th";
}

/**
 * Returns a compact grade range string.
 * Examples:
 *   gradeRangeLabel(-1, 0)   → "Pre-K4–K"
 *   gradeRangeLabel(1, 3)    → "1st–3rd"
 *   gradeRangeLabel(4, null) → "4th+"
 *   gradeRangeLabel(null, null) → "All grades"
 */
export function gradeRangeLabel(
  minGrade: number | null | undefined,
  maxGrade: number | null | undefined,
): string {
  if (minGrade == null && maxGrade == null) return "All grades";
  if (minGrade != null && maxGrade == null) return `${gradeLabel(minGrade)}+`;
  if (minGrade == null && maxGrade != null) return `Up to ${gradeLabel(maxGrade)}`;
  // Both set
  if (minGrade === maxGrade) return gradeLabel(minGrade!);
  return `${gradeLabel(minGrade!)}–${gradeLabel(maxGrade!)}`;
}

/**
 * Sorted list of all selectable grade integers for use in admin dropdowns.
 * Covers Nursery (-3) through 12th grade (12).
 */
export const GRADE_OPTIONS: { value: number; label: string }[] = Array.from(
  { length: 16 },
  (_, i) => {
    const grade = i - 3; // -3 … 12
    return { value: grade, label: gradeLabel(grade) };
  },
);
