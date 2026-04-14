"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FamilyDetail, FamilyDetailBatch } from "@/types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const BATCH_STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending_payment: "bg-yellow-100 text-yellow-700",
  draft: "bg-neutral-100 text-neutral-500",
  cancelled: "bg-neutral-100 text-neutral-500",
};

const INSTALLMENT_STATUS_BADGE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-600",
  pending: "bg-yellow-100 text-yellow-700",
  upcoming: "bg-neutral-100 text-neutral-500",
};

function StatusPill({
  status,
  map,
}: {
  status: string;
  map: Record<string, string>;
}) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
        map[status] ?? "bg-neutral-100 text-neutral-500"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* BatchCard                                                                   */
/* -------------------------------------------------------------------------- */

function BatchCard({ batch }: { batch: FamilyDetailBatch }) {
  const total = Number(batch.grand_total ?? 0);
  const balance = total - batch.amountPaid;
  const hasInstallments = batch.installments.length > 0;
  const overdueCount = batch.installments.filter((i) => i.status === "overdue").length;
  const isInstallmentPlan =
    batch.payment_plan_type === "installment" || hasInstallments;
  const hasBody = hasInstallments || batch.status === "confirmed";
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-200 overflow-hidden">
      {/* ── Batch header ────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-neutral-50 ${open ? "border-b border-neutral-200" : ""} ${hasBody ? "cursor-pointer select-none" : ""}`}
        onClick={hasBody ? () => setOpen((v) => !v) : undefined}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-neutral-900">
              {batch.semester?.name ?? "Unknown semester"}
            </p>
            <StatusPill status={batch.status} map={BATCH_STATUS_BADGE} />
            {isInstallmentPlan && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                installment plan
              </span>
            )}
            {overdueCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">
                {overdueCount} overdue
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            {batch.parent
              ? `${batch.parent.first_name} ${batch.parent.last_name}`
              : "—"}
            {batch.confirmed_at
              ? ` · confirmed ${fmtDate(batch.confirmed_at)}`
              : batch.created_at
              ? ` · created ${fmtDate(batch.created_at)}`
              : ""}
          </p>
        </div>

        {/* Financials + chevron */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Total
            </p>
            <p className="text-sm font-semibold text-neutral-900">{fmt$(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Paid
            </p>
            <p className="text-sm font-semibold text-neutral-900">
              {fmt$(batch.amountPaid)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Balance
            </p>
            <p
              className={`text-sm font-semibold ${
                balance > 0 ? "text-red-500" : "text-neutral-900"
              }`}
            >
              {fmt$(balance)}
            </p>
          </div>
          {hasBody && (
            <ChevronDown
              size={14}
              className="text-neutral-400 transition-transform duration-150"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          )}
        </div>
      </div>

      {/* ── Installments table ──────────────────────────────────────────── */}
      {open && hasInstallments && (
        <div>
          <div className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            <span>#</span>
            <span>Due date</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Status</span>
            <span className="text-right">Paid on</span>
          </div>
          {batch.installments.map((inst) => (
            <div
              key={inst.id}
              className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] gap-3 items-center px-4 py-2.5 border-b border-neutral-100 last:border-b-0 text-sm bg-white"
            >
              <span className="text-xs font-medium text-neutral-400">
                {inst.installment_number}
              </span>
              <span className="text-neutral-700">{fmtDate(inst.due_date)}</span>
              <span className="font-medium text-neutral-900 text-right">
                {fmt$(Number(inst.amount_due))}
              </span>
              <div className="flex justify-end">
                <StatusPill status={inst.status} map={INSTALLMENT_STATUS_BADGE} />
              </div>
              <span className="text-neutral-400 text-xs text-right whitespace-nowrap">
                {inst.paid_at ? fmtDate(inst.paid_at) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Full-pay confirmation line (no installments) ─────────────────── */}
      {open && !hasInstallments && batch.status === "confirmed" && (
        <div className="px-4 py-3 text-sm text-neutral-500 bg-white">
          Paid in full on {fmtDate(batch.confirmed_at ?? batch.created_at)}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BillingHistorySection                                                       */
/* -------------------------------------------------------------------------- */

export function BillingHistorySection({ family }: { family: FamilyDetail }) {
  const batches = family.registration_batches;

  const totalBilled = batches.reduce((s, b) => s + Number(b.grand_total ?? 0), 0);
  const totalPaid = batches.reduce((s, b) => s + b.amountPaid, 0);
  const totalBalance = totalBilled - totalPaid;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Registration &amp; Billing
        </h2>
        {batches.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">
              Billed{" "}
              <span className="font-semibold text-neutral-900">
                {fmt$(totalBilled)}
              </span>
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">
              Paid{" "}
              <span className="font-semibold text-neutral-900">
                {fmt$(totalPaid)}
              </span>
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">
              Balance{" "}
              <span
                className={`font-semibold ${
                  totalBalance > 0 ? "text-red-500" : "text-neutral-900"
                }`}
              >
                {fmt$(totalBalance)}
              </span>
            </span>
          </div>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-400 text-center">
          No registration history yet.
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} />
          ))}
        </div>
      )}
    </section>
  );
}
