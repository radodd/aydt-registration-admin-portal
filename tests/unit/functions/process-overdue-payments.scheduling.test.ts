import { describe, it, expect } from "vitest";
import {
  decideDeclineOutcome,
  isBusinessDay,
  MAX_CHARGE_ATTEMPTS,
  nextBusinessDay,
} from "@/supabase/functions/process-overdue-payments/scheduling";

/**
 * #53 — scheduled-payment auto-retry over 3 business days.
 *
 * These tests drive the SAME pure rules the process-overdue-payments edge
 * function uses (imported from ./scheduling.ts), so the 3-business-day retry
 * behaviour is verified without standing up Supabase + EPG. The handler's DB /
 * gateway / email side effects are out of scope here.
 *
 * Calendar anchors (all UTC):
 *   2026-06-26 Fri | 06-27 Sat | 06-28 Sun | 06-29 Mon | 06-30 Tue
 */

describe("isBusinessDay", () => {
  it("treats Mon–Fri as business days", () => {
    expect(isBusinessDay("2026-06-26")).toBe(true); // Fri
    expect(isBusinessDay("2026-06-29")).toBe(true); // Mon
    expect(isBusinessDay("2026-06-30")).toBe(true); // Tue
  });

  it("treats Sat/Sun as non-business days", () => {
    expect(isBusinessDay("2026-06-27")).toBe(false); // Sat
    expect(isBusinessDay("2026-06-28")).toBe(false); // Sun
  });
});

describe("nextBusinessDay", () => {
  it("advances one weekday on a normal weekday", () => {
    expect(nextBusinessDay("2026-06-29")).toBe("2026-06-30"); // Mon -> Tue
  });

  it("skips the weekend from a Friday", () => {
    expect(nextBusinessDay("2026-06-26")).toBe("2026-06-29"); // Fri -> Mon
  });

  it("rolls a Saturday or Sunday forward to Monday", () => {
    expect(nextBusinessDay("2026-06-27")).toBe("2026-06-29"); // Sat -> Mon
    expect(nextBusinessDay("2026-06-28")).toBe("2026-06-29"); // Sun -> Mon
  });

  it("always returns a business day", () => {
    for (const d of ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"]) {
      expect(isBusinessDay(nextBusinessDay(d))).toBe(true);
    }
  });
});

describe("decideDeclineOutcome — single decline", () => {
  it("schedules a retry on the next business day for attempts 1 and 2", () => {
    const a1 = decideDeclineOutcome(0, "2026-06-29"); // Mon, first decline
    expect(a1).toMatchObject({
      newCount: 1,
      status: "overdue",
      nextAttemptDate: "2026-06-30", // Tue
      exhausted: false,
    });

    const a2 = decideDeclineOutcome(1, "2026-06-30"); // Tue, second decline
    expect(a2).toMatchObject({
      newCount: 2,
      status: "overdue",
      nextAttemptDate: "2026-07-01", // Wed
      exhausted: false,
    });
  });

  it("marks the installment failed and stops retrying on the 3rd decline", () => {
    const a3 = decideDeclineOutcome(2, "2026-07-01"); // Wed, third decline
    expect(a3).toMatchObject({
      newCount: MAX_CHARGE_ATTEMPTS,
      status: "failed",
      nextAttemptDate: null,
      exhausted: true,
    });
  });

  it("only the final decline is exhausted (the AYDT-alert trigger)", () => {
    expect(decideDeclineOutcome(0, "2026-06-29").exhausted).toBe(false);
    expect(decideDeclineOutcome(1, "2026-06-29").exhausted).toBe(false);
    expect(decideDeclineOutcome(2, "2026-06-29").exhausted).toBe(true);
  });
});

describe("3-business-day retry flow (simulated cron across days)", () => {
  it("retries Fri -> Mon -> Tue, skipping the weekend, alerting only on the 3rd", () => {
    // An installment goes overdue on Friday and declines every attempt. We walk
    // the cron forward, jumping `today` to each scheduled retry date, exactly as
    // the real job would once next_attempt_date arrives.
    const attemptDays: string[] = [];
    const alerts: number[] = [];

    let attemptCount = 0;
    let today = "2026-06-26"; // Fri — the day it first goes overdue

    for (let i = 0; i < MAX_CHARGE_ATTEMPTS; i++) {
      attemptDays.push(today);
      const outcome = decideDeclineOutcome(attemptCount, today);
      attemptCount = outcome.newCount;
      if (outcome.exhausted) alerts.push(outcome.newCount);
      if (outcome.nextAttemptDate) today = outcome.nextAttemptDate;
    }

    // Three attempts, one per business day, weekend skipped.
    expect(attemptDays).toEqual(["2026-06-26", "2026-06-29", "2026-06-30"]);
    expect(attemptDays.every(isBusinessDay)).toBe(true);

    // AYDT is alerted exactly once, on the final attempt.
    expect(alerts).toEqual([MAX_CHARGE_ATTEMPTS]);
    expect(attemptCount).toBe(MAX_CHARGE_ATTEMPTS);
  });

  it("a success on day 2 ends the flow with no alert", () => {
    // Day 1 declines, day 2 succeeds — modelled by simply not calling
    // decideDeclineOutcome again once the charge clears.
    const day1 = decideDeclineOutcome(0, "2026-06-26"); // Fri decline
    expect(day1.exhausted).toBe(false);
    expect(day1.nextAttemptDate).toBe("2026-06-29"); // retry Monday

    // Monday's charge succeeds → handler sets status 'paid', never reaching
    // decideDeclineOutcome, so no exhausted/alert is ever produced. Asserting the
    // contract: nothing in the first two declines flags exhaustion.
    expect(decideDeclineOutcome(1, "2026-06-29").exhausted).toBe(false);
  });
});
