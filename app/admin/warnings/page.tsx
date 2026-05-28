"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";
import { markWarningReviewed, markAllWarningsReviewed } from "./actions";
import Link from "next/link";

type WarningRow = {
  id: string;
  batch_id: string | null;
  enforcement: "soft_warn" | "hard_block";
  warning_type: string;
  message: string;
  is_reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
  dancer: { first_name: string; last_name: string } | null;
  family: { family_name: string } | null;
  session: { classes: { name: string } | null } | null;
  semester: { id: string; name: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  time_conflict:          "Schedule conflict",
  prerequisite_completed: "Prerequisite",
  concurrent_enrollment:  "Concurrent enrollment",
  teacher_recommendation: "Teacher recommendation",
  audition_required:      "Audition required",
  skill_qualification:    "Skill qualification",
};

export default function WarningsPage() {
  const [rows, setRows] = useState<WarningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);
  const [, startTransition] = useTransition();

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("enrollment_warnings")
      .select(`
        id, batch_id, enforcement, warning_type, message,
        is_reviewed, reviewed_at, created_at,
        dancer:dancers ( first_name, last_name ),
        family:families ( family_name ),
        session:class_meetings ( classes ( name ) ),
        semester:semesters ( id, name )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    setRows((data ?? []) as unknown as WarningRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const visible = rows.filter((r) => showReviewed || !r.is_reviewed);
  const unreviewedCount = rows.filter((r) => !r.is_reviewed).length;

  function handleMarkOne(id: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, is_reviewed: true } : r));
    startTransition(() => markWarningReviewed(id));
  }

  function handleMarkAll() {
    setRows((prev) => prev.map((r) => ({ ...r, is_reviewed: true })));
    startTransition(() => markAllWarningsReviewed());
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
            Enrollment Warnings
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            Flags triggered during registration — soft warnings let families proceed; hard blocks rejected the attempt.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              style={{
                background: "var(--admin-sidebar-active)",
                color: "#fff",
              }}
            >
              Mark all reviewed
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 flex-wrap">
        <StatCard label="Unreviewed" value={unreviewedCount} accent="#7A4E08" />
        <StatCard label="Hard blocks" value={rows.filter((r) => r.enforcement === "hard_block").length} accent="#8E2A23" />
        <StatCard label="Soft warnings" value={rows.filter((r) => r.enforcement === "soft_warn").length} accent="#3A3080" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }} />
        </div>
      ) : visible.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--admin-text-muted)" }}>
            {unreviewedCount === 0 ? "No warnings — all clear." : "No warnings to show."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "var(--admin-surface-sub)", borderBottom: "1px solid var(--admin-border)" }}>
                {["Type", "Dancer", "Class", "Semester", "Message", "Date", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--admin-text-faint)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const dancerName = row.dancer
                  ? `${row.dancer.first_name} ${row.dancer.last_name}`
                  : "—";
                const familyName = row.family?.family_name ?? null;
                const className = (row.session?.classes as any)?.name ?? "—";
                const semesterName = row.semester?.name ?? "—";
                const isHard = row.enforcement === "hard_block";

                return (
                  <tr
                    key={row.id}
                    style={{
                      background: row.is_reviewed
                        ? "transparent"
                        : isHard
                          ? "rgba(142,42,35,0.04)"
                          : "rgba(122,78,8,0.03)",
                      borderBottom: i < visible.length - 1 ? "1px solid var(--admin-border-sub)" : undefined,
                      opacity: row.is_reviewed ? 0.55 : 1,
                    }}
                  >
                    {/* Type badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{
                          background: isHard ? "rgba(142,42,35,0.12)" : "rgba(122,78,8,0.1)",
                          color: isHard ? "#8E2A23" : "#7A4E08",
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: isHard ? "#8E2A23" : "#7A4E08" }}
                        />
                        {isHard ? "Blocked" : "Warning"}
                      </span>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                        {TYPE_LABELS[row.warning_type] ?? row.warning_type}
                      </div>
                    </td>

                    {/* Dancer */}
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: "var(--admin-text)" }}>{dancerName}</div>
                      {familyName && (
                        <div className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>{familyName}</div>
                      )}
                    </td>

                    {/* Class */}
                    <td className="px-4 py-3" style={{ color: "var(--admin-text-muted)" }}>{className}</td>

                    {/* Semester */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.semester ? (
                        <Link
                          href={`/admin/semesters/${row.semester.id}`}
                          className="text-xs hover:underline"
                          style={{ color: "var(--admin-sidebar-active)" }}
                        >
                          {semesterName}
                        </Link>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>—</span>
                      )}
                    </td>

                    {/* Message */}
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs leading-relaxed" style={{ color: "var(--admin-text-muted)" }}>
                        {row.message}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--admin-text-faint)" }}>
                      {new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      {!row.is_reviewed ? (
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
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                          Reviewed
                        </span>
                      )}
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
