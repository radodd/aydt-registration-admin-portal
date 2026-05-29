import { describe, it, expect } from "vitest";
import { buildAdminInstallmentSchedule } from "@/utils/buildPaymentSchedule";

describe("buildAdminInstallmentSchedule (#7 admin installments)", () => {
  it("splits an evenly-divisible total into N equal installments", () => {
    const schedule = buildAdminInstallmentSchedule(1000, 5, "2026-09-01");
    expect(schedule).toHaveLength(5);
    expect(schedule.every((i) => i.amountDue === 200)).toBe(true);
    const sum = schedule.reduce((s, i) => s + i.amountDue, 0);
    expect(sum).toBeCloseTo(1000, 2);
  });

  it("puts the rounding remainder on the LAST installment so the sum reconciles exactly", () => {
    // 1000 / 3 = 333.333... → 333.33, 333.33, last absorbs remainder
    const schedule = buildAdminInstallmentSchedule(1000, 3, "2026-09-01");
    expect(schedule.map((i) => i.amountDue)).toEqual([333.33, 333.33, 333.34]);
    const sum = schedule.reduce((s, i) => s + i.amountDue, 0);
    expect(sum).toBeCloseTo(1000, 2);
  });

  it("numbers installments 1..N", () => {
    const schedule = buildAdminInstallmentSchedule(450, 4, "2026-09-01");
    expect(schedule.map((i) => i.installmentNumber)).toEqual([1, 2, 3, 4]);
  });

  it("dates installment 1 today and the rest on monthly anniversaries", () => {
    const schedule = buildAdminInstallmentSchedule(300, 3, "2026-09-15");
    expect(schedule.map((i) => i.dueDate)).toEqual([
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
    ]);
  });

  it("rolls month-end dates forward the way Date.setMonth does (Jan 31 → Mar 3)", () => {
    // Documents the cadence behavior so it isn't mistaken for a bug.
    const schedule = buildAdminInstallmentSchedule(200, 2, "2026-01-31");
    expect(schedule[0].dueDate).toBe("2026-01-31");
    // 2026 is not a leap year; Jan 31 + 1 month overflows Feb → Mar 3.
    expect(schedule[1].dueDate).toBe("2026-03-03");
  });

  it("handles a single installment (count coerced to >= 1)", () => {
    const schedule = buildAdminInstallmentSchedule(500, 1, "2026-09-01");
    expect(schedule).toEqual([
      { installmentNumber: 1, amountDue: 500, dueDate: "2026-09-01" },
    ]);
  });

  it("rounds fractional totals to cents per installment", () => {
    const schedule = buildAdminInstallmentSchedule(100.01, 2, "2026-09-01");
    // 100.01 / 2 = 50.005 → 50.01 (round half up), last = 100.01 - 50.01 = 50.00
    expect(schedule.map((i) => i.amountDue)).toEqual([50.01, 50]);
    const sum = schedule.reduce((s, i) => s + i.amountDue, 0);
    expect(sum).toBeCloseTo(100.01, 2);
  });
});
