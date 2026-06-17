"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/app/components/Toast";
import { updateErrorStatus } from "./actions/updateErrorStatus";
import { retryInstallmentChargeFromError } from "./actions/retryInstallmentChargeFromError";
import { notifyDeveloperOfError } from "./actions/notifyDeveloperOfError";
import type {
  PaymentErrorLog as PaymentErrorLogRow,
  PaymentErrorOwnerLane,
  PaymentErrorSeverity,
  PaymentErrorStatus,
} from "@/types";

/* -------------------------------------------------------------------------- */
/* Admin view of payment_error_logs — list, detail, and resolution actions.    */
/* See docs/PAYMENT_ERROR_LOGGING_PLAN.md §6.                                   */
/* -------------------------------------------------------------------------- */

type LogRow = PaymentErrorLogRow & {
  registration_orders: {
    id: string;
    semesters: { name: string } | null;
    users: { first_name: string; last_name: string; email: string } | null;
  } | null;
};

/* Pill colour maps — reuse the payments-page token families. */
const SEVERITY_BADGE: Record<PaymentErrorSeverity, string> = {
  info: "bg-neutral-100 text-neutral-600",
  warning: "bg-lavender/20 text-lavender-text",
  critical: "bg-pale-rose/30 text-pale-rose-text",
};

const LANE_BADGE: Record<PaymentErrorOwnerLane, string> = {
  admin: "bg-mint/20 text-mint-text",
  dev: "bg-mauve/20 text-mauve-text",
};

const STATUS_BADGE: Record<PaymentErrorStatus, string> = {
  new: "bg-pale-rose/30 text-pale-rose-text",
  acknowledged: "bg-lavender/20 text-lavender-text",
  actioned: "bg-mauve/20 text-mauve-text",
  resolved: "bg-mint/20 text-mint-text",
  wont_fix: "bg-neutral-100 text-neutral-600",
};

const STATUS_FILTERS = ["new", "all", "acknowledged", "actioned", "resolved", "wont_fix"] as const;
const LANE_FILTERS = ["all", "admin", "dev"] as const;

const TERMINAL_STATUSES = new Set<PaymentErrorStatus>(["resolved", "wont_fix"]);

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* Shared button styles (match the payments-page action buttons). */
const BTN_SECONDARY: React.CSSProperties = {
  background: "var(--admin-surface-sub)",
  color: "var(--admin-text-muted)",
  border: "0.5px solid var(--admin-border)",
};
const BTN_ACCENT: React.CSSProperties = {
  background: "transparent",
  color: "var(--admin-sidebar-active)",
  border: "1px solid var(--admin-sidebar-active)",
};

