"use client";

import { useEffect, useState } from "react";
import { getAllCredits } from "@/queries/admin";
import type { FamilyAccountCreditWithAdmin } from "@/types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function CreditsAdmin() {
  const [credits, setCredits] = useState<FamilyAccountCreditWithAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "available" | "used">("all");

  useEffect(() => {
    getAllCredits()
      .then(setCredits)
      .finally(() => setLoading(false));
  }, []);

  const filtered = credits.filter((c) => {
    if (filter === "available") return c.used_in_batch_id === null;
    if (filter === "used") return c.used_in_batch_id !== null;
    return true;
  });

  const totalIssued = credits.reduce((s, c) => s + c.amount, 0);
  const totalOutstanding = credits
    .filter((c) => c.used_in_batch_id === null)
    .reduce((s, c) => s + c.amount, 0);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-neutral-500">
          Loading credits…
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900">Credits</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Account credits issued to families and their usage history.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="flex gap-3 shrink-0">
          <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 text-right">
            <p className="text-xs text-neutral-400 mb-0.5">Total issued</p>
            <p className="text-lg font-semibold text-neutral-900">{fmt$(totalIssued)}</p>
          </div>
          {totalOutstanding > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-right">
              <p className="text-xs text-green-600 mb-0.5">Outstanding</p>
              <p className="text-lg font-semibold text-green-700">{fmt$(totalOutstanding)}</p>
            </div>
          )}
        </div>
      </header>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "available", "used"] as const).map((f) => {
          const count =
            f === "all" ? credits.length
            : f === "available" ? credits.filter((c) => c.used_in_batch_id === null).length
            : credits.filter((c) => c.used_in_batch_id !== null).length;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-neutral-900 text-white"
                  : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Credit list */}
      {filtered.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-10 text-center text-neutral-500">
          No credits found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((credit) => (
            <CreditDetailRow key={credit.id} credit={credit} showFamily />
          ))}
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared credit row — also used by the per-family modal in families/page.tsx  */
/* -------------------------------------------------------------------------- */

export function CreditDetailRow({
  credit,
  showFamily = false,
}: {
  credit: FamilyAccountCreditWithAdmin;
  showFamily?: boolean;
}) {
  const isUsed = credit.used_in_batch_id !== null;
  const adminName = credit.issued_by_admin
    ? `${credit.issued_by_admin.first_name} ${credit.issued_by_admin.last_name}`
    : "—";
  const familyName = (credit.families as any)?.family_name ?? null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl px-4 py-3 border bg-neutral-50 border-neutral-200">
      <div className="flex items-start gap-3">
        {/* Status badge */}
        <span
          className={`mt-0.5 shrink-0 px-3 py-1 text-xs font-medium rounded-full ${
            isUsed
              ? "bg-neutral-100 text-neutral-500"
              : "bg-green-100 text-green-700"
          }`}
        >
          {isUsed ? "Used" : "Available"}
        </span>

        {/* Detail block */}
        <div className="text-sm space-y-0.5">
          {showFamily && familyName && (
            <p className="font-semibold text-neutral-900">{familyName}</p>
          )}
          <p className={showFamily && familyName ? "text-neutral-600" : "font-medium text-neutral-900"}>
            {fmt$(credit.amount)}
          </p>
          <p className="text-xs text-neutral-500">
            Issued {fmtDate(credit.created_at)} · by {adminName}
          </p>
          {credit.reason && (
            <p className="text-xs text-neutral-400 italic">{credit.reason}</p>
          )}
        </div>
      </div>

      {/* Right side — used info */}
      {isUsed && credit.used_at && (
        <p className="text-xs text-neutral-400 text-right shrink-0">
          Applied<br />
          {fmtDate(credit.used_at)}
        </p>
      )}
    </div>
  );
}
