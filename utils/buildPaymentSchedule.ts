import { InstallmentPreview } from "@/types";

type PaymentPlanType = "pay_in_full" | "deposit_50pct" | "auto_pay_monthly";

interface FeeConfigForSchedule {
  auto_pay_installment_count: number;
  auto_pay_admin_fee_monthly: number;
}

interface PaymentScheduleResult {
  amountDueNow: number;
  schedule: InstallmentPreview[];
}

/**
 * Builds the payment schedule given a plan type and grand total.
 *
 * - pay_in_full: single payment of grand_total due now
 * - deposit_50pct: 50% due now, 50% due 30 days before semester start
 *   (dueDate parameter = semester start date)
 * - auto_pay_monthly: total split evenly over installment_count months,
 *   starting from firstPaymentDate. Monthly admin fee added per installment.
 *
 * @param planType    The payment plan type selected by the family
 * @param grandTotal  The computed grand total (before auto-pay admin fee)
 * @param feeConfig   The semester's fee configuration
 * @param firstPaymentDate  ISO date string for first payment (YYYY-MM-DD)
 */
export function buildPaymentSchedule(
  planType: PaymentPlanType,
  grandTotal: number,
  feeConfig: FeeConfigForSchedule,
  firstPaymentDate: string,
): PaymentScheduleResult {
  if (planType === "pay_in_full") {
    return {
      amountDueNow: grandTotal,
      schedule: [
        {
          installmentNumber: 1,
          amountDue: grandTotal,
          dueDate: firstPaymentDate,
        },
      ],
    };
  }

  if (planType === "deposit_50pct") {
    const deposit = round2(grandTotal * 0.5);
    const balance = round2(grandTotal - deposit);
    const balanceDueDate = addDays(firstPaymentDate, 30);
    return {
      amountDueNow: deposit,
      schedule: [
        { installmentNumber: 1, amountDue: deposit, dueDate: firstPaymentDate },
        { installmentNumber: 2, amountDue: balance, dueDate: balanceDueDate },
      ],
    };
  }

  // auto_pay_monthly
  const count = feeConfig.auto_pay_installment_count;
  const adminFeePerInstallment = feeConfig.auto_pay_admin_fee_monthly;
  const basePerInstallment = round2(grandTotal / count);
  const schedule: InstallmentPreview[] = [];

  for (let i = 0; i < count; i++) {
    // Distribute any rounding remainder on the last installment
    const isLast = i === count - 1;
    const baseAmount = isLast
      ? round2(grandTotal - basePerInstallment * (count - 1))
      : basePerInstallment;
    const amountDue = round2(baseAmount + adminFeePerInstallment);

    schedule.push({
      installmentNumber: i + 1,
      amountDue,
      dueDate: addMonths(firstPaymentDate, i),
    });
  }

  return {
    amountDueNow: schedule[0]?.amountDue ?? 0,
    schedule,
  };
}

/**
 * Builds an admin-controlled installment schedule for the manual-registration
 * flow (meeting-plan #7). Unlike buildPaymentSchedule's auto_pay_monthly path,
 * the super-admin sets the count directly and the total is taken as-is (the
 * admin price override already reflects any proration / admin fee), so there is
 * NO per-installment admin fee added here.
 *
 * - Divides `total` evenly across `count` installments, rounding each to cents.
 * - Any rounding remainder lands on the LAST installment (matches
 *   buildPaymentSchedule + createRegistrations conventions, so charged sums
 *   reconcile exactly to `total`).
 * - Installment 1 is due on `firstPaymentDate` (charged when the card is stored
 *   at the hosted page); installments 2..N fall on monthly anniversaries.
 *
 * @param total             The effective total to split (after override/adjustments).
 * @param count             Number of installments (>= 1).
 * @param firstPaymentDate  ISO date string for installment 1 (YYYY-MM-DD).
 */
export function buildAdminInstallmentSchedule(
  total: number,
  count: number,
  firstPaymentDate: string,
): InstallmentPreview[] {
  const n = Math.max(1, Math.floor(count));
  const basePerInstallment = round2(total / n);
  const schedule: InstallmentPreview[] = [];

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const amountDue = isLast
      ? round2(total - basePerInstallment * (n - 1))
      : basePerInstallment;
    schedule.push({
      installmentNumber: i + 1,
      amountDue,
      dueDate: addMonths(firstPaymentDate, i),
    });
  }

  return schedule;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Add N days to an ISO date string, returns 'YYYY-MM-DD'. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add N calendar months to an ISO date string, returns 'YYYY-MM-DD'. */
function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
