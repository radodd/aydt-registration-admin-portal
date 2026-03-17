"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { markInstallmentPaid } from "./actions/markInstallmentPaid";
import { issueAccountCredit } from "@/app/admin/credits/actions/issueAccountCredit";
import { PaymentsRightPanel } from "@/app/admin/_components/PaymentsRightPanel";

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

  // Issue credit modal state
  const [creditBatch, setCreditBatch] = useState<{ id: string; familyId: string | null; parentName: string } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditError, setCreditError] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  function openCreditModal(batch: BatchRow) {
    const parent = batch.users as any;
    const name = parent ? `${parent.first_name} ${parent.last_name}` : "Unknown";
    setCreditBatch({ id: batch.id, familyId: batch.family_id, parentName: name });
    setCreditAmount("");
    setCreditReason("");
    setCreditError("");
  }

  function closeCreditModal() {
    setCreditBatch(null);
    setCreditAmount("");
    setCreditReason("");
    setCreditError("");
  }

  async function handleIssueCredit() {
    if (!creditBatch?.familyId) {
      setCreditError("No family associated with this batch.");
      return;
    }
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      setCreditError("Please enter a valid amount greater than $0.");
      return;
    }
    setCreditSubmitting(true);
    setCreditError("");
    const result = await issueAccountCredit({
      familyId: creditBatch.familyId,
      amount,
      reason: creditReason || undefined,
      sourceBatchId: creditBatch.id,
    });
    setCreditSubmitting(false);
    if (result.error) {
      setCreditError(result.error);
      return;
    }
    closeCreditModal();
    setToast(`Credit of ${formatCurrency(amount)} issued to ${creditBatch.parentName}.`);
    setTimeout(() => setToast(null), 5000);
  }

  const overdueCount = batches.reduce(
    (sum, b) =>
      sum +
      b.batch_payment_installments.filter((i) => i.status === "overdue")
        .length,
    0,
  );

  if (loading) {
    return (
      <div className="flex gap-0 -mx-8 -my-8" style={{ minHeight: "calc(100vh - 52px)" }}>
        <main className="flex-1 px-8 py-10">
          <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-neutral-500">
            Loading payments…
          </div>
        </main>
        <PaymentsRightPanel />
      </div>
    );
  }

  return (
    <div className="flex gap-0 -mx-8 -my-8" style={{ minHeight: "calc(100vh - 52px)" }}>
    <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Issue Credit Modal */}
      {creditBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Issue Account Credit</h2>
            <p className="text-sm text-neutral-500">
              Credit will be added to <strong>{creditBatch.parentName}</strong>&apos;s family account and can be applied toward any future registration.
            </p>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Credit amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={creditAmount}
                  onChange={(e) => { setCreditAmount(e.target.value); setCreditError(""); }}
                  className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Reason <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Missed class — no makeup available"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            {creditError && <p className="text-sm text-red-600">{creditError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={closeCreditModal}
                disabled={creditSubmitting}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueCredit}
                disabled={creditSubmitting || !creditAmount}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creditSubmitting ? "Issuing…" : "Issue Credit"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <button
                      type="button"
                      onClick={() => openCreditModal(batch)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      Issue Credit
                    </button>
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
    <PaymentsRightPanel />
    </div>
  );
}
