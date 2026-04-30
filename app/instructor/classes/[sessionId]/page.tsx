"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  getInstructorSessionDetail,
  getSessionRoster,
  formatTime,
  formatDay,
  formatDiscipline,
  calcAge,
  type SessionDetail,
  type RosterEntry,
} from "@/queries/instructor";
import {
  ArrowLeft,
  MapPin,
  Mail,
  ChevronRight,
  User,
  Copy,
  Check,
} from "lucide-react";
import { AttendanceTab } from "./AttendanceTab";

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

type Tab = "roster" | "attendance";

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams?.get("tab") === "attendance" ? "attendance" : "roster";

  const [session,      setSession]      = useState<SessionDetail | null>(null);
  const [roster,       setRoster]       = useState<RosterEntry[]>([]);
  const [tab,          setTab]          = useState<Tab>(initialTab);
  const [loading,      setLoading]      = useState(true);
  const [emailsCopied, setEmailsCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    Promise.all([
      getInstructorSessionDetail(sessionId),
      getSessionRoster(sessionId),
    ]).then(([detail, rosterData]) => {
      setSession(detail);
      setRoster(rosterData);
      setLoading(false);
    });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 rounded-lg animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: "var(--admin-text-faint)" }}>
        Session not found.
      </div>
    );
  }

  const timeLabel = session.startTime
    ? `${formatTime(session.startTime)}${session.endTime ? ` – ${formatTime(session.endTime)}` : ""}`
    : null;

  const lead = session.instructors.find((i) => i.isLead);

  return (
    <>
      <div className="space-y-5">
        {/* ── Back button ──────────────────────────────────────────── */}
        <Link
          href="/instructor/classes"
          className="flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: "var(--admin-text-muted)", textDecoration: "none", width: "fit-content" }}
        >
          <ArrowLeft size={16} />
          Classes
        </Link>

        {/* ── Session header ───────────────────────────────────────── */}
        <div
          className="rounded-2xl px-5 py-5"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          <div className="flex items-start gap-2 flex-wrap mb-2">
            <h1
              className="text-xl font-semibold leading-snug"
              style={{ color: "var(--admin-text)" }}
            >
              {session.className}
            </h1>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
            >
              {formatDiscipline(session.discipline)}
            </span>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
              style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
            >
              {session.division.replace(/_/g, " ")}
            </span>
          </div>

          <div className="space-y-1 text-sm" style={{ color: "var(--admin-text-muted)" }}>
            {timeLabel && (
              <p>{formatDay(session.dayOfWeek)} · {timeLabel}</p>
            )}
            {session.location && (
              <p className="flex items-center gap-1.5">
                <MapPin size={13} />
                {session.location}
              </p>
            )}
          </div>

          {/* Instructor list */}
          {session.instructors.length > 0 && (
            <div className="mt-3 pt-3 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--admin-border-sub)" }}>
              {session.instructors.map((i) => (
                <span
                  key={i.userId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={
                    i.isLead
                      ? { background: "#FDF2F1", color: "var(--admin-sidebar-active)" }
                      : { background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }
                  }
                >
                  <User size={11} />
                  {i.firstName} {i.lastName}
                  {i.isLead && <span className="opacity-60 font-normal">· Lead</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div
          className="grid grid-cols-2 rounded-xl p-1"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          {(["roster", "attendance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="py-2.5 text-sm font-medium capitalize rounded-lg transition-colors"
              style={
                tab === t
                  ? { background: "var(--admin-sidebar-active)", color: "#fff" }
                  : { background: "transparent", color: "var(--admin-text-muted)" }
              }
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────── */}
        {tab === "roster" ? (
          <RosterTab roster={roster} sessionId={sessionId} />
        ) : (
          session && <AttendanceTab session={session} roster={roster} />
        )}

        {/* ── Message Families ───────────────────────────────────── */}
        {roster.length > 0 && (
          <div
            className="rounded-2xl px-5 py-4 mt-2"
            style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--admin-text-faint)" }}>
              Message Families
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* mailto: link — opens device email app with all parents BCC'd */}
              <a
                href={`mailto:?bcc=${roster.map((e) => e.parent?.email).filter(Boolean).join(",")}&subject=${encodeURIComponent(session?.className ?? "Class Update")}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--admin-sidebar-active)", color: "#fff", textDecoration: "none", minHeight: "44px" }}
              >
                <Mail size={14} />
                Open in Email App
              </a>
              {/* Copy all emails */}
              <button
                onClick={() => {
                  const emails = roster.map((e) => e.parent?.email).filter(Boolean).join(", ");
                  navigator.clipboard.writeText(emails);
                  setEmailsCopied(true);
                  setTimeout(() => setEmailsCopied(false), 2000);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text)", border: "1px solid var(--admin-border)", minHeight: "44px" }}
              >
                {emailsCopied ? <Check size={14} /> : <Copy size={14} />}
                {emailsCopied ? "Copied!" : "Copy Emails"}
              </button>
            </div>
          </div>
        )}
      </div>

    </>
  );
}

/* -------------------------------------------------------------------------- */
/* RosterTab                                                                   */
/* -------------------------------------------------------------------------- */

function RosterTab({
  roster,
  sessionId,
}: {
  roster:    RosterEntry[];
  sessionId: string;
}) {
  if (roster.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm"
        style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
      >
        No students enrolled in this session.
      </div>
    );
  }

  // Class-level term avg: mean of per-dancer pcts that have any attendance.
  const pcts = roster
    .map((r) => r.termAttendancePct)
    .filter((p): p is number => p !== null);
  const avgPct = pcts.length > 0
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between px-1 mb-1">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
          {roster.length} student{roster.length !== 1 ? "s" : ""} enrolled
        </p>
        {avgPct !== null && (
          <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
            Term avg attendance · {avgPct}%
          </p>
        )}
      </div>

      {roster.map((entry) => {
        const age = calcAge(entry.dancer.birthDate);
        const initials = `${entry.dancer.firstName[0]}${entry.dancer.lastName[0]}`.toUpperCase();
        const pct = entry.termAttendancePct;
        const pctColor = pct === null ? "var(--admin-text-faint)"
          : pct >= 90 ? "var(--admin-text)"
          : pct >= 80 ? "#854F0B"
          : "#A32D2D";

        return (
          <Link
            key={entry.registrationId}
            href={`/instructor/classes/${sessionId}/students/${entry.dancer.id}`}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors active:scale-[0.99]"
            style={{
              background: "var(--admin-surface)",
              border: "1px solid var(--admin-border)",
              minHeight: "64px",
              textDecoration: "none",
            }}
          >
            <div
              className="flex items-center justify-center rounded-full text-sm font-semibold shrink-0"
              style={{
                width: 36, height: 36,
                background: "var(--admin-surface-sub)",
                color: "var(--admin-sidebar-active)",
              }}
            >
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm" style={{ color: "var(--admin-text)" }}>
                {entry.dancer.firstName} {entry.dancer.lastName}
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--admin-text-muted)" }}>
                {[
                  age !== null && `Age ${age}`,
                  entry.dancer.grade && `Grade ${entry.dancer.grade}`,
                  entry.parent && `${entry.parent.firstName} ${entry.parent.lastName}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <div className="text-right shrink-0">
              <div className="text-sm font-medium" style={{ color: pctColor }}>
                {pct !== null ? `${pct}%` : "—"}
              </div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
                attendance
              </div>
            </div>

            <ChevronRight
              size={16}
              className="shrink-0"
              style={{ color: "var(--admin-text-faint)" }}
            />
          </Link>
        );
      })}
    </div>
  );
}

