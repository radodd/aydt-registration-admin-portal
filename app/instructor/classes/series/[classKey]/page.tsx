"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import {
  getClassSeriesByKey,
  formatTime,
  formatDay,
  formatDiscipline,
  type ClassSeriesPage,
  type ClassSeries,
  type SeriesStatus,
  type OccurrenceState,
} from "@/queries/instructor";
import { ArrowLeft, MapPin } from "lucide-react";

type Filter = "all" | SeriesStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "current",  label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past",     label: "Past" },
];

const STATE_STYLE: Record<OccurrenceState, { bg: string; color: string; border?: string; strike?: boolean }> = {
  done:      { bg: "#EAF3DE",                  color: "#3B6D11" },
  today:     { bg: "var(--admin-sidebar-active)", color: "#fff" },
  unmarked:  { bg: "#FAEEDA",                  color: "#854F0B" },
  future:    { bg: "var(--admin-bg, #F5F1EA)", color: "var(--admin-text-faint)", border: "1px solid var(--admin-border-sub)" },
  cancelled: { bg: "var(--admin-bg, #F5F1EA)", color: "var(--admin-text-faint)", strike: true },
};

const SERIES_BORDER: Record<SeriesStatus, string> = {
  current:  "var(--admin-sidebar-active)",
  upcoming: "#185FA5",
  past:     "#B4B2A9",
};

const SERIES_STATUS_PILL: Record<SeriesStatus, { bg: string; color: string; label: string }> = {
  current:  { bg: "#FBEAF0", color: "#993556", label: "CURRENT"  },
  upcoming: { bg: "#E6F1FB", color: "#185FA5", label: "UPCOMING" },
  past:     { bg: "var(--admin-surface-sub)", color: "var(--admin-text-muted)", label: "PAST" },
};

function fmtMonthDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDayOfMonth(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { day: "numeric" });
}
function fmtMonthShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short" });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ClassSeriesPage() {
  const { classKey } = useParams<{ classKey: string }>();
  const [data,    setData]    = useState<ClassSeriesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const result = await getClassSeriesByKey(classKey, user.id);
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [classKey]);

  const filteredSeries = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.series;
    return data.series.filter((s) => s.status === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    if (!data) return { all: 0, current: 0, upcoming: 0, past: 0 };
    return data.series.reduce(
      (acc, s) => {
        acc.all += 1;
        acc[s.status] += 1;
        return acc;
      },
      { all: 0, current: 0, upcoming: 0, past: 0 } as Record<Filter, number>,
    );
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 rounded-lg animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-12 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-40 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: "var(--admin-text-faint)" }}>
        Class not found.
      </div>
    );
  }

  const timeLabel = data.startTime
    ? `${formatTime(data.startTime)}${data.endTime ? ` – ${formatTime(data.endTime)}` : ""}`
    : null;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/instructor/classes"
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--admin-text-muted)" }}
      >
        <ArrowLeft size={16} />
        All my classes
      </Link>

      {/* Hero */}
      <div
        className="rounded-2xl px-5 py-5"
        style={{
          background: "var(--admin-surface)",
          border: "1px solid var(--admin-border)",
          borderLeft: "3px solid var(--admin-sidebar-active)",
        }}
      >
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
            {data.className}
          </h1>
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
          >
            {formatDiscipline(data.discipline)}
          </span>
          {data.isLead && (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "#FBEAF0", color: "#993556" }}
            >
              Lead
            </span>
          )}
        </div>
        <div className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
          {[
            `${formatDay(data.dayOfWeek)}s`,
            timeLabel,
          ].filter(Boolean).join(" · ")}
        </div>
        {data.location && (
          <div className="text-sm flex items-center gap-1.5 mt-1" style={{ color: "var(--admin-text-muted)" }}>
            <MapPin size={13} />
            {data.location}
          </div>
        )}

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4"
          style={{ borderTop: "1px solid var(--admin-border-sub)" }}
        >
          <HeroStat label="Series"           value={String(data.totals.seriesCount)} />
          <HeroStat label="Current students" value={String(data.totals.currentStudents)} />
          <HeroStat
            label="Avg attendance"
            value={data.totals.avgAttendancePct !== null ? `${data.totals.avgAttendancePct}%` : "—"}
            accent={data.totals.avgAttendancePct !== null && data.totals.avgAttendancePct >= 90 ? "good" : undefined}
          />
          <HeroStat label="Total taught" value={String(data.totals.totalTaught)} />
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-baseline justify-between mt-2 px-1">
        <span
          className="text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: "var(--admin-text-faint)" }}
        >
          Series
        </span>
        <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
          {data.totals.seriesCount} total · {counts.current} current
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={
              filter === f.value
                ? { background: "var(--admin-text)", color: "#fff" }
                : { background: "var(--admin-surface)", color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)" }
            }
          >
            {f.label}
            {f.value !== "all" && counts[f.value] > 0 && (
              <span className="ml-1 opacity-70">({counts[f.value]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap text-[11px] px-1" style={{ color: "var(--admin-text-faint)" }}>
        <Legend swatch="#EAF3DE" label="Done" />
        <Legend swatch="var(--admin-sidebar-active)" label="Today" />
        <Legend swatch="#FAEEDA" label="Not yet marked" />
        <Legend swatch="var(--admin-surface)" label="Future" border />
      </div>

      {/* Series cards */}
      {filteredSeries.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
        >
          No {filter === "all" ? "" : filter} series.
        </div>
      ) : (
        filteredSeries.map((s) => <SeriesCard key={s.sessionId} series={s} />)
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero stat                                                                   */
/* -------------------------------------------------------------------------- */

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: "good" }) {
  const color = accent === "good" ? "#3B6D11" : "var(--admin-text)";
  return (
    <div>
      <div className="text-xl font-semibold leading-none" style={{ color }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Legend                                                                      */
/* -------------------------------------------------------------------------- */

function Legend({ swatch, label, border }: { swatch: string; label: string; border?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        style={{
          display: "inline-block",
          width: 10, height: 10,
          borderRadius: 2,
          background: swatch,
          border: border ? "0.5px solid var(--admin-border)" : "none",
        }}
      />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Series card                                                                 */
/* -------------------------------------------------------------------------- */

function SeriesCard({ series }: { series: ClassSeries }) {
  const pill = SERIES_STATUS_PILL[series.status];

  // Mini calendar: only show for current series (mockup hides for upcoming/past)
  const showCalendar = series.status === "current";
  const dateRange = [series.startDate, series.endDate]
    .map(fmtMonthDay)
    .filter(Boolean)
    .join(" – ");

  // Group occurrences by month for the calendar label
  const calendarByMonth = useMemo(() => {
    const groups: { month: string; days: typeof series.occurrences }[] = [];
    for (const occ of series.occurrences) {
      const month = fmtMonthShort(occ.date);
      const last = groups[groups.length - 1];
      if (last && last.month === month) {
        last.days.push(occ);
      } else {
        groups.push({ month, days: [occ] });
      }
    }
    return groups;
  }, [series.occurrences]);

  // Next session label
  const nextOcc = series.occurrences.find((o) => o.state === "today")
    ?? series.occurrences.find((o) => o.state === "future");

  const nextLabel = (() => {
    if (series.status === "past") {
      return series.endDate ? <>Ended <strong style={{ color: "var(--admin-text)", fontWeight: 500 }}>{fmtMonthDay(series.endDate)}</strong></> : "Ended";
    }
    if (series.status === "upcoming") {
      return series.startDate ? <>Starts <strong style={{ color: "var(--admin-text)", fontWeight: 500 }}>{fmtMonthDay(series.startDate)}</strong> · enrollment open</> : "Upcoming";
    }
    if (nextOcc?.state === "today") {
      return <>Next: <strong style={{ color: "var(--admin-text)", fontWeight: 500 }}>Today</strong></>;
    }
    if (nextOcc) {
      return <>Next: <strong style={{ color: "var(--admin-text)", fontWeight: 500 }}>{fmtMonthDay(nextOcc.date)}</strong></>;
    }
    return null;
  })();

  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{
        background: "var(--admin-surface)",
        border: "1px solid var(--admin-border)",
        borderLeft: `3px solid ${SERIES_BORDER[series.status]}`,
        opacity: series.status === "past" ? 0.92 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-medium" style={{ color: "var(--admin-text)" }}>
              {series.semesterName}
            </span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide"
              style={{ background: pill.bg, color: pill.color }}
            >
              {pill.label}
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            {[
              dateRange,
              `${series.occurrenceStats.total} session${series.occurrenceStats.total === 1 ? "" : "s"}`,
              series.studentCount > 0 && `${series.studentCount} student${series.studentCount === 1 ? "" : "s"}`,
              series.attendancePct !== null && `${series.attendancePct}% attendance`,
            ]
              .filter(Boolean)
              .map((s, i, arr) => (
                <span key={i}>
                  {s}
                  {i < arr.length - 1 && (
                    <span style={{ color: "var(--admin-text-faint)", margin: "0 4px" }}>·</span>
                  )}
                </span>
              ))}
          </div>
        </div>
      </div>

      {showCalendar && series.occurrences.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center mt-3">
          {calendarByMonth.map((group, gi) => (
            <span key={gi} className="inline-flex items-center gap-1">
              <span className="text-[11px] mr-0.5" style={{ color: "var(--admin-text-faint)" }}>
                {group.month}
              </span>
              {group.days.map((d) => {
                const style = STATE_STYLE[d.state];
                return (
                  <span
                    key={d.id}
                    title={`${fmtMonthDay(d.date)} — ${d.state}`}
                    className="inline-flex items-center justify-center text-[10px] font-medium"
                    style={{
                      width: 28, height: 28,
                      borderRadius: 6,
                      background: style.bg,
                      color: style.color,
                      border: style.border ?? "none",
                      textDecoration: style.strike ? "line-through" : "none",
                    }}
                  >
                    {fmtDayOfMonth(d.date)}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-2 mt-3 pt-3"
        style={{ borderTop: "0.5px dashed var(--admin-border-sub)" }}
      >
        <div className="text-xs flex-1 min-w-0" style={{ color: "var(--admin-text-muted)" }}>
          {nextLabel}
        </div>
        {series.status === "past" ? (
          <Link
            href={`/instructor/classes/${series.sessionId}`}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              border: "1px solid var(--admin-border-sub)",
              color: "var(--admin-text)",
              background: "transparent",
              textDecoration: "none",
            }}
          >
            View report
          </Link>
        ) : (
          <>
            <Link
              href={`/instructor/classes/${series.sessionId}`}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                border: "1px solid var(--admin-border-sub)",
                color: "var(--admin-text)",
                background: "transparent",
                textDecoration: "none",
              }}
            >
              View roster
            </Link>
            {series.status === "current" && (
              <Link
                href={`/instructor/classes/${series.sessionId}?tab=attendance`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: "var(--admin-sidebar-active)",
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                Mark attendance
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
