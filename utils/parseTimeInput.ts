/**
 * Parse a free-text time entry into canonical "HH:MM" 24-hour format.
 * Returns null on invalid input.
 *
 * Accepts: "7:40 PM", "7:40pm", "7:40", "19:40", "0:05 AM", "12:30 AM"
 */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  // 12-hour with am/pm marker
  const m12 = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const period = m12[3];
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    if (period === "am") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  // 24-hour with no marker
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}
