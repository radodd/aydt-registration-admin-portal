"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import {
  getMyInstructorSessions,
  getAllClassSessions,
  formatTime,
  formatDay,
  formatDiscipline,
  type InstructorSession,
  type AllClassSession,
} from "@/queries/instructor";
import { MapPin, ChevronRight, Calendar } from "lucide-react";

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
  const [mine,     setMine]     = useState<InstructorSession[]>([]);
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
      getMyInstructorSessions(userId),
      getAllClassSessions(userId),
    ]).then(([mySessions, allSessions]) => {
      setMine(mySessions);
      setAll(allSessions);
      setLoading(false);
    });
  }, [userId]);

  const sessions = view === "mine" ? mine : all;

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Classes
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          {view === "mine"
            ? `${mine.length} session${mine.length !== 1 ? "s" : ""} assigned to you`
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
      ) : sessions.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-6 py-14 text-center"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
        >
          <p className="text-sm">
            {view === "mine"
              ? "You haven't been assigned to any sessions yet."
              : "No active class sessions found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {view === "mine"
            ? mine.map((s) => <MySessionCard key={s.sessionId} session={s} />)
            : all.map((s) => <AllSessionCard key={s.sessionId} session={s} />)}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* My Session Card                                                             */
/* -------------------------------------------------------------------------- */

function MySessionCard({ session }: { session: InstructorSession }) {
  const timeLabel =
    session.startTime
      ? `${formatTime(session.startTime)}${session.endTime ? ` – ${formatTime(session.endTime)}` : ""}`
      : null;

  return (
    <Link
      href={`/instructor/classes/${session.sessionId}`}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl group transition-colors"
      style={{
        background: "var(--admin-surface)",
        border: "1px solid var(--admin-border)",
        textDecoration: "none",
        display: "flex",
      }}
    >
      {/* Discipline color bar */}
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: "var(--admin-sidebar-active)" }}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p
            className="font-semibold text-base leading-snug"
            style={{ color: "var(--admin-text)" }}
          >
            {session.className}
          </p>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
          >
            {formatDiscipline(session.discipline)}
          </span>
          {session.isLead ? (
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
              {formatDay(session.dayOfWeek)} · {timeLabel}
            </span>
          )}
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin size={12} />
              {session.location}
            </span>
          )}
          {session.nextDate && (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              Next: {new Date(session.nextDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
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
