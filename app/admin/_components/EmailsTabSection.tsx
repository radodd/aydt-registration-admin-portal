"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";
import { listEmails } from "@/app/admin/emails/actions/listEmails";
import { listTemplates } from "@/app/admin/emails/actions/listTemplates";
import { cloneTemplateToEmail } from "@/app/admin/emails/actions/listTemplates";
import { retryFailedRecipients } from "@/app/admin/emails/actions/retryFailedRecipients";
import type { EmailListRow, EmailAnalyticsRow, TemplateListRow } from "@/types";

/* ─── Types ──────────────────────────────────────────────────────── */

type EmailSubTab = "broadcasts" | "scheduled" | "sent" | "failed" | "templates";

type EmailCounts = {
  draft: number;
  scheduled: number;
  sent: number;
  failed: number;
  templates: number;
};

type SentStats = {
  avgOpenRate: number | null;
  avgClickRate: number | null;
  totalSent: number;
};

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.includes("T") ? iso : iso + "T00:00:00";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatScheduleTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

const EMAIL_STATUS_BADGE: Record<string, BadgeStatus> = {
  draft:     "neutral",
  scheduled: "info",
  sending:   "warning",
  sent:      "success",
  failed:    "error",
  cancelled: "error",
};

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
      />
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function TableHead({ cols }: { cols: { label: string; className?: string }[] }) {
  return (
    <div
      className="flex items-center px-5 py-2"
      style={{ background: "var(--admin-table-header-bg)" }}
    >
      {cols.map((c) => (
        <span
          key={c.label}
          className={`text-[10.5px] font-medium uppercase tracking-wide ${c.className ?? ""}`}
          style={{ color: "var(--admin-table-header-text)" }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-card-stat flex flex-col">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {sub && <p className="admin-stat-sub">{sub}</p>}
    </div>
  );
}

/* ─── Broadcasts sub-tab ─────────────────────────────────────────── */

function BroadcastsSubTab({
  counts,
  data,
  loading,
}: {
  counts: EmailCounts | null;
  data: EmailListRow[];
  loading: boolean;
}) {
  const unsavedCount = data.filter((e) => !e.subject).length;

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Drafts"
          value={counts ? counts.draft.toString() : "—"}
          sub="awaiting send"
        />
        <MetricCard
          label="Scheduled"
          value={counts ? counts.scheduled.toString() : "—"}
          sub={counts && counts.scheduled > 0 ? "queued" : "none queued"}
        />
        <MetricCard
          label="Sent (30 days)"
          value={counts ? counts.sent.toString() : "—"}
          sub="+68% avg open"
        />
        <MetricCard
          label="Failed"
          value={counts ? counts.failed.toString() : "—"}
          sub={counts && counts.failed > 0 ? "needs attention" : "none"}
        />
      </div>

      {/* Drafts table */}
      <div className="admin-card overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--admin-border-sub)" }}
        >
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
            All drafts
          </p>
          <Link
            href="/admin/emails/new"
            className="text-[11px] font-medium"
            style={{ color: "var(--admin-sidebar-active)" }}
          >
            + Compose new
          </Link>
        </div>

        <TableHead
          cols={[
            { label: "Subject",    className: "flex-1" },
            { label: "Updated",    className: "w-32 text-right" },
            { label: "Recipients", className: "w-24 text-right" },
            { label: "Status",     className: "w-20 text-right" },
          ]}
        />

        {loading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <p
            className="px-5 py-6 text-sm text-center"
            style={{ color: "var(--admin-text-faint)" }}
          >
            No drafts yet
          </p>
        ) : (
          <>
            <ul>
              {data.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center px-5 py-3 border-b"
                  style={{
                    borderColor: "var(--admin-border-sub)",
                    background:
                      i % 2 !== 0
                        ? "var(--admin-table-row-alt)"
                        : "var(--admin-surface)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/emails/${e.id}/edit`}
                      className="text-[12.5px] font-medium hover:underline truncate block"
                      style={{ color: "var(--admin-text)" }}
                    >
                      {e.subject || "(no subject)"}
                    </Link>
                    {!e.subject && (
                      <p
                        className="text-[11px] mt-0.5"
                        style={{
                          color: "var(--admin-text-faint)",
                          fontFamily: "var(--font-outfit)",
                        }}
                      >
                        Unsaved draft · no recipients
                      </p>
                    )}
                  </div>
                  <p
                    className="w-32 text-right text-[12px]"
                    style={{
                      color: "var(--admin-text-muted)",
                      fontFamily: "var(--font-outfit)",
                    }}
                  >
                    {timeAgo(e.updated_at)}
                  </p>
                  <p
                    className="w-24 text-right text-[12px]"
                    style={{ color: "var(--admin-text-muted)" }}
                  >
                    {(e.recipient_count as unknown as number) > 0
                      ? (e.recipient_count as unknown as number).toLocaleString()
                      : "—"}
                  </p>
                  <div className="w-20 flex justify-end">
                    <Badge status={EMAIL_STATUS_BADGE[e.status] ?? "neutral"}>
                      {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
            {unsavedCount > 0 && (
              <div
                className="flex justify-end px-5 py-2.5 border-t text-[11px]"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  color: "var(--admin-sidebar-active)",
                  fontFamily: "var(--font-outfit)",
                }}
              >
                {data.length} drafts total · {unsavedCount} unsaved
                &nbsp;
                <span className="ml-1 font-medium cursor-pointer hover:underline">
                  Clean up unsaved →
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Scheduled sub-tab ──────────────────────────────────────────── */

function ScheduledSubTab({ data, loading }: { data: EmailListRow[]; loading: boolean }) {
  return (
    <div className="admin-card overflow-hidden">
      <div
        className="flex items-center px-5 py-3 border-b"
        style={{ borderColor: "var(--admin-border-sub)" }}
      >
        <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
          Scheduled broadcasts
        </p>
      </div>

      <TableHead
        cols={[
          { label: "Subject",    className: "flex-1" },
          { label: "Send time",  className: "w-44 text-right" },
          { label: "Recipients", className: "w-28 text-right" },
          { label: "Status",     className: "w-24 text-right" },
        ]}
      />

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <p
          className="px-5 py-6 text-sm text-center"
          style={{ color: "var(--admin-text-faint)" }}
        >
          No scheduled broadcasts
        </p>
      ) : (
        <ul>
          {data.map((e, i) => (
            <li
              key={e.id}
              className="flex items-center px-5 py-3 border-b"
              style={{
                borderColor: "var(--admin-border-sub)",
                background:
                  i % 2 !== 0
                    ? "var(--admin-table-row-alt)"
                    : "var(--admin-surface)",
              }}
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/admin/emails/${e.id}/edit`}
                  className="text-[12.5px] font-medium hover:underline truncate block"
                  style={{ color: "var(--admin-text)" }}
                >
                  {e.subject || "(no subject)"}
                </Link>
                {e.sender_name && (
                  <p
                    className="text-[11px] mt-0.5"
                    style={{
                      color: "var(--admin-text-faint)",
                      fontFamily: "var(--font-outfit)",
                    }}
                  >
                    {e.sender_name}
                  </p>
                )}
              </div>
              <p
                className="w-44 text-right text-[12px]"
                style={{
                  color: "var(--admin-text-muted)",
                  fontFamily: "var(--font-outfit)",
                }}
              >
                {formatScheduleTime(e.scheduled_at)}
              </p>
              <p
                className="w-28 text-right text-[12px]"
                style={{ color: "var(--admin-text-muted)" }}
              >
                {(e.recipient_count as unknown as number) > 0
                  ? `${(e.recipient_count as unknown as number).toLocaleString()} families`
                  : "—"}
              </p>
              <div className="w-24 flex justify-end">
                <Badge status="info">Scheduled</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Sent sub-tab ───────────────────────────────────────────────── */

function SentSubTab({
  data,
  stats,
  loading,
}: {
  data: EmailAnalyticsRow[];
  stats: SentStats | null;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Avg open rate"
          value={
            stats?.avgOpenRate != null ? `${stats.avgOpenRate.toFixed(1)}%` : "—"
          }
          sub="+vs industry 21%"
        />
        <MetricCard
          label="Avg click rate"
          value={
            stats?.avgClickRate != null ? `${stats.avgClickRate.toFixed(1)}%` : "—"
          }
          sub="last 30 days"
        />
        <MetricCard
          label="Total sent"
          value={stats ? stats.totalSent.toLocaleString() : "—"}
          sub="emails this month"
        />
      </div>

      {/* Sent table */}
      <div className="admin-card overflow-hidden">
        <div
          className="flex items-center px-5 py-3 border-b"
          style={{ borderColor: "var(--admin-border-sub)" }}
        >
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
            Sent broadcasts
          </p>
        </div>

        <TableHead
          cols={[
            { label: "Subject",    className: "flex-1" },
            { label: "Sent",       className: "w-32 text-right" },
            { label: "Recipients", className: "w-24 text-right" },
            { label: "Opened",     className: "w-20 text-right" },
            { label: "Clicked",    className: "w-20 text-right" },
            { label: "Status",     className: "w-20 text-right" },
          ]}
        />

        {loading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <p
            className="px-5 py-6 text-sm text-center"
            style={{ color: "var(--admin-text-faint)" }}
          >
            No sent broadcasts
          </p>
        ) : (
          <ul>
            {data.map((e, i) => (
              <li
                key={e.id}
                className="flex items-center px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background:
                    i % 2 !== 0
                      ? "var(--admin-table-row-alt)"
                      : "var(--admin-surface)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12.5px] font-medium truncate"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {e.subject || "(no subject)"}
                  </p>
                  {e.sender_name && (
                    <p
                      className="text-[11px] mt-0.5"
                      style={{
                        color: "var(--admin-text-faint)",
                        fontFamily: "var(--font-outfit)",
                      }}
                    >
                      {e.sender_name}
                    </p>
                  )}
                </div>
                <p
                  className="w-32 text-right text-[12px]"
                  style={{
                    color: "var(--admin-text-muted)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  {formatDate(e.sent_at)}
                </p>
                <p
                  className="w-24 text-right text-[12px]"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  {e.recipient_count.toLocaleString()}
                </p>
                <p
                  className="w-20 text-right text-[12px]"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  {e.open_rate.toFixed(1)}%
                </p>
                <p
                  className="w-20 text-right text-[12px]"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  {e.click_rate.toFixed(1)}%
                </p>
                <div className="w-20 flex justify-end">
                  <Badge status="success">Sent</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Failed sub-tab ─────────────────────────────────────────────── */

function FailedSubTab({
  data,
  loading,
  onRetry,
  retryingId,
}: {
  data: EmailListRow[];
  loading: boolean;
  onRetry: (id: string) => void;
  retryingId: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {!loading && data.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-md"
          style={{
            background: "rgba(192,57,43,.08)",
            border: "1px solid rgba(192,57,43,.2)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0 mt-1"
            style={{ background: "#C0392B" }}
          />
          <p className="text-[12.5px]" style={{ color: "#7A1C12" }}>
            <strong>{data.length} broadcast{data.length !== 1 ? "s" : ""} failed to deliver.</strong>
            {" "}Review and retry or investigate bounce reasons.
          </p>
        </div>
      )}

      <div className="admin-card overflow-hidden">
        <div
          className="flex items-center px-5 py-3 border-b"
          style={{ borderColor: "var(--admin-border-sub)" }}
        >
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
            Failed broadcasts
          </p>
        </div>

        <TableHead
          cols={[
            { label: "Subject",   className: "flex-1" },
            { label: "Attempted", className: "w-32 text-right" },
            { label: "Recipients",className: "w-24 text-right" },
            { label: "Failed",    className: "w-20 text-right" },
            { label: "",          className: "w-36" },
          ]}
        />

        {loading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <p
            className="px-5 py-6 text-sm text-center"
            style={{ color: "var(--admin-text-faint)" }}
          >
            No failed broadcasts
          </p>
        ) : (
          <ul>
            {data.map((e, i) => (
              <li
                key={e.id}
                className="flex items-center px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background:
                    i % 2 !== 0
                      ? "var(--admin-table-row-alt)"
                      : "var(--admin-surface)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12.5px] font-medium truncate"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {e.subject || "(no subject)"}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{
                      color: "var(--admin-text-faint)",
                      fontFamily: "var(--font-outfit)",
                    }}
                  >
                    Resend API error · Webhook timeout
                  </p>
                </div>
                <p
                  className="w-32 text-right text-[12px]"
                  style={{
                    color: "var(--admin-text-muted)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  {e.sent_at
                    ? formatDate(e.sent_at)
                    : e.updated_at
                    ? formatDate(e.updated_at)
                    : "—"}
                </p>
                <p
                  className="w-24 text-right text-[12px]"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  {(e.recipient_count as unknown as number) > 0
                    ? (e.recipient_count as unknown as number).toLocaleString()
                    : "—"}
                </p>
                <div className="w-20 flex justify-end">
                  <Badge status="error">All failed</Badge>
                </div>
                <div className="w-36 flex items-center justify-end gap-2">
                  <button
                    onClick={() => onRetry(e.id)}
                    disabled={retryingId === e.id}
                    className="admin-btn-primary text-[11px]"
                    style={{ padding: "4px 10px", opacity: retryingId === e.id ? 0.6 : 1 }}
                  >
                    {retryingId === e.id ? "Retrying…" : "Retry"}
                  </button>
                  <Link
                    href={`/admin/emails/${e.id}/edit`}
                    className="text-[11.5px] hover:underline"
                    style={{ color: "var(--admin-text-muted)" }}
                  >
                    View log
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Templates sub-tab ──────────────────────────────────────────── */

function TemplatesSubTab({
  data,
  loading,
  onUse,
  usingId,
}: {
  data: TemplateListRow[];
  loading: boolean;
  onUse: (id: string) => void;
  usingId: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/admin/emails/new"
          className="text-[11px] font-medium"
          style={{ color: "var(--admin-sidebar-active)" }}
        >
          + New template
        </Link>
      </div>

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <div
          className="admin-card px-5 py-8 text-center text-sm"
          style={{ color: "var(--admin-text-faint)" }}
        >
          No templates yet
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {data.map((t) => (
            <div
              key={t.id}
              className="admin-card p-4 flex flex-col gap-2"
              style={{ outline: "1px solid var(--admin-border-sub)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className="text-[13px] font-medium leading-snug"
                  style={{ color: "var(--admin-text)" }}
                >
                  {t.name}
                </p>
                <span
                  className="badge badge-neutral shrink-0 text-[10px]"
                  style={{ fontSize: "9.5px" }}
                >
                  Custom
                </span>
              </div>
              {t.subject && (
                <p
                  className="text-[11.5px] leading-snug flex-1"
                  style={{
                    color: "var(--admin-text-muted)",
                    fontFamily: "var(--font-outfit)",
                  }}
                >
                  {t.subject}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => onUse(t.id)}
                  disabled={usingId === t.id}
                  className="admin-btn-primary text-[11.5px]"
                  style={{ padding: "4px 10px", opacity: usingId === t.id ? 0.6 : 1 }}
                >
                  {usingId === t.id ? "Loading…" : "Use"}
                </button>
                <Link
                  href={`/admin/emails/${t.id}/edit`}
                  className="text-[11.5px] hover:underline"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}

          {/* "New template" card */}
          <Link
            href="/admin/emails/new"
            className="admin-card p-4 flex flex-col items-center justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity"
            style={{
              outline: "1px dashed var(--admin-border)",
              minHeight: "120px",
            }}
          >
            <span
              className="text-2xl font-light"
              style={{ color: "var(--admin-text-faint)" }}
            >
              +
            </span>
            <span
              className="text-[12px]"
              style={{
                color: "var(--admin-text-faint)",
                fontFamily: "var(--font-outfit)",
              }}
            >
              New template
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */

export function EmailsTabSection() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EmailSubTab>("broadcasts");
  const [counts, setCounts] = useState<EmailCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);

  // Per-tab data
  const [draftsData, setDraftsData] = useState<EmailListRow[]>([]);
  const [scheduledData, setScheduledData] = useState<EmailListRow[]>([]);
  const [sentData, setSentData] = useState<EmailAnalyticsRow[]>([]);
  const [failedData, setFailedData] = useState<EmailListRow[]>([]);
  const [templatesData, setTemplatesData] = useState<TemplateListRow[]>([]);
  const [sentStats, setSentStats] = useState<SentStats | null>(null);

  // Per-tab loading states
  const [tabLoading, setTabLoading] = useState<Record<EmailSubTab, boolean>>({
    broadcasts: false,
    scheduled: false,
    sent: false,
    failed: false,
    templates: false,
  });
  const [loadedTabs, setLoadedTabs] = useState<Set<EmailSubTab>>(new Set());

  // Action states
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);

  /* Fetch tab-badge counts on mount */
  useEffect(() => {
    async function fetchCounts() {
      const supabase = createClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [draftRes, scheduledRes, sentRes, failedRes, tplRes] = await Promise.all([
        supabase
          .from("emails")
          .select("*", { count: "exact", head: true })
          .eq("status", "draft")
          .is("deleted_at", null),
        supabase
          .from("emails")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled")
          .is("deleted_at", null),
        supabase
          .from("emails")
          .select("*", { count: "exact", head: true })
          .eq("status", "sent")
          .gte("sent_at", thirtyDaysAgo)
          .is("deleted_at", null),
        supabase
          .from("emails")
          .select("*", { count: "exact", head: true })
          .eq("status", "failed")
          .is("deleted_at", null),
        supabase
          .from("email_templates")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null),
      ]);

      setCounts({
        draft: draftRes.count ?? 0,
        scheduled: scheduledRes.count ?? 0,
        sent: sentRes.count ?? 0,
        failed: failedRes.count ?? 0,
        templates: tplRes.count ?? 0,
      });
      setCountsLoading(false);
    }

    fetchCounts();
  }, []);

  /* Fetch sent analytics stats separately */
  useEffect(() => {
    async function fetchSentStats() {
      const supabase = createClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("email_analytics")
        .select("open_rate, click_rate")
        .gte("sent_at", thirtyDaysAgo);

      const rows = data ?? [];
      const avgOpen =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.open_rate, 0) / rows.length
          : null;
      const avgClick =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.click_rate, 0) / rows.length
          : null;

      const { count: totalSentCount } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", thirtyDaysAgo)
        .is("deleted_at", null);

      setSentStats({
        avgOpenRate: avgOpen,
        avgClickRate: avgClick,
        totalSent: totalSentCount ?? 0,
      });
    }

    fetchSentStats();
  }, []);

  /* Lazy-load tab data on tab switch */
  const loadTabData = useCallback(
    async (tab: EmailSubTab) => {
      if (loadedTabs.has(tab)) return;

      setTabLoading((prev) => ({ ...prev, [tab]: true }));

      try {
        if (tab === "broadcasts") {
          const res = await listEmails("draft", 0);
          setDraftsData(res.data);
        } else if (tab === "scheduled") {
          const res = await listEmails("scheduled", 0);
          setScheduledData(res.data);
        } else if (tab === "sent") {
          const supabase = createClient();
          const { data } = await supabase
            .from("email_analytics")
            .select("*")
            .order("sent_at", { ascending: false })
            .limit(20);
          setSentData((data ?? []) as unknown as EmailAnalyticsRow[]);
        } else if (tab === "failed") {
          const res = await listEmails("failed", 0);
          setFailedData(res.data);
        } else if (tab === "templates") {
          const res = await listTemplates(0);
          setTemplatesData(res.data);
        }

        setLoadedTabs((prev) => new Set([...prev, tab]));
      } catch (err) {
        console.error("Failed to load tab data", err);
      } finally {
        setTabLoading((prev) => ({ ...prev, [tab]: false }));
      }
    },
    [loadedTabs],
  );

  /* Load broadcasts on mount */
  useEffect(() => {
    loadTabData("broadcasts");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load tab data on switch */
  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Actions */
  async function handleRetry(emailId: string) {
    setRetryingId(emailId);
    try {
      const result = await retryFailedRecipients(emailId);
      if (result.succeeded > 0) {
        // Re-fetch failed tab data
        setLoadedTabs((prev) => {
          const next = new Set(prev);
          next.delete("failed");
          return next;
        });
        await loadTabData("failed");
      }
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetryingId(null);
    }
  }

  async function handleUseTemplate(templateId: string) {
    setUsingTemplateId(templateId);
    try {
      const { emailId } = await cloneTemplateToEmail(templateId);
      router.push(`/admin/emails/${emailId}/edit`);
    } catch (err) {
      console.error("Clone template failed:", err);
      setUsingTemplateId(null);
    }
  }

  /* Sub-tab nav */
  const SUB_TABS: { key: EmailSubTab; label: string; count?: number }[] = [
    { key: "broadcasts", label: "Broadcasts", count: counts?.draft },
    { key: "scheduled",  label: "Scheduled",  count: counts?.scheduled },
    { key: "sent",       label: "Sent",        count: counts?.sent },
    { key: "failed",     label: "Failed",      count: counts?.failed },
    { key: "templates",  label: "Templates",   count: counts?.templates },
  ];

  return (
    <div className="space-y-4">
      {/* Top action */}
      <div className="flex justify-end">
        <Link
          href="/admin/emails/new"
          className="admin-btn-primary"
          style={{ fontSize: "13px", padding: "7px 14px" }}
        >
          + Compose email
        </Link>
      </div>

      {/* Sub-tab nav */}
      <div
        className="flex border-b -mx-0"
        style={{
          background: "var(--admin-surface)",
          borderColor: "var(--admin-border)",
        }}
      >
        {SUB_TABS.map((t) => {
          const active = activeTab === t.key;
          const isFailed = t.key === "failed" && (t.count ?? 0) > 0;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-3.5 py-2.5 text-[12px] transition-colors flex items-center gap-1.5"
              style={{
                borderBottom: `2px solid ${active ? "var(--admin-sidebar-active)" : "transparent"}`,
                color: active
                  ? "var(--admin-sidebar-active)"
                  : isFailed
                  ? "#C0392B"
                  : "var(--admin-text-muted)",
                fontWeight: active ? 500 : 400,
                fontFamily: "var(--font-outfit)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {t.label}
              {!countsLoading && t.count != null && t.count > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    minWidth: "17px",
                    height: "17px",
                    padding: "0 4px",
                    background: active
                      ? "var(--admin-sidebar-active)"
                      : isFailed
                      ? "rgba(192,57,43,.12)"
                      : "var(--admin-border)",
                    color: active
                      ? "#fff"
                      : isFailed
                      ? "#C0392B"
                      : "var(--admin-text-muted)",
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div>
        {activeTab === "broadcasts" && (
          <BroadcastsSubTab
            counts={counts}
            data={draftsData}
            loading={tabLoading.broadcasts}
          />
        )}
        {activeTab === "scheduled" && (
          <ScheduledSubTab
            data={scheduledData}
            loading={tabLoading.scheduled}
          />
        )}
        {activeTab === "sent" && (
          <SentSubTab
            data={sentData}
            stats={sentStats}
            loading={tabLoading.sent}
          />
        )}
        {activeTab === "failed" && (
          <FailedSubTab
            data={failedData}
            loading={tabLoading.failed}
            onRetry={handleRetry}
            retryingId={retryingId}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesSubTab
            data={templatesData}
            loading={tabLoading.templates}
            onUse={handleUseTemplate}
            usingId={usingTemplateId}
          />
        )}
      </div>
    </div>
  );
}
