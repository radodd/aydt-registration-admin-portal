import type { ProfileFieldKey } from "@/types";

/**
 * Shared prefill helpers for the registration Questions step, used by BOTH the
 * admin manual-reg flow (`app/admin/register/steps/QuestionsStep.tsx`) and the
 * public family-facing form (`app/(user-facing)/register/form/page.tsx`). Kept
 * in one place so the two flows can't drift apart again.
 *
 * Meeting-plan #35: many semester forms (incl. the live "AYDT North: Washington
 * Heights" form and migrated/older forms) carry standard questions whose
 * `profileField` was never tagged, so prefill had nothing to map onto and
 * silently no-op'd. `inferProfileSeedValue` recovers a value from the question
 * label. `reconcileSelectValue` then fixes a separate, pre-existing gap: stored
 * grades are plain numbers ("6") while form <select> options vary ("6th",
 * "6th Grade") — so a raw seed value would leave the dropdown blank.
 */

export type ProfileMap = Partial<Record<ProfileFieldKey, string | undefined>>;

const normalizeLabel = (label: string): string =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Single-value label → profile key (matched against the normalized label).
// Deliberately conservative: only high-confidence labels map. Ambiguous fields
// (a bare "Email Address" / "Home phone number" that could be dancer OR parent)
// are intentionally absent so they stay blank rather than risk a wrong fill.
const LABEL_TO_FIELD: Array<[RegExp, ProfileFieldKey]> = [
  [/^first name$/, "dancer_first_name"],
  [/^last name$/, "dancer_last_name"],
  [/^(date of birth|dob|birth date|birthdate)$/, "dancer_birth_date"],
  [/^grade$/, "dancer_grade"],
  [/^school( name)?$/, "dancer_school"],
  [/^student email$/, "dancer_email"],
  [/^emergency contact relationship/, "emergency_contact_relationship"],
  [/^emergency contact.*(phone|cell)/, "emergency_contact_phone"],
  [/^emergency contact.*email/, "emergency_contact_email"],
];

// Combined "Full Name" style labels → [first, last] keys joined into one value.
const COMBINED_NAME_TO_FIELDS: Array<[RegExp, [ProfileFieldKey, ProfileFieldKey]]> = [
  [/emergency contact name/, ["emergency_contact_first_name", "emergency_contact_last_name"]],
  [/(nanny|caregiver).*name/, ["caregiver_first_name", "caregiver_last_name"]],
];

/**
 * Resolve a seed value for an untagged question from its label, using the
 * already-built profile map. Returns undefined when nothing maps confidently.
 */
export function inferProfileSeedValue(
  label: string | undefined,
  profileMap: ProfileMap,
): string | undefined {
  if (!label) return undefined;
  const norm = normalizeLabel(label);

  for (const [pattern, key] of LABEL_TO_FIELD) {
    if (pattern.test(norm)) return profileMap[key] ?? undefined;
  }
  for (const [pattern, [firstKey, lastKey]] of COMBINED_NAME_TO_FIELDS) {
    if (pattern.test(norm)) {
      const joined = [profileMap[firstKey], profileMap[lastKey]]
        .filter((v): v is string => !!v && v.trim().length > 0)
        .join(" ")
        .trim();
      return joined || undefined;
    }
  }
  return undefined;
}

// Collapse grade-ish strings to a comparable core: drop the word "grade", strip
// ordinal suffixes ("6th" → "6"), and fold K / Pre-K synonyms.
function normalizeOption(s: string): string {
  let n = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  n = n.replace(/\bgrade\b/g, "").trim();
  n = n.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1");
  if (/pre ?k|pre school|preschool/.test(n)) return "prek";
  if (/^k$|kindergarten/.test(n)) return "k";
  return n.replace(/\s+/g, "");
}

/**
 * Map a seed value onto the actual option string a `select` question offers,
 * tolerating vocabulary mismatches (stored "6" vs option "6th" / "6th Grade").
 * Returns the matching option, or undefined when none matches (caller should
 * then leave the field blank rather than set an invalid value).
 */
export function reconcileSelectValue(
  value: string,
  options: string[] | undefined,
): string | undefined {
  if (!options || options.length === 0) return value;
  if (options.includes(value)) return value;
  const target = normalizeOption(value);
  if (!target) return undefined;
  return options.find((opt) => normalizeOption(opt) === target);
}
