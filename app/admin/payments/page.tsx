"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { markInstallmentPaid } from "./actions/markInstallmentPaid";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type InstallmentRow = {
  id: string;
  installment_number: number;
  amount_due: number;
  due_date: string;
  status: "scheduled" | "paid" | "overdue" | "waived" | "processing";
  paid_at: string | null;
};

type BatchRow = {
  id: string;
  family_id: string | null;
  grand_total: number | null;
  tuition_total: number | null;
  registration_fee_total: number | null;
  family_discount_amount: number;
  auto_pay_admin_fee_total: number;
  payment_plan_type: string | null;
  amount_due_now: number | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  users: { first_name: string; last_name: string; email: string } | null;
  semesters: { name: string } | null;
  batch_payment_installments: InstallmentRow[];
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const BATCH_STATUS_BADGE: Record<string, string> = {
  pending_payment: "bg-mauve/20 text-mauve-text",
  confirmed: "bg-mint/20 text-mint-text",
  failed: "bg-pale-rose/30 text-pale-rose-text",
  refunded: "bg-neutral-100 text-neutral-600",
  partial: "bg-lavender/20 text-lavender-text",
};

const INSTALLMENT_BADGE: Record<string, string> = {
  scheduled: "bg-neutral-100 text-neutral-600",
  paid: "bg-mint/20 text-mint-text",
  overdue: "bg-pale-rose/30 text-pale-rose-text",
  waived: "bg-lavender/20 text-lavender-text",
  processing: "bg-mauve/20 text-mauve-text",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function PaymentsAdmin() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function loadBatches() {
    const supabase = createClient();
    const { data } = await supabase
      .from("registration_batches")
      .select(
        `id, family_id, grand_total, tuition_total, registration_fee_total,
         family_discount_amount, auto_pay_admin_fee_total, payment_plan_type,
         amount_due_now, status, created_at, confirmed_at,
         users:parent_id(first_name, last_name, email),
         semesters:semester_id(name),
         batch_payment_installments(id, installment_number, amount_due, due_date, status, paid_at)`,
      )
      .order("created_at", { ascending: false });

    setBatches((data as BatchRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMarkPaid(installmentId: string) {
    setMarkingPaid(installmentId);
    await markInstallmentPaid(installmentId);
    await loadBatches();
    setMarkingPaid(null);
  }

  const filteredBatches =
    statusFilter === "all"
      ? batches
      : batches.filter((b) => b.status === statusFilter);

  const overdueCount = batches.reduce(
    (sum, b) =>
      sum +
      b.batch_payment_installments.filter((i) => i.status === "overdue")
        .length,
    0,
  );

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-neutral-500">
          Loading payments…
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900">Payments</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Registration batches and payment installment status.
          </p>
        </div>
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
            {overdueCount} overdue installment{overdueCount !== 1 ? "s" : ""}
          </div>
        )}
      </header>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "pending_payment", "confirmed", "failed", "refunded"].map(
          (s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-neutral-900 text-white"
                  : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
              {s === "all" && ` (${batches.length})`}
              {s !== "all" &&
                ` (${batches.filter((b) => b.status === s).length})`}
            </button>
          ),
        )}
      </div>

      {/* Batch list */}
      {filteredBatches.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-10 text-center text-neutral-500">
          No registration batches found.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredBatches.map((batch) => {
            const parent = batch.users as any;
            const semester = batch.semesters as any;
            const installments = [
              ...(batch.batch_payment_installments ?? []),
            ].sort((a, b) => a.installment_number - b.installment_number);

            const batchOverdue = installments.some(
              (i) => i.status === "overdue",
            );

            return (
              <div
                key={batch.id}
                className={`bg-white border rounded-2xl shadow-sm p-6 space-y-5 ${
                  batchOverdue ? "border-red-200" : "border-neutral-200"
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {parent
                        ? `${parent.first_name} ${parent.last_name}`
                        : "Unknown parent"}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {parent?.email ?? "—"} ·{" "}
                      {semester?.name ?? "Unknown semester"}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Submitted{" "}
                      {new Date(batch.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {batch.confirmed_at &&
                        ` · Confirmed ${new Date(batch.confirmed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        BATCH_STATUS_BADGE[batch.status] ??
                        "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {batch.status.replace(/_/g, " ")}
                    </span>
                    {batch.grand_total != null && (
                      <span className="font-bold text-neutral-900 text-lg">
                        {formatCurrency(batch.grand_total)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pricing summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm bg-neutral-50 rounded-xl p-4">
                  <div>
                    <p className="text-xs text-neutral-400 mb-1">Plan</p>
                    <p className="font-medium text-neutral-800 capitalize">
                      {(batch.payment_plan_type ?? "—").replace(/_/g, " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-1">Tuition</p>
                    <p className="font-medium text-neutral-800">
                      {batch.tuition_total != null
                        ? formatCurrency(batch.tuition_total)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-1">
                      Family Discount
                    </p>
                    <p className="font-medium text-mint-text">
                      {batch.family_discount_amount > 0
                        ? `−${formatCurrency(batch.family_discount_amount)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-1">Due Today</p>
                    <p className="font-medium text-primary-700">
                      {batch.amount_due_now != null
                        ? formatCurrency(batch.amount_due_now)
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Installment schedule */}
                {installments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Payment Schedule
                    </p>
                    {installments.map((inst) => (
                      <div
                        key={inst.id}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                          inst.status === "overdue"
                            ? "bg-red-50 border-red-100"
                            : "bg-neutral-50 border-neutral-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              INSTALLMENT_BADGE[inst.status] ??
                              "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {inst.status}
                          </span>
                          <span className="text-sm text-neutral-700">
                            Payment {inst.installment_number} —{" "}
                            {formatDate(inst.due_date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-neutral-900">
                            {formatCurrency(inst.amount_due)}
                          </span>
                          {(inst.status === "scheduled" ||
                            inst.status === "overdue") && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(inst.id)}
                              disabled={markingPaid === inst.id}
                              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              {markingPaid === inst.id ? "Saving…" : "Mark Paid"}
                            </button>
                          )}
                          {inst.status === "paid" && inst.paid_at && (
                            <span className="text-xs text-neutral-400">
                              Paid{" "}
                              {new Date(inst.paid_at).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
