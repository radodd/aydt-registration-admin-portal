"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Mail, BarChart2, Users } from "lucide-react";

type UpcomingEmail = {
  id: string;
  subject: string;
  scheduled_at: string;
  recipient_count: number;
};

type PanelData = {
  avgOpenRate: number | null;
  avgClickRate: number | null;
  upcoming: UpcomingEmail[];
  subscribedCount: number;
  unsubscribedCount: number;
  externalCount: number;
};

const EMAIL_ACTIONS = [
  { label: "Compose new broadcast",  href: "/admin/emails/new" },
  { label: "Send to a single family", href: "/admin/emails/new?mode=single" },
  { label: "Schedule a broadcast",   href: "/admin/emails/new?scheduled=1" },
  { label: "Create template",        href: "/admin/emails/new?mode=template" },
];

function formatScheduledDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function Spinner() {
  return (
    <div className="flex justify-center py-2">
      <div
        className="w-3 h-3 border-2 rounded-full animate-spin"
        style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
      />
    </div>
  );
}

export function EmailsRightPanel() {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [analyticsRes, scheduledRes, subRes, unsubRes, extRes] = await Promise.all([
        supabase
          .from("email_analytics")
          .select("open_rate, click_rate")
          .order("sent_at", { ascending: false })
          .limit(30),
        supabase
          .from("emails")
          .select("id, subject, scheduled_at, cnt:email_recipients(count)")
          .eq("status", "scheduled")
          .is("deleted_at", null)
          .order("scheduled_at", { ascending: true })
          .limit(3),
        supabase
          .from("email_subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("is_subscribed", true),
        supabase
          .from("email_subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("is_subscribed", false),
        supabase
          .from("email_subscribers")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null),
      ]);

      const rows = analyticsRes.data ?? [];
      const avgOpen =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.open_rate, 0) / rows.length
          : null;
      const avgClick =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.click_rate, 0) / rows.length
          : null;

      const upcoming: UpcomingEmail[] = ((scheduledRes.data ?? []) as any[]).map((e) => ({
        id: e.id,
        subject: e.subject ?? "",
        scheduled_at: e.scheduled_at ?? "",
        recipient_count: Array.isArray(e.cnt)
          ? (e.cnt[0]?.count ?? 0)
          : (e.cnt ?? 0),
      }));

      setData({
        avgOpenRate: avgOpen,
        avgClickRate: avgClick,
        upcoming,
        subscribedCount: subRes.count ?? 0,
        unsubscribedCount: unsubRes.count ?? 0,
        externalCount: extRes.count ?? 0,
      });
      setLoading(false);
    }

    fetchData();
  }, []);

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
        <Mail size={14} style={{ color: "var(--admin-text-muted)" }} />
        <BarChart2 size={14} style={{ color: "var(--admin-text-muted)" }} />
        <Users size={14} style={{ color: "var(--admin-text-muted)" }} />
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
        {/* Email Actions */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Email actions
          </p>
          <div className="flex flex-col gap-0.5">
            {EMAIL_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-2 py-1.5 text-[12.5px] transition-colors"
                style={{
                  color: "var(--admin-text)",
                  fontFamily: "var(--font-outfit)",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--admin-sidebar-active)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--admin-text)")
                }
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

        {/* 30-Day Performance */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            30-day performance
          </p>
          {loading ? (
            <Spinner />
          ) : (
            <div className="flex gap-5">
              <div>
                <p
                  className="text-[20px] font-semibold leading-none"
                  style={{ color: "var(--admin-text)" }}
                >
                  {data?.avgOpenRate != null
                    ? `${Math.round(data.avgOpenRate)}%`
                    : "—"}
                </p>
                <p
                  className="text-[10px] mt-1"
                  style={{
                    color: "var(--admin-text-faint)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  avg open
                </p>
              </div>
              <div>
                <p
                  className="text-[20px] font-semibold leading-none"
                  style={{ color: "var(--admin-text)" }}
                >
                  {data?.avgClickRate != null
                    ? `${Math.round(data.avgClickRate)}%`
                    : "—"}
                </p>
                <p
                  className="text-[10px] mt-1"
                  style={{
                    color: "var(--admin-text-faint)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  avg click
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Scheduled */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Upcoming scheduled
          </p>
          {loading ? (
            <Spinner />
          ) : (data?.upcoming.length ?? 0) === 0 ? (
            <p
              className="text-xs"
              style={{
                color: "var(--admin-text-faint)",
                fontFamily: "var(--font-outfit)",
              }}
            >
              None scheduled
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data!.upcoming.map((e) => (
                <div key={e.id}>
                  <p
                    className="text-[12px] font-medium leading-snug"
                    style={{ color: "var(--admin-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {e.subject || "(no subject)"}
                  </p>
                  <p
                    className="text-[10.5px] mt-0.5"
                    style={{
                      color: "var(--admin-text-faint)",
                      fontFamily: "var(--font-outfit)",
                    }}
                  >
                    {e.scheduled_at ? formatScheduledDate(e.scheduled_at) : "—"}
                    {e.recipient_count > 0 && ` · ${e.recipient_count.toLocaleString()}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audience */}
        <div className="px-4 py-3">
          <p
            className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Audience
          </p>
          {loading ? (
            <Spinner />
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span
                  className="text-[12px]"
                  style={{
                    color: "var(--admin-text-muted)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  Subscribed
                </span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "var(--admin-text)" }}
                >
                  {data?.subscribedCount.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span
                  className="text-[12px]"
                  style={{
                    color: "var(--admin-text-muted)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  Unsubscribed
                </span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "#C0392B" }}
                >
                  {data?.unsubscribedCount.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span
                  className="text-[12px]"
                  style={{
                    color: "var(--admin-text-muted)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  External
                </span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "var(--admin-text)" }}
                >
                  {data?.externalCount.toLocaleString() ?? "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
