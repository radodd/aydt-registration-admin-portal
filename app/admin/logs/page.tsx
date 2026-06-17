"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";
import { markPromotionEventReviewed, markAllPromotionEventsReviewed } from "./actions";
import Link from "next/link";

/**
 * Admin Logs — the auto-promotion event + error feed (table
 * `waitlist_promotion_events`). Read-only diagnostics: every offer/claim/roll/
 * reopen step, the manual-fallback hand-offs, and any engine error with its
 * `detail` payload so an admin can see exactly what happened and how to address
 * it. Modeled on app/admin/warnings/page.tsx.
 */

type EventRow = {
  id: string;
  event_type: string;
  severity: "info" | "warn" | "error";
  message: string;
  detail: Record<string, unknown> | null;
  is_reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
  class: { name: string } | null;
  semester: { id: string; name: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  seat_freed:              "Seat freed",
  offer_created:           "Offer created",
  offer_sent:              "Offer sent",
  offer_reminder_sent:     "Reminder sent",
  offer_claimed:           "Claimed",
  offer_expired:           "Offer expired",
  rolled_to_next:          "Rolled to next",
  queue_emptied:           "Queue emptied",
  reopened_to_public:      "Reopened to public",
  manual_fallback_flagged: "Needs manual assign",
  manual_assigned:         "Manually assigned",
  error:                   "Error",
};

// severity → [text color, dot/badge bg, row tint]
const SEVERITY_TONE: Record<EventRow["severity"], { fg: string; bg: string; tint: string }> = {
  error: { fg: "#8E2A23", bg: "rgba(142,42,35,0.12)", tint: "rgba(142,42,35,0.04)" },
  warn:  { fg: "#7A4E08", bg: "rgba(122,78,8,0.1)",   tint: "rgba(122,78,8,0.03)" },
  info:  { fg: "#3A3080", bg: "rgba(58,48,128,0.1)",  tint: "transparent" },
};

export default function LogsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [, startTransition] = useTransition();

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("waitlist_promotion_events")
      .select(`
        id, event_type, severity, message, detail,
        is_reviewed, reviewed_at, created_at,
        class:classes ( name ),
        semester:semesters ( id, name )
      `)
      .order("created_at", { ascending: false })
      .limit(300);

    setRows((data ?? []) as unknown as EventRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const visible = rows.filter(
    (r) =>
      (showReviewed || !r.is_reviewed) &&
      (!errorsOnly || r.severity === "error"),
  );
  const errorCount = rows.filter((r) => r.severity === "error").length;
  const warnCount = rows.filter((r) => r.severity === "warn").length;
  const unreviewedCount = rows.filter((r) => !r.is_reviewed).length;

  function handleMarkOne(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_reviewed: true } : r)));
    startTransition(() => markPromotionEventReviewed(id));
  }

  function handleMarkAll() {
    setRows((prev) => prev.map((r) => ({ ...r, is_reviewed: true })));
    startTransition(() => markAllPromotionEventsReviewed());
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
            Auto-Promotion Logs
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            Waitlist offer lifecycle, manual hand-offs, and engine errors. Expand a row for full detail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setErrorsOnly((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: errorsOnly ? "rgba(142,42,35,0.1)" : "transparent",
              border: "1px solid var(--admin-border)",
              color: errorsOnly ? "#8E2A23" : "var(--admin-text-muted)",
            }}
          >
            {errorsOnly ? "All events" : "Errors only"}
          </button>
          <button
            type="button"
            onClick={() => setShowReviewed((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: showReviewed ? "var(--admin-surface-sub)" : "transparent",
              border: "1px solid var(--admin-border)",
              color: "var(--admin-text-muted)",
            }}
          >
            {showReviewed ? "Hide reviewed" : "Show reviewed"}
          </button>
          {unreviewedCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "var(--admin-sidebar-active)", color: "#fff" }}
            >
              Mark all reviewed
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 flex-wrap">
        <StatCard label="Errors" value={errorCount} accent="#8E2A23" />
        <StatCard label="Warnings" value={warnCount} accent="#7A4E08" />
        <StatCard label="Events" value={rows.length} accent="#3A3080" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--admin-text-muted)" }}>
            {rows.length === 0 ? "No promotion activity yet." : "No events to show."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "var(--admin-surface-sub)", borderBottom: "1px solid var(--admin-border)" }}>
                {["Event", "Class", "Semester", "Message", "Date", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--admin-text-faint)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const tone = SEVERITY_TONE[row.severity];
                // Supabase to-one embeds can deserialize as object or 1-element array.
                const cls = Array.isArray(row.class) ? row.class[0] : row.class;
                const sem = Array.isArray(row.semester) ? row.semester[0] : row.semester;
                const className = cls?.name ?? "—";
                const semesterName = sem?.name ?? "—";
                const hasDetail = row.detail && Object.keys(row.detail).length > 0;

                return (
                  <tr
                    key={row.id}
                    style={{
                      background: row.is_reviewed ? "transparent" : tone.tint,
                      borderBottom: i < visible.length - 1 ? "1px solid var(--admin-border-sub)" : undefined,
                      opacity: row.is_reviewed ? 0.55 : 1,
                    }}
                  >
                    {/* Event badge */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tone.fg }} />
                        {TYPE_LABELS[row.event_type] ?? row.event_type}
                      </span>
                    </td>

                    {/* Class */}
                    <td className="px-4 py-3 align-top" style={{ color: "var(--admin-text-muted)" }}>
                      {className}
                    </td>

                    {/* Semester */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      {sem ? (
                        <Link
                          href={`/admin/semesters/${sem.id}`}
                          className="text-xs hover:underline"
                          style={{ color: "var(--admin-sidebar-active)" }}
                        >
                          {semesterName}
                        </Link>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>—</span>
                      )}
                    </td>

                    {/* Message (+ expandable detail) */}
                    <td className="px-4 py-3 max-w-xs align-top">
                      <p className="text-xs leading-relaxed" style={{ color: "var(--admin-text-muted)" }}>
                        {row.message}
                      </p>
                      {hasDetail && (
                        <details className="mt-1">
                          <summary
                            className="text-[11px] cursor-pointer select-none"
                            style={{ color: "var(--admin-sidebar-active)" }}
                          >
                            details
                          </summary>
                          <pre
                            className="mt-1 text-[10px] leading-snug rounded-md p-2 overflow-x-auto"
                            style={{
                              background: "var(--admin-surface-sub)",
                              border: "1px solid var(--admin-border-sub)",
                              color: "var(--admin-text-faint)",
                            }}
                          >
                            {JSON.stringify(row.detail, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs align-top" style={{ color: "var(--admin-text-faint)" }}>
                      {new Date(row.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>

                    {/* Action — only error/warn are triageable */}
                    <td className="px-4 py-3 text-right align-top">
                      {row.severity !== "info" && !row.is_reviewed ? (
                        <button
                          type="button"
                          onClick={() => handleMarkOne(row.id)}
                          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                          style={{
                            border: "1px solid var(--admin-border)",
                            color: "var(--admin-text-muted)",
                            background: "transparent",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-surface-sub)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          Reviewed
                        </button>
                      ) : row.is_reviewed ? (
                        <span className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                          Reviewed
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", minWidth: 120 }}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
      <div>
        <div className="text-xl font-bold" style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}>
          {value}
        </div>
        <div className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>{label}</div>
      </div>
    </div>
  );
}
