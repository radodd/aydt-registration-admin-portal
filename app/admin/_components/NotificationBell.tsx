"use client";

import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type AlertItem = {
  type: "draft" | "overdue" | "registration" | "warning";
  message: string;
  dotColor: string;
  href: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [hasSeen, setHasSeen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchAlerts() {
      const supabase = createClient();
      const items: AlertItem[] = [];

      // Draft semesters pending review
      const { count: draftCount } = await supabase
        .from("semesters")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft");
      if (draftCount && draftCount > 0) {
        items.push({
          type: "draft",
          message: `${draftCount} draft semester${draftCount !== 1 ? "s" : ""} pending review`,
          dotColor: "#3A3080",
          href: "/admin/semesters",
        });
      }

      // Overdue payments
      const { count: overdueCount } = await supabase
        .from("batch_payment_installments")
        .select("*", { count: "exact", head: true })
        .eq("status", "overdue");
      if (overdueCount && overdueCount > 0) {
        items.push({
          type: "overdue",
          message: `${overdueCount} overdue payment${overdueCount !== 1 ? "s" : ""}`,
          dotColor: "#7A4E08",
          href: "/admin/payments",
        });
      }

      // New confirmed enrollments in last 24h — across both tables.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: recentRegCount }, { count: recentEnrollCount }] = await Promise.all([
        supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .gte("created_at", since)
          .eq("status", "confirmed"),
        supabase
          .from("schedule_enrollments")
          .select("*", { count: "exact", head: true })
          .gte("created_at", since)
          .eq("status", "confirmed"),
      ]);
      const recentCount = (recentRegCount ?? 0) + (recentEnrollCount ?? 0);
      if (recentCount > 0) {
        items.push({
          type: "registration",
          message: `${recentCount} new registration${recentCount !== 1 ? "s" : ""} in last 24h`,
          dotColor: "#0A5A50",
          href: "/admin/classes",
        });
      }

      // Unreviewed enrollment warnings (soft warns + hard blocks)
      const { count: warnCount } = await supabase
        .from("enrollment_warnings")
        .select("*", { count: "exact", head: true })
        .eq("is_reviewed", false);
      if (warnCount && warnCount > 0) {
        items.push({
          type: "warning",
          message: `${warnCount} unreviewed enrollment warning${warnCount !== 1 ? "s" : ""}`,
          dotColor: "#7A4E08",
          href: "/admin/warnings",
        });
      }

      setAlerts(items);
      setLoading(false);
    }

    fetchAlerts();
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) setHasSeen(true);
        }}
        className="relative flex items-center justify-center rounded-lg transition-colors"
        style={{
          width: "34px",
          height: "34px",
          border: "1px solid var(--admin-border)",
          background: open ? "var(--admin-surface-sub)" : "transparent",
          color: "var(--admin-text-muted)",
        }}
      >
        <Bell size={15} />
        {!loading && alerts.length > 0 && !hasSeen && (
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "#C0392B" }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 w-72 rounded-xl z-50 overflow-hidden"
          style={{
            top: "calc(100% + 6px)",
            background: "var(--admin-surface)",
            border: "1px solid var(--admin-border)",
            boxShadow: "var(--shadow-dropdown)",
          }}
        >
          <div
            className="px-4 py-2.5 border-b"
            style={{ borderColor: "var(--admin-border-sub)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--admin-text-faint)" }}
            >
              Alerts
            </p>
          </div>

          {loading ? (
            <div className="px-4 py-5 flex justify-center">
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
              />
            </div>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p
                className="text-sm"
                style={{
                  color: "var(--admin-text-faint)",
                  fontFamily: "var(--font-outfit)",
                }}
              >
                No active alerts
              </p>
            </div>
          ) : (
            <div className="py-1">
              {alerts.map((a, i) => (
                <Link
                  key={i}
                  href={a.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-2.5 transition-colors"
                  style={{ color: "inherit" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]"
                    style={{ background: a.dotColor }}
                  />
                  <p
                    className="text-sm leading-snug"
                    style={{
                      color: "var(--admin-text-muted)",
                      fontFamily: "var(--font-outfit)",
                    }}
                  >
                    {a.message}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