export function PaymentErrorLog() {
  const toast = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("new");
  const [laneFilter, setLaneFilter] = useState<(typeof LANE_FILTERS)[number]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("payment_error_logs")
      .select(
        `id, created_at, origin, source, category, owner_lane, severity,
         order_id, installment_id, installment_number, family_id, dancer_id,
         transaction_id, payment_session_id, error_code, error_message, http_status,
         raw_payload, retry_of, retry_count, is_retryable, status,
         resolved_by, resolved_at, resolution_notes,
         registration_orders:order_id (
           id,
           semesters:semester_id ( name ),
           users:parent_id ( first_name, last_name, email )
         )`,
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      setLoadError(null);
      setRows((data ?? []) as unknown as LogRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    async function checkRole() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
      setIsSuperAdmin(data?.role === "super_admin");
    }
    checkRole();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (laneFilter !== "all" && r.owner_lane !== laneFilter) return false;
      return true;
    });
  }, [rows, statusFilter, laneFilter]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function who(r: LogRow): string {
    const u = r.registration_orders?.users;
    return u ? `${u.first_name} ${u.last_name}` : "—";
  }

  /* ── Action handlers ── */

  async function handleStatus(id: string, status: PaymentErrorStatus) {
    setPendingId(id);
    const res = await updateErrorStatus(id, status, notes[id]);
    setPendingId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      status === "acknowledged"
        ? "Acknowledged."
        : status === "resolved"
          ? "Marked resolved."
          : status === "wont_fix"
            ? "Marked won't fix."
            : "Updated.",
    );
    await load();
  }

  async function handleRetry(id: string) {
    setPendingId(id);
    const res = await retryInstallmentChargeFromError(id);
    setPendingId(null);
    if (res.success) {
      toast.success(`Charge succeeded — txn ${res.transactionId ?? ""}.`.trim());
    } else {
      toast.error(res.error ?? "Retry failed.");
    }
    await load();
  }

  async function handleNotify(id: string) {
    setPendingId(id);
    const res = await notifyDeveloperOfError(id);
    setPendingId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Developer notified.");
    await load();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1 rounded-full text-[12px] font-medium border transition-all"
              style={
                statusFilter === s
                  ? { background: "var(--admin-text)", color: "#fff", borderColor: "var(--admin-text)" }
                  : {
                      background: "var(--admin-surface)",
                      color: "var(--admin-text-muted)",
                      borderColor: "var(--admin-border)",
                    }
              }
            >
              {s === "all" ? "All" : s === "wont_fix" ? "Won't fix" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LANE_FILTERS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLaneFilter(l)}
              className="px-3 py-1 rounded-full text-[11px] font-medium border transition-all"
              style={
                laneFilter === l
                  ? { background: "var(--admin-sidebar-active)", color: "#fff", borderColor: "var(--admin-sidebar-active)" }
                  : {
                      background: "var(--admin-surface)",
                      color: "var(--admin-text-faint)",
                      borderColor: "var(--admin-border)",
                    }
              }
            >
              {l === "all" ? "Both lanes" : l === "admin" ? "Admin" : "Developer"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-center py-10 text-[13px]" style={{ color: "var(--admin-text-faint)" }}>
          Loading error log…
        </div>
      ) : loadError ? (
        <div className="text-center py-10 text-[13px]" style={{ color: "var(--admin-text-muted)" }}>
          Couldn’t load the error log: {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-[13px]" style={{ color: "var(--admin-text-faint)" }}>
          No payment errors match these filters. 🎉
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((r) => {
            const isOpen = expanded.has(r.id);
            const busy = pendingId === r.id;
            const isTerminal = TERMINAL_STATUSES.has(r.status);
            return (
              <div
                key={r.id}
                className="rounded-lg border"
                style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
              >
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
                >
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SEVERITY_BADGE[r.severity]}`}>
                    {r.severity}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${LANE_BADGE[r.owner_lane]}`}>
                    {r.owner_lane === "dev" ? "Developer" : "Admin"}
                  </span>
                  <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--admin-text)" }}>
                    {r.category}
                  </span>
                  <span className="text-[12px] truncate flex-1" style={{ color: "var(--admin-text-muted)" }}>
                    {r.error_code ?? r.error_message ?? "—"}
                  </span>
                  <span className="text-[11px] hidden sm:inline" style={{ color: "var(--admin-text-faint)" }}>
                    {who(r)}
                  </span>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--admin-text-faint)" }}>
                    {fmtWhen(r.created_at)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[r.status]}`}>
                    {r.status === "wont_fix" ? "won't fix" : r.status}
                  </span>
                </button>

                {/* Detail */}
                {isOpen && (
                  <div
                    className="px-3.5 pb-3 pt-1 text-[12px] flex flex-col gap-2 border-t"
                    style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-muted)" }}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 pt-2">
                      <Field label="Origin" value={r.origin} />
                      <Field label="Source" value={r.source} />
                      <Field label="Retryable" value={r.is_retryable ? "yes" : "no"} />
                      <Field label="Attempt #" value={r.retry_count ? String(r.retry_count) : "—"} />
                      <Field label="HTTP status" value={r.http_status != null ? String(r.http_status) : "—"} />
                      <Field label="Installment" value={r.installment_number != null ? String(r.installment_number) : "—"} />
                      <Field label="Semester" value={r.registration_orders?.semesters?.name ?? "—"} />
                      <Field label="Parent email" value={r.registration_orders?.users?.email ?? "—"} />
                      <Field label="Transaction" value={r.transaction_id ?? "—"} />
                    </div>

                    {r.error_message && (
                      <div>
                        <span className="font-semibold" style={{ color: "var(--admin-text)" }}>Message: </span>
                        {r.error_message}
                      </div>
                    )}

                    {r.resolution_notes && (
                      <div>
                        <span className="font-semibold" style={{ color: "var(--admin-text)" }}>Resolution: </span>
                        {r.resolution_notes}
                      </div>
                    )}

                    {/* Raw payload — super-admin only (integration internals). */}
                    {r.raw_payload != null && isSuperAdmin && (
                      <details>
                        <summary className="cursor-pointer text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                          Raw payload
                        </summary>
                        <pre
                          className="mt-1 p-2 rounded-md overflow-x-auto text-[11px] leading-snug"
                          style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
                        >
                          {JSON.stringify(r.raw_payload, null, 2)}
                        </pre>
                      </details>
                    )}

                    {/* Actions */}
                    {!isTerminal && (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.status === "new" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleStatus(r.id, "acknowledged")}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-50"
                              style={BTN_SECONDARY}
                            >
                              Acknowledge
                            </button>
                          )}

                          {r.installment_id && isSuperAdmin && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRetry(r.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-50"
                              style={BTN_ACCENT}
                            >
                              {busy ? "Retrying…" : "Retry charge"}
                            </button>
                          )}

                          {r.owner_lane === "dev" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleNotify(r.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-50"
                              style={BTN_SECONDARY}
                            >
                              Notify developer
                            </button>
                          )}
                        </div>

                        {/* Resolve / Won't-fix with an optional note */}
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            placeholder="Resolution note (optional)"
                            className="flex-1 min-w-[180px] px-2.5 py-1 rounded-md text-[12px] border outline-none"
                            style={{
                              background: "var(--admin-surface)",
                              borderColor: "var(--admin-border)",
                              color: "var(--admin-text)",
                            }}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleStatus(r.id, "resolved")}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-50"
                            style={{ background: "var(--admin-text)", color: "#fff", border: "1px solid var(--admin-text)" }}
                          >
                            Mark resolved
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleStatus(r.id, "wont_fix")}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-50"
                            style={BTN_SECONDARY}
                          >
                            Won’t fix
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </span>
      <span style={{ color: "var(--admin-text)" }}>{value}</span>
    </div>
  );
}
