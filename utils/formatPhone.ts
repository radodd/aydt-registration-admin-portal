/**
 * Formats a phone input value progressively as the user types.
 * Strips non-digits, caps at 10 digits, and applies US (XXX) XXX-XXXX format.
 *
 * Examples:
 *   "5"           → "(5"
 *   "555"         → "(555"
 *   "5551"        → "(555) 1"
 *   "5551234"     → "(555) 123-4"
 *   "5551234567"  → "(555) 123-4567"
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
