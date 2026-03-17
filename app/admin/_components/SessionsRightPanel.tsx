"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { CalendarDays, Clock } from "lucide-react";

type UpcomingSession = {
  id: string;
  day_of_week: string;
  start_time: string | null;
  classes: { name: string; discipline: string } | null;
  schedule_id: string | null;
};

function formatTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SessionsRightPanel() {
  const [expanded, setExpanded] = useState(false);
  const [todaySessions, setTodaySessions] = useState<UpcomingSession[]>([]);
  const [weekSessions, setWeekSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const today = new Date();
      const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
      const todayStr = today.toISOString().split("T")[0];

      const { data: todayRows } = await supabase
        .from("class_sessions")
        .select("id, day_of_week, start_time, schedule_id, classes(name, discipline)")
        .eq("day_of_week", dayName)
        .lte("start_date", todayStr)
        .gte("end_date", todayStr)
        .is("cancelled_at", null)
        .order("start_time");

      const nextWeekDays: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        nextWeekDays.push(d.toLocaleDateString("en-US", { weekday: "long" }));
      }
      const uniqueDays = Array.from(new Set(nextWeekDays));
      const endStr = new Date(today.getTime() + 7 * 86_400_000).toISOString().split("T")[0];

      const { data: weekRows } = await supabase
        .from("class_sessions")
        .select("id, day_of_week, start_time, schedule_id, classes(name, discipline)")
        .in("day_of_week", uniqueDays)
        .lte("start_date", endStr)
        .gte("end_date", todayStr)
        .is("cancelled_at", null)
        .order("start_time");

      const seenToday = new Set<string>();
      const uniqueToday = (todayRows ?? []).filter((s: any) => {
        const id = s.schedule_id ?? s.id;
        if (seenToday.has(id)) return false;
        seenToday.add(id);
        return true;
      });

      const seenWeek = new Set<string>();
      const uniqueWeek = (weekRows ?? []).filter((s: any) => {
        const id = s.schedule_id ?? s.id;
        if (seenWeek.has(id)) return false;
        seenWeek.add(id);
        return true;
      });

      setTodaySessions(uniqueToday as UpcomingSession[]);
      setWeekSessions(uniqueWeek as UpcomingSession[]);
      setLoading(false);
    }

    fetchData();
  }, []);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const byDay: Record<string, UpcomingSession[]> = {};
  for (const s of weekSessions) {
    if (!byDay[s.day_of_week]) byDay[s.day_of_week] = [];
    byDay[s.day_of_week].push(s);
  }
  const sortedDays = Object.keys(byDay).sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
  );

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
        <CalendarDays size={14} style={{ color: "var(--admin-text-muted)" }} />
        <Clock size={14} style={{ color: "var(--admin-text-muted)" }} />
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
        {/* Today's sessions */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Today — {todayLabel}
          </p>
          {loading ? (
            <div className="flex justify-center py-2">
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
              />
            </div>
          ) : todaySessions.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
              No sessions today
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {todaySessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span
                    className="text-[10.5px] shrink-0"
                    style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)", minWidth: "52px" }}
                  >
                    {formatTime(s.start_time)}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-[11.5px] truncate"
                      style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}
                    >
                      {(s.classes as any)?.name ?? "—"}
                    </p>
                    {(s.classes as any)?.discipline && (
                      <p
                        className="text-[10px] truncate"
                        style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
                      >
                        {(s.classes as any).discipline}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rest of week */}
        <div className="px-4 py-3">
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Rest of week
          </p>
          {loading ? (
            <div className="flex justify-center py-2">
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
              />
            </div>
          ) : sortedDays.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
              No more sessions this week
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedDays.map((day) => (
                <div key={day}>
                  <p
                    className="text-[10px] font-medium mb-1"
                    style={{ color: "var(--admin-text-muted)" }}
                  >
                    {day}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {byDay[day].map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span
                          className="text-[10.5px] shrink-0"
                          style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)", minWidth: "52px" }}
                        >
                          {formatTime(s.start_time)}
                        </span>
                        <p
                          className="text-[11px] truncate"
                          style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}
                        >
                          {(s.classes as any)?.name ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
