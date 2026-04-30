"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import {
  getMyClassGroups,
  getAllClassSessions,
  formatTime,
  formatDay,
  formatDiscipline,
  type MyClassGroup,
  type AllClassSession,
} from "@/queries/instructor";
import { MapPin, ChevronRight } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type View = "mine" | "all";

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function InstructorClassesPage() {
  const [view,     setView]     = useState<View>("mine");
  const [userId,   setUserId]   = useState<string | null>(null);
  const [mine,     setMine]     = useState<MyClassGroup[]>([]);
  const [all,      setAll]      = useState<AllClassSession[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Resolve current instructor's userId once
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  // Fetch both datasets when userId is known
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      getMyClassGroups(userId),
      getAllClassSessions(userId),
    ]).then(([myGroups, allSessions]) => {
      setMine(myGroups);
      setAll(allSessions);
      setLoading(false);
    });
  }, [userId]);

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Classes
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          {view === "mine"
            ? `${mine.length} class${mine.length !== 1 ? "es" : ""} you teach`
            : `${all.length} session${all.length !== 1 ? "s" : ""} across all classes`}
        </p>
      </div>

      {/* ── View toggle ──────────────────────────────────────────── */}
      <div
        className="inline-flex rounded-xl p-1"
        style={{ background: "var(--admin-surface-sub)", border: "1px solid var(--admin-border-sub)" }}
      >
        {(["mine", "all"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-4 py-1.5 text-sm font-medium rounded-lg transition-all"
            style={
              view === v
                ? {
                    background: "var(--admin-surface)",
                    color: "var(--admin-text)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }
                : { color: "var(--admin-text-muted)" }
            }
          >
            {v === "mine" ? "My Classes" : "All Classes"}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl animate-pulse"
              style={{ height: 96, background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
            />
          ))}
        </div>
      ) : (view === "mine" ? mine.length : all.length) === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-6 py-14 text-center"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
        >
          <p className="text-sm">
            {view === "mine"
              ? "You haven't been assigned to any classes yet."
              : "No active class sessions found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {view === "mine"
            ? mine.map((g) => <MyClassGroupCard key={g.classKey} group={g} />)
            : all.map((s) => <AllSessionCard key={s.sessionId} session={s} />)}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* My Class Group Card — one card per class name + day + start time, links to  */
/* the per-class series view.                                                  */
/* -------------------------------------------------------------------------- */

function MyClassGroupCard({ group }: { group: MyClassGroup }) {
  const timeLabel =
    group.startTime
      ? `${formatTime(group.startTime)}${group.endTime ? ` – ${formatTime(group.endTime)}` : ""}`
      : null;

  return (
    <Link
      href={`/instructor/classes/series/${group.classKey}`}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl group transition-colors"
      style={{
        background: "var(--admin-surface)",
        border: "1px solid var(--admin-border)",
        borderLeft: "3px solid var(--admin-sidebar-active)",
        textDecoration: "none",
        display: "flex",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p
            className="font-semibold text-base leading-snug"
            style={{ color: "var(--admin-text)" }}
          >
            {group.className}
          </p>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
          >
            {formatDiscipline(group.discipline)}
          </span>
          {group.isLead ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
              style={{ background: "#FDF2F1", color: "var(--admin-sidebar-active)" }}
            >
              Lead
            </span>
          ) : (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
              style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-faint)" }}
            >
              Assistant
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm" style={{ color: "var(--admin-text-muted)" }}>
          {timeLabel && (
            <span>
              {formatDay(group.dayOfWeek)}s · {timeLabel}
            </span>
          )}
          {group.location && (
            <span className="flex items-center gap-1">
              <MapPin size={12} />
              {group.location}
            </span>
          )}
          <span>
            {group.seriesCount} series
            {group.currentSeriesName ? ` · ${group.currentSeriesName}` : ""}
          </span>
        </div>
      </div>

      <ChevronRight
        size={18}
        className="shrink-0 transition-colors"
        style={{ color: "var(--admin-text-faint)" }}
      />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* All Classes Card                                                            */
/* -------------------------------------------------------------------------- */

function AllSessionCard({ session }: { session: AllClassSession }) {
  const timeLabel =
    session.startTime
      ? `${formatTime(session.startTime)}${session.endTime ? ` – ${formatTime(session.endTime)}` : ""}`
      : null;

  const lead = session.instructors.find((i) => i.isLead);
  const instructorLabel = lead
    ? `${lead.firstName} ${lead.lastName}${session.instructors.length > 1 ? ` +${session.instructors.length - 1}` : ""}`
    : session.instructors.length > 0
    ? `${session.instructors[0].firstName} ${session.instructors[0].lastName}`
    : "Unassigned";

  return (
    <Link
      href={`/instructor/classes/${session.sessionId}`}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl group transition-colors"
      style={{
        background: "var(--admin-surface)",
        border: `1px solid ${session.isMySession ? "var(--admin-sidebar-active)" : "var(--admin-border)"}`,
        textDecoration: "none",
        display: "flex",
        opacity: session.isActive ? 1 : 0.6,
      }}
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: session.isMySession ? "var(--admin-sidebar-active)" : "var(--admin-border)" }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="font-semibold text-base leading-snug" style={{ color: "var(--admin-text)" }}>
            {session.className}
          </p>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
          >
            {formatDiscipline(session.discipline)}
          </span>
          {session.isMySession && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
              style={{ background: "#FDF2F1", color: "var(--admin-sidebar-active)" }}
            >
              My Class
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm" style={{ color: "var(--admin-text-muted)" }}>
          {timeLabel && (
            <span>{formatDay(session.dayOfWeek)} · {timeLabel}</span>
          )}
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin size={12} />
              {session.location}
            </span>
          )}
          <span>{instructorLabel}</span>
        </div>
      </div>

      <ChevronRight size={18} className="shrink-0" style={{ color: "var(--admin-text-faint)" }} />
    </Link>
  );
}
