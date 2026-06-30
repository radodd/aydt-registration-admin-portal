/**
 * Pure scheduling rules for the recurring installment auto-charge job (#53).
 *
 * No Deno or Supabase APIs live here on purpose — this module is imported by
 * BOTH index.ts (the Deno edge function) and the Vitest unit tests, so the
 * 3-business-day retry logic is exercised without standing up the full
 * edge-function / EPG / Supabase stack. Keep behavioural logic here, not inline
 * in the handler, so the tests cover the real code (no mirror-drift).
 *
 * All dates are 'YYYY-MM-DD' strings interpreted in UTC, matching the `today`
 * string the handler derives from new Date().toISOString().
 */

/** A declined installment stops retrying and alerts AYDT after this many attempts. */
export const MAX_CHARGE_ATTEMPTS = 3;

/** True when `ymd` falls on a weekday (Mon–Fri). Weekends only — no holidays (v1). */
export function isBusinessDay(ymd: string): boolean {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6; // 0 = Sun, 6 = Sat
}

/** The next weekday strictly after `fromYmd`. Skips Sat/Sun. */
export function nextBusinessDay(fromYmd: string): string {
  const d = new Date(`${fromYmd}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().split("T")[0];
}

export interface DeclineOutcome {
  /** charge_attempt_count after this decline. */
  newCount: number;
  /** New installment status: 'failed' once attempts are exhausted, else 'overdue'. */
  status: "overdue" | "failed";
  /** Date the job may next attempt this installment; null when exhausted. */
  nextAttemptDate: string | null;
  /** True on the final (3rd) decline — the only point AYDT is alerted. */
  exhausted: boolean;
}

/**
 * Decide the installment's new state after a declined charge that ran on `today`.
 *
 *  - increments the attempt count
 *  - at MAX_CHARGE_ATTEMPTS → status 'failed', no further retry (AYDT alerted)
 *  - otherwise → stays 'overdue', next attempt scheduled for the next business day
 */
export function decideDeclineOutcome(
  priorAttemptCount: number,
  today: string,
): DeclineOutcome {
  const newCount = (priorAttemptCount ?? 0) + 1;
  const exhausted = newCount >= MAX_CHARGE_ATTEMPTS;
  return {
    newCount,
    status: exhausted ? "failed" : "overdue",
    nextAttemptDate: exhausted ? null : nextBusinessDay(today),
    exhausted,
  };
}
