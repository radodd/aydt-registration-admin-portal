"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Zap, Bell, CalendarDays } from "lucide-react";
import { EmailsRightPanel } from "./EmailsRightPanel";

type TodaySession = {
  id: string;
  start_time: string | null;
  classes: { name: string } | null;
};

type AlertItem = {
  message: string;
  dotColor: string;
};

function formatTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

const QUICK_ACTIONS = [
  { label: "Register a dancer",  href: "/admin/register" },
  { label: "Record a payment",   href: "/admin/payments" },
  { label: "Issue family credit", href: "/admin/credits" },
];

function DefaultPanel() {
  const [expanded, setExpanded] = useState(false);
  const [todaySessions, setTodaySessions] = useState<TodaySession[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const today = new Date();
      const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
      const todayStr = today.toISOString().split("T")[0];

      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id, start_time, classes(name)")
        .eq("day_of_week", dayName)
        .lte("start_date", todayStr)
        .gte("end_date", todayStr)
        .is("cancelled_at", null)
        .order("start_time");

      setTodaySessions((sessions ?? []) as TodaySession[]);
      setLoadingSessions(false);

      const items: AlertItem[] = [];

      const { count: draftCount } = await supabase
        .from("semesters")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft");
      if (draftCount && draftCount > 0) {
        items.push({
          message: `${draftCount} draft semester${draftCount !== 1 ? "s" : ""} pending review`,
          dotColor: "#3A3080",
        });
      }

      const { count: overdueCount } = await supabase
        .from("order_payment_installments")
        .select("*", { count: "exact", head: true })
        .eq("status", "overdue");
      if (overdueCount && overdueCount > 0) {
        items.push({
          message: `${overdueCount} overdue payment${overdueCount !== 1 ? "s" : ""}`,
          dotColor: "#7A4E08",
        });
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: recentRegCount }, { count: recentEnrollCount }] = await Promise.all([
        supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .gte("created_at", since)
          .eq("status", "confirmed"),
        supabase
          .from("section_enrollments")
          .select("*", { count: "exact", head: true })
          .gte("created_at", since)
          .eq("status", "confirmed"),
      ]);
      const recentCount = (recentRegCount ?? 0) + (recentEnrollCount ?? 0);
      if (recentCount > 0) {
        items.push({
          message: `${recentCount} new registration${recentCount !== 1 ? "s" : ""} in last 24h`,
          dotColor: "#0A5A50",
        });
      }

      setAlerts(items);
      setLoadingAlerts(false);
    }

    fetchData();
  }, []);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

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
        <Zap size={14} style={{ color: "var(--admin-text-muted)" }} />
        <Bell size={14} style={{ color: "var(--admin-text-muted)" }} />
        <CalendarDays size={14} style={{ color: "var(--admin-text-muted)" }} />
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
        {/* Quick actions */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Quick actions
          </p>
          <div className="flex flex-col gap-0.5">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-2 py-1.5 text-[12.5px] transition-colors"
                style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--admin-sidebar-active)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--admin-text)")}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--admin-sidebar-active)" }}
                />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Alerts
          </p>
          {loadingAlerts ? (
            <div className="flex justify-center py-2">
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
              />
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
              No active alerts
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-[4px]"
                    style={{ background: a.dotColor }}
                  />
                  <p
                    className="text-[11.5px] leading-snug"
                    style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}
                  >
                    {a.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's sessions */}
        <div className="px-4 py-3">
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Today — {todayLabel}
          </p>
          {loadingSessions ? (
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
                  <span
                    className="text-[11.5px] truncate"
                    style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}
                  >
                    {(s.classes as any)?.name ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function DashboardRightPanel({ emailsMode = false }: { emailsMode?: boolean }) {
  if (emailsMode) return <EmailsRightPanel />;
  return <DefaultPanel />;
}
