"use client";

import { useState } from "react";
import type { FamilyDetail, FamilyDetailParent, StoredPaymentMethod } from "@/types";
import { CreditDetailRow } from "@/app/admin/credits/page";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function cardNetworkLabel(scheme: string | null): string {
  if (!scheme) return "Card";
  const s = scheme.toLowerCase();
  if (s.includes("visa")) return "Visa";
  if (s.includes("mastercard") || s.includes("master")) return "Mastercard";
  if (s.includes("amex") || s.includes("american")) return "Amex";
  if (s.includes("discover")) return "Discover";
  return scheme;
}

const BATCH_BADGE: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-neutral-100 text-neutral-600",
};

const INSTALLMENT_BADGE: Record<string, string> = {
  scheduled: "bg-neutral-100 text-neutral-600",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  waived: "bg-purple-100 text-purple-700",
  processing: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
};

/* -------------------------------------------------------------------------- */
/* SavedPaymentMethodList                                                      */
/* -------------------------------------------------------------------------- */

function SavedPaymentMethodList({ methods }: { methods: StoredPaymentMethod[] }) {
  if (methods.length === 0) {
    return <p className="text-sm text-neutral-400">No saved payment methods.</p>;
  }
  return (
    <div className="space-y-2">
      {methods.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
        >
          <span className="text-xs font-mono bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded">
            {m.type === "card" ? cardNetworkLabel(m.card_scheme) : "ACH"}
          </span>
          <span className="text-sm text-neutral-700 flex-1">
            {m.type === "card"
              ? `•••• ${m.card_last4 ?? ""}${
                  m.expiration_month
                    ? ` · ${String(m.expiration_month).padStart(2, "0")}/${m.expiration_year}`
                    : ""
                }`
              : `•••• ${m.ach_last4 ?? ""} · ${m.ach_account_type ?? "Bank"}`}
          </span>
          {m.is_default && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">
              Default
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* OrderHistoryTable                                                           */
/* -------------------------------------------------------------------------- */

function OrderHistoryTable({ family }: { family: FamilyDetail }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (family.registration_orders.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-400 text-center">
        No orders found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        <span>Order</span>
        <span className="text-right">Total</span>
        <span className="text-right">Paid</span>
        <span className="text-right">Balance</span>
      </div>

      {family.registration_orders.map((batch) => {
        const isOpen = expanded === batch.id;
        const total = Number(batch.grand_total ?? 0);
        const paid = batch.amountPaid;
        const balance = total - paid;

        return (
          <div key={batch.id} className="border border-neutral-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : batch.id)}
              className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 bg-white hover:bg-neutral-50 text-sm transition-colors"
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-neutral-500">
                    #{batch.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      BATCH_BADGE[batch.status] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {batch.status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {batch.semester?.name ?? "—"} · {fmtDate(batch.created_at)}
                </div>
              </div>
              <span className="text-right font-medium">{fmt$(total)}</span>
              <span className="text-right text-green-700">{fmt$(paid)}</span>
              <span
                className={`text-right font-medium ${balance > 0 ? "text-red-600" : "text-neutral-500"}`}
              >
                {fmt$(balance)}
              </span>
            </button>

            {isOpen && batch.installments.length > 0 && (
              <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 space-y-2">
                {batch.installments.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          INSTALLMENT_BADGE[inst.status] ?? "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {inst.status}
                      </span>
                      <span className="text-neutral-600">
                        Installment {inst.installment_number} · Due {fmtDate(inst.due_date)}
                      </span>
                    </div>
                    <span className="font-medium">{fmt$(Number(inst.amount_due))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ParentDetailPanel                                                           */
/* -------------------------------------------------------------------------- */

export function ParentDetailPanel({
  parent,
  family,
  onEdit,
  onIssueCredit,
}: {
  parent: FamilyDetailParent;
  family: FamilyDetail;
  onEdit: () => void;
  onIssueCredit: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"orders" | "email">("orders");
  const isPrimary = parent.is_primary_parent;
  const primaryParent = family.users.find((u) => u.is_primary_parent);

  return (
    <div className="rounded-2xl border border-neutral-200 overflow-hidden">
      {/* ── Dark header bar ─────────────────────────────────────────── */}
      <div className={`${isPrimary ? "bg-primary-700" : "bg-neutral-700"} text-white px-6 py-4 flex items-center gap-4`}>
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold shrink-0">
          {initials(parent.first_name, parent.last_name)}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white leading-tight">
            {parent.first_name} {parent.last_name}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            {isPrimary ? "Primary parent" : "Guardian"} · {parent.status === "active" ? "Account active" : "No online account"}
          </p>
        </div>

        {/* Edit */}
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0"
        >
          Edit
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="divide-y divide-neutral-100">

        {/* Contact info grid */}
        <div className="px-6 py-5 grid grid-cols-2 gap-x-12 gap-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Cell phone
            </p>
            <p className="text-sm text-neutral-700">{parent.phone_number || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Email
            </p>
            <p className="text-sm text-neutral-700">{parent.email}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Online account
            </p>
            <p className="text-sm text-neutral-700">
              {parent.status === "active" ? (
                <span className="text-green-600">Active</span>
              ) : (
                "None"
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Role
            </p>
            <p className="text-sm text-neutral-700">
              {isPrimary ? "Primary parent" : "Guardian / Second parent"}
            </p>
          </div>
        </div>

        {/* Non-primary parent: note about order history */}
        {!isPrimary && primaryParent && (
          <div className="px-6 py-4 bg-neutral-50">
            <p className="text-sm text-neutral-500 italic">
              Order history is associated with the primary account (
              {primaryParent.first_name} {primaryParent.last_name}).
            </p>
          </div>
        )}

        {/* Primary parent: full financial sections */}
        {isPrimary && (
          <>
            {/* Account Credits */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Account credits</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {fmt$(family.creditBalance)} available
                  </p>
                </div>
                <button
                  onClick={onIssueCredit}
                  className="px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                >
                  Issue credit
                </button>
              </div>
              {family.credits.length === 0 ? (
                <p className="text-sm text-neutral-400">No credits issued yet.</p>
              ) : (
                <div className="space-y-2">
                  {family.credits.map((credit) => (
                    <CreditDetailRow key={credit.id} credit={credit} />
                  ))}
                </div>
              )}
            </div>

            {/* Saved Payment Methods */}
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm font-semibold text-neutral-900">Saved payment method</p>
              <SavedPaymentMethodList methods={parent.storedPaymentMethods} />
            </div>

            {/* Order & Email History Tabs */}
            <div>
              <div className="flex border-b border-neutral-200">
                <button
                  onClick={() => setActiveTab("orders")}
                  className={`px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === "orders"
                      ? "text-neutral-900 border-b-2 border-primary-600 -mb-px"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Order history
                </button>
                <button
                  onClick={() => setActiveTab("email")}
                  className={`px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === "email"
                      ? "text-neutral-900 border-b-2 border-primary-600 -mb-px"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Email history
                </button>
              </div>
              <div className="px-6 py-5">
                {activeTab === "orders" ? (
                  <OrderHistoryTable family={family} />
                ) : (
                  <p className="text-sm text-neutral-400 text-center py-4">
                    Email history coming soon.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
