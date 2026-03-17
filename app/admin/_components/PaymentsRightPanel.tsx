"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { DollarSign, AlertTriangle } from "lucide-react";

type PanelInstallment = {
  id: string;
  amount_due: number;
  due_date: string;
  status: string;
  registration_batches: {
    users: { first_name: string; last_name: string } | null;
  } | null;
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDateShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PaymentsRightPanel() {
  const [expanded, setExpanded] = useState(false);
  const [outstanding, setOutstanding] = useState<number>(0);
  const [overdueItems, setOverdueItems] = useState<PanelInstallment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: unpaidRows } = await supabase
        .from("batch_payment_installments")
        .select("amount_due")
        .in("status", ["scheduled", "overdue"]);

      const total = (unpaidRows ?? []).reduce((s, r) => s + (r.amount_due ?? 0), 0);
      setOutstanding(total);

      const { data: overdueRows } = await supabase
        .from("batch_payment_installments")
        .select(
          `id, amount_due, due_date, status,
           registration_batches:batch_id(
             users:parent_id(first_name, last_name)
           )`
        )
        .eq("status", "overdue")
        .order("due_date", { ascending: true })
        .limit(5);

      setOverdueItems((overdueRows ?? []) as unknown as PanelInstallment[]);
      setLoading(false);
    }

    fetchData();
  }, []);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="shrink-0 relative"
      style={{
        width: expanded ? "222px" : "44px",
        minWidth: expanded ? "222px" : "44px",
        transition: "width 200ms ease, min-width 200ms ease",
        background: "var(--admin-surface)",
        borderLeft: "1px solid var(--admin-border)",
        overflow: "hidden",
      }}
    >
      {/* Collapsed icon strip */}
      <div
        className="absolute inset-0 flex flex-col items-center gap-6 py-5"
        style={{
          opacity: expanded ? 0 : 1,
          transition: "opacity 80ms ease",
          pointerEvents: expanded ? "none" : "auto",
        }}
      >
        <DollarSign size={14} style={{ color: "var(--admin-text-muted)" }} />
        <AlertTriangle size={14} style={{ color: "var(--admin-text-muted)" }} />
      </div>

      {/* Expanded content */}
      <div
        style={{
          width: "222px",
          opacity: expanded ? 1 : 0,
          transition: "opacity 150ms ease",
          pointerEvents: expanded ? "auto" : "none",
          overflowY: "auto",
          maxHeight: "calc(100vh - 52px)",
        }}
      >
        {/* Summary metrics */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Summary
          </p>
          {loading ? (
            <div className="flex justify-center py-2">
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p
                  className="text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Outstanding
                </p>
                <p className="text-lg font-medium mt-0.5" style={{ color: "var(--admin-text)", whiteSpace: "nowrap" }}>
                  {formatCurrency(outstanding)}
                </p>
              </div>
              <div>
                <p
                  className="text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Overdue
                </p>
                <p
                  className="text-lg font-medium mt-0.5"
                  style={{ color: overdueItems.length > 0 ? "#802818" : "var(--admin-text)" }}
                >
                  {overdueItems.length}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Overdue list */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <p
              className="text-[9.5px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--admin-text-faint)" }}
            >
              Overdue
            </p>
            {overdueItems.length > 0 && (
              <Link href="/admin/payments" className="text-[10px]" style={{ color: "var(--admin-sidebar-active)", whiteSpace: "nowrap" }}>
                View all
              </Link>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-2">
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
              />
            </div>
          ) : overdueItems.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
              No overdue payments
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {overdueItems.map((item) => {
                const user = item.registration_batches?.users;
                const name = user ? `${user.first_name} ${user.last_name}` : "Unknown";
                return (
                  <div key={item.id} className="border-b pb-2.5" style={{ borderColor: "var(--admin-border-sub)" }}>
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--admin-text)" }}>
                      {name}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px]" style={{ color: "#802818", fontFamily: "var(--font-outfit)" }}>
                        Due {formatDateShort(item.due_date)}
                      </p>
                      <p className="text-[12px] font-medium" style={{ color: "var(--admin-text)" }}>
                        {formatCurrency(item.amount_due)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
