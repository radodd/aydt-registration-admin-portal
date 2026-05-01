"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import {
  getDashboardSessions,
  getMyInstructorSessions,
  formatTime,
  formatDiscipline,
  type DashboardSession,
  type InstructorSession,
} from "@/queries/instructor";
import { MapPin, ChevronRight, Search } from "lucide-react";

export default function InstructorDashboard() {
  const [firstName,   setFirstName]   = useState("");
  const [weekSessions, setWeekSessions] = useState<DashboardSession[]>([]);
  const [allSessions,  setAllSessions]  = useState<InstructorSession[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");

  const now      = new Date();
  const today    = now.toISOString().slice(0, 10);
  const hour     = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const [{ data: profile }, dashSessions, mySessions] = await Promise.all([
        supabase.from("users").select("first_name").eq("id", user.id).single(),
        getDashboardSessions(user.id),
        getMyInstructorSessions(user.id),
      ]);
      setFirstName(profile?.first_name ?? "");
      setWeekSessions(dashSessions);
      setAllSessions(mySessions);
      setLoading(false);
    });
  }, []);

  // ── Week grouping ──────────────────────────────────────────────────────────

  const todaySessions    = weekSessions.filter((s) => s.dates[0] === today);
  const upcomingSessions = weekSessions.filter((s) => s.dates[0] > today);

  const byDate: Record<string, DashboardSession[]> = {};
  for (const s of upcomingSessions) {
    const d = s.dates[0]!;
    (byDate[d] ??= []).push(s);
  }
  const upcomingDates = Object.keys(byDate).sort();
  const hasThisWeek   = todaySessions.length > 0 || upcomingSessions.length > 0;

  // ── All classes search ─────────────────────────────────────────────────────

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSessions;
    return allSessions.filter((s) =>
      [s.className, s.discipline, s.division].join(" ").toLowerCase().includes(q)
    );
  }, [allSessions, search]);

  return (
    <div className="space-y-8">
      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          {todayLabel}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl animate-pulse"
              style={{ height: 88, background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
            />
          ))}
        </div>
      ) : (
        <>
          {/* ── This week ──────────────────────────────────────────── */}
          {hasThisWeek ? (
            <section className="space-y-4">
              {todaySessions.length > 0 && (
                <div className="space-y-2.5">
                  <SectionLabel>Today</SectionLabel>
                  {todaySessions.map((s) => (
                    <WeekCard key={s.sessionId} session={s} isToday />
                  ))}
                </div>
              )}

              {upcomingDates.length > 0 && (
                <div className="space-y-4">
                  <SectionLabel>This week</SectionLabel>
                  {upcomingDates.map((date) => {
                    const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month:   "short",
                      day:     "numeric",
                    });
                    return (
                      <div key={date} className="space-y-2">
                        <p className="text-xs font-medium px-1" style={{ color: "var(--admin-text-muted)" }}>
                          {dayLabel}
                        </p>
                        {byDate[date].map((s) => (
                          <WeekCard key={s.sessionId} session={s} isToday={false} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <div
              className="rounded-2xl border border-dashed px-6 py-10 text-center"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
            >
              <p className="text-sm">No classes scheduled for the rest of this week.</p>
            </div>
          )}

          {/* ── All assigned classes ────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>All my classes</SectionLabel>
              <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                {allSessions.length} session{allSessions.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--admin-text-faint)" }}
              />
              <input
                type="text"
                placeholder="Search classes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none"
                style={{
                  background: "var(--admin-surface)",
                  border:     "1px solid var(--admin-border)",
                  color:      "var(--admin-text)",
                  fontSize:   "16px",
                }}
              />
            </div>

            {allSessions.length === 0 ? (
              <div
                className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm"
                style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
              >
                No classes assigned yet.
              </div>
            ) : filteredAll.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--admin-text-faint)" }}>
                No matching classes.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredAll.map((s) => (
                  <AllClassCard key={s.sessionId} session={s} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* WeekCard — today's or upcoming session card                                 */
/* -------------------------------------------------------------------------- */

function WeekCard({ session, isToday }: { session: DashboardSession; isToday: boolean }) {
  const timeLabel = session.startTime
    ? `${formatTime(session.startTime)}${session.endTime ? ` – ${formatTime(session.endTime)}` : ""}`
    : null;

  return (
    <Link
      href={`/instructor/classes/${session.sessionId}`}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors"
      style={{
        background:     isToday ? "#FDF2F1" : "var(--admin-surface)",
        border:         `1px solid ${isToday ? "var(--admin-sidebar-active)" : "var(--admin-border)"}`,
        textDecoration: "none",
        display:        "flex",
      }}
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: "var(--admin-sidebar-active)" }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-base leading-snug" style={{ color: "var(--admin-text)" }}>
            {session.className}
          </p>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
          >
            {formatDiscipline(session.discipline)}
          </span>
          <RoleBadge isLead={session.isLead} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-sm" style={{ color: "var(--admin-text-muted)" }}>
          {timeLabel && <span>{timeLabel}</span>}
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin size={11} />
              {session.location}
            </span>
          )}
        </div>
      </div>

      {isToday ? (
        <span
          className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "var(--admin-sidebar-active)", color: "#fff" }}
        >
          Attendance →
        </span>
      ) : (
        <ChevronRight size={18} className="shrink-0" style={{ color: "var(--admin-text-faint)" }} />
      )}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* AllClassCard — compact card for the "all classes" list                      */
/* -------------------------------------------------------------------------- */

function AllClassCard({ session }: { session: InstructorSession }) {
  const timeLabel = session.startTime
    ? `${formatTime(session.startTime)}${session.endTime ? ` – ${formatTime(session.endTime)}` : ""}`
    : null;

  const dayLabel = session.dayOfWeek.charAt(0).toUpperCase() + session.dayOfWeek.slice(1);

  return (
    <Link
      href={`/instructor/classes/${session.sessionId}`}
      className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-colors"
      style={{
        background:     "var(--admin-surface)",
        border:         "1px solid var(--admin-border)",
        textDecoration: "none",
        display:        "flex",
        opacity:        session.isActive ? 1 : 0.55,
      }}
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: session.isActive ? "var(--admin-sidebar-active)" : "var(--admin-border)" }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm leading-snug" style={{ color: "var(--admin-text)" }}>
            {session.className}
          </p>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
          >
            {formatDiscipline(session.discipline)}
          </span>
          <RoleBadge isLead={session.isLead} />
          {!session.isActive && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
              style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-faint)" }}
            >
              Inactive
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
          {dayLabel}
          {timeLabel && ` · ${timeLabel}`}
          {session.nextDate && (
            <span>
              {" · Next: "}
              {new Date(session.nextDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </p>
      </div>

      <ChevronRight size={16} className="shrink-0" style={{ color: "var(--admin-text-faint)" }} />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest px-1" style={{ color: "var(--admin-text-faint)" }}>
      {children}
    </p>
  );
}

function RoleBadge({ isLead }: { isLead: boolean }) {
  return isLead ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
      style={{ background: "rgba(142,42,35,0.12)", color: "var(--admin-sidebar-active)" }}
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
  );
}
