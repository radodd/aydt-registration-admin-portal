"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";
import { listEmails, listSentEmails } from "@/app/admin/emails/actions/listEmails";
import { listTemplates, cloneTemplateToEmail, deleteTemplate } from "@/app/admin/emails/actions/listTemplates";
import { cloneEmail } from "@/app/admin/emails/actions/cloneEmail";
import { deleteEmail } from "@/app/admin/emails/actions/deleteEmail";
import { cancelEmail } from "@/app/admin/emails/actions/cancelEmail";
import { revertToDraft } from "@/app/admin/emails/actions/revertToDraft";
import { retryFailedRecipients } from "@/app/admin/emails/actions/retryFailedRecipients";
import { getEmailFailedDeliveries } from "@/app/admin/emails/actions/getEmailFailedDeliveries";
import type { FailedDelivery } from "@/app/admin/emails/actions/getEmailFailedDeliveries";
import { listUnsubscribed, listSubscribed } from "@/app/admin/emails/actions/listSubscriptions";
import { listEmailSubscribers } from "@/app/admin/emails/actions/listEmailSubscribers";
import { addEmailSubscriber } from "@/app/admin/emails/actions/addEmailSubscriber";
import { removeEmailSubscriber } from "@/app/admin/emails/actions/removeEmailSubscriber";
import { updateSubscription } from "@/app/admin/emails/actions/updateSubscription";
import type {
  EmailListRow,
  EmailAnalyticsRow,
  TemplateListRow,
  SubscriptionListRow,
  EmailSubscriber,
  PaginatedResult,
} from "@/types";

/* ─── Types ──────────────────────────────────────────────────────── */

type EmailSubTab =
  | "broadcasts"
  | "scheduled"
  | "sent"
  | "failed"
  | "templates"
  | "unsubscribed"
  | "subscribed"
  | "external_subscribers";

type EmailCounts = {
  draft: number;
  scheduled: number;
  sent: number;
  failed: number;
  templates: number;
  unsubscribed: number;
  external: number;
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

/* ─── Shared UI components ───────────────────────────────────────── */

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

function TableHead({ cols }: { cols: { label: string; className?: string }[] }) {
  return (
    <div
      className="hidden md:flex items-center px-5 py-2"
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

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div
      className="flex items-center justify-between px-5 py-2.5 border-t text-[11.5px]"
      style={{ borderColor: "var(--admin-border-sub)", color: "var(--admin-text-muted)" }}
    >
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="hover:underline disabled:opacity-30"
        style={{ background: "none", border: "none", cursor: page === 0 ? "default" : "pointer", color: "inherit" }}
      >
        ← Prev
      </button>
      <span style={{ fontFamily: "var(--font-outfit)" }}>
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages - 1}
        className="hover:underline disabled:opacity-30"
        style={{ background: "none", border: "none", cursor: page >= totalPages - 1 ? "default" : "pointer", color: "inherit" }}
      >
        Next →
      </button>
    </div>
  );
}

/* ─── Broadcasts sub-tab ─────────────────────────────────────────── */

function BroadcastsSubTab({
  counts,
  result,
  loading,
  onClone,
  onDelete,
  cloningId,
  deletingId,
  onPageChange,
}: {
  counts: EmailCounts | null;
  result: PaginatedResult<EmailListRow> | null;
  loading: boolean;
  onClone: (id: string) => void;
  onDelete: (id: string) => void;
  cloningId: string | null;
  deletingId: string | null;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        <MetricCard label="Drafts" value={counts ? counts.draft.toString() : "—"} sub="awaiting send" />
        <MetricCard label="Scheduled" value={counts ? counts.scheduled.toString() : "—"} sub={counts && counts.scheduled > 0 ? "queued" : "none queued"} />
        <MetricCard label="Sent (30 days)" value={counts ? counts.sent.toString() : "—"} sub="last 30 days" />
        <MetricCard label="Failed" value={counts ? counts.failed.toString() : "—"} sub={counts && counts.failed > 0 ? "needs attention" : "none"} />
      </div>

      <div className="admin-card overflow-x-auto overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>All drafts</p>
          <Link href="/admin/emails/new" className="text-[11px] font-medium" style={{ color: "var(--admin-sidebar-active)" }}>
            + Compose new
          </Link>
        </div>

        <TableHead cols={[
          { label: "Subject",    className: "flex-1" },
          { label: "Updated",    className: "w-28 text-right" },
          { label: "Recipients", className: "w-24 text-right" },
          { label: "Status",     className: "w-20 text-right" },
          { label: "",           className: "w-28" },
        ]} />

        {loading ? <Spinner /> : data.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>No drafts yet</p>
        ) : (
          <>
            <ul>
              {data.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center px-5 py-3 border-b"
                  style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
                >
                  {/* Subject — always visible */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/emails/${e.id}/edit`}
                      className="text-[12.5px] font-medium hover:underline truncate block"
                      style={{ color: "var(--admin-text)" }}
                    >
                      {e.subject || "(no subject)"}
                    </Link>
                    {/* Mobile: updated time + status below subject */}
                    <p className="md:hidden text-[11.5px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                      {timeAgo(e.updated_at)} ·{" "}
                      <span style={{ color: "var(--admin-text-muted)" }}>
                        {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                      </span>
                    </p>
                  </div>
                  {/* Desktop-only columns */}
                  <p className="hidden md:block w-28 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                    {timeAgo(e.updated_at)}
                  </p>
                  <p className="hidden md:block w-24 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                    {(e.recipient_count as unknown as number) > 0 ? (e.recipient_count as unknown as number).toLocaleString() : "—"}
                  </p>
                  <div className="hidden md:flex w-20 justify-end">
                    <Badge status={EMAIL_STATUS_BADGE[e.status] ?? "neutral"}>
                      {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="hidden md:flex w-28 items-center justify-end gap-2">
                    <button
                      onClick={() => onClone(e.id)}
                      disabled={cloningId === e.id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-muted)", opacity: cloningId === e.id ? 0.5 : 1 }}
                    >
                      {cloningId === e.id ? "Cloning…" : "Clone"}
                    </button>
                    <button
                      onClick={() => onDelete(e.id)}
                      disabled={deletingId === e.id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", opacity: deletingId === e.id ? 0.5 : 1 }}
                    >
                      {deletingId === e.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  {/* Mobile: Clone/Delete as icon-less text buttons */}
                  <div className="md:hidden flex items-center gap-2 shrink-0 ml-2">
                    <Link
                      href={`/admin/emails/${e.id}/edit`}
                      className="text-[11.5px] font-medium"
                      style={{ color: "var(--admin-sidebar-active)" }}
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Scheduled sub-tab ──────────────────────────────────────────── */

function ScheduledSubTab({
  result,
  loading,
  isSuperAdmin,
  onRevert,
  onCancel,
  revertingId,
  cancellingId,
  onPageChange,
}: {
  result: PaginatedResult<EmailListRow> | null;
  loading: boolean;
  isSuperAdmin: boolean;
  onRevert: (id: string) => void;
  onCancel: (id: string) => void;
  revertingId: string | null;
  cancellingId: string | null;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="admin-card overflow-x-auto overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
        <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>Scheduled broadcasts</p>
      </div>

      <TableHead cols={[
        { label: "Subject",    className: "flex-1" },
        { label: "Send time",  className: "w-44 text-right" },
        { label: "Recipients", className: "w-28 text-right" },
        { label: "Status",     className: "w-24 text-right" },
        ...(isSuperAdmin ? [{ label: "", className: "w-36" }] : []),
      ]} />

      {loading ? <Spinner /> : data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>No scheduled broadcasts</p>
      ) : (
        <>
          <ul>
            {data.map((e, i) => (
              <li
                key={e.id}
                className="flex items-center px-5 py-3 border-b"
                style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
              >
                <div className="flex-1 min-w-0">
                  <Link href={`/admin/emails/${e.id}/edit`} className="text-[12.5px] font-medium hover:underline truncate block" style={{ color: "var(--admin-text)" }}>
                    {e.subject || "(no subject)"}
                  </Link>
                  {e.sender_name && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>{e.sender_name}</p>
                  )}
                </div>
                <p className="w-44 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {formatScheduleTime(e.scheduled_at)}
                </p>
                <p className="w-28 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                  {(e.recipient_count as unknown as number) > 0 ? `${(e.recipient_count as unknown as number).toLocaleString()} families` : "—"}
                </p>
                <div className="w-24 flex justify-end">
                  <Badge status="info">Scheduled</Badge>
                </div>
                {isSuperAdmin && (
                  <div className="w-36 flex items-center justify-end gap-2">
                    <button
                      onClick={() => onRevert(e.id)}
                      disabled={revertingId === e.id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-muted)", opacity: revertingId === e.id ? 0.5 : 1 }}
                    >
                      {revertingId === e.id ? "Reverting…" : "Revert"}
                    </button>
                    <button
                      onClick={() => onCancel(e.id)}
                      disabled={cancellingId === e.id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", opacity: cancellingId === e.id ? 0.5 : 1 }}
                    >
                      {cancellingId === e.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
        </>
      )}
    </div>
  );
}

/* ─── Sent sub-tab ───────────────────────────────────────────────── */

function SentSubTab({
  result,
  stats,
  loading,
  onClone,
  cloningId,
  onPageChange,
}: {
  result: PaginatedResult<EmailAnalyticsRow> | null;
  stats: SentStats | null;
  loading: boolean;
  onClone: (id: string) => void;
  cloningId: string | null;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3">
        <MetricCard label="Avg open rate" value={stats?.avgOpenRate != null ? `${stats.avgOpenRate.toFixed(1)}%` : "—"} sub="+vs industry 21%" />
        <MetricCard label="Avg click rate" value={stats?.avgClickRate != null ? `${stats.avgClickRate.toFixed(1)}%` : "—"} sub="last 30 days" />
        <MetricCard label="Total sent" value={stats ? stats.totalSent.toLocaleString() : "—"} sub="emails this month" />
      </div>

      <div className="admin-card overflow-x-auto overflow-hidden">
        <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>Sent broadcasts</p>
        </div>

        <TableHead cols={[
          { label: "Subject",    className: "flex-1" },
          { label: "Sent",       className: "w-28 text-right" },
          { label: "Recipients", className: "w-24 text-right" },
          { label: "Delivered",  className: "w-20 text-right" },
          { label: "Opened",     className: "w-20 text-right" },
          { label: "Clicked",    className: "w-20 text-right" },
          { label: "Failed",     className: "w-16 text-right" },
          { label: "",           className: "w-16" },
        ]} />

        {loading ? <Spinner /> : data.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>No sent broadcasts</p>
        ) : (
          <>
            <ul>
              {data.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center px-5 py-3 border-b"
                  style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--admin-text)" }}>{e.subject || "(no subject)"}</p>
                    {e.sender_name && (
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>{e.sender_name}</p>
                    )}
                  </div>
                  <p className="w-28 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>{formatDate(e.sent_at)}</p>
                  <p className="w-24 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{e.recipient_count.toLocaleString()}</p>
                  <p className="w-20 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{e.delivered_count.toLocaleString()}</p>
                  <p className="w-20 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{e.open_rate.toFixed(1)}%</p>
                  <p className="w-20 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{e.click_rate.toFixed(1)}%</p>
                  <p className="w-16 text-right text-[12px]" style={{ color: e.failed_count > 0 ? "#C0392B" : "var(--admin-text-muted)" }}>
                    {e.failed_count > 0 ? e.failed_count.toLocaleString() : "—"}
                  </p>
                  <div className="w-16 flex justify-end">
                    <button
                      onClick={() => onClone(e.id)}
                      disabled={cloningId === e.id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-muted)", opacity: cloningId === e.id ? 0.5 : 1 }}
                    >
                      {cloningId === e.id ? "…" : "Clone"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Failed sub-tab ─────────────────────────────────────────────── */

function FailedSubTab({
  result,
  loading,
  isSuperAdmin,
  onRetry,
  onRevert,
  onClone,
  onToggleDetails,
  retryingId,
  revertingId,
  cloningId,
  expandedFailureId,
  failureDetails,
  onPageChange,
}: {
  result: PaginatedResult<EmailListRow> | null;
  loading: boolean;
  isSuperAdmin: boolean;
  onRetry: (id: string) => void;
  onRevert: (id: string) => void;
  onClone: (id: string) => void;
  onToggleDetails: (id: string) => void;
  retryingId: string | null;
  revertingId: string | null;
  cloningId: string | null;
  expandedFailureId: string | null;
  failureDetails: Record<string, FailedDelivery[]>;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="space-y-4">
      {!loading && data.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-md"
          style={{ background: "rgba(192,57,43,.08)", border: "1px solid rgba(192,57,43,.2)" }}
        >
          <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: "#C0392B" }} />
          <p className="text-[12.5px]" style={{ color: "#7A1C12" }}>
            <strong>{data.length} broadcast{data.length !== 1 ? "s" : ""} failed to deliver.</strong>
            {" "}Review and retry or investigate bounce reasons.
          </p>
        </div>
      )}

      <div className="admin-card overflow-x-auto overflow-hidden">
        <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>Failed broadcasts</p>
        </div>

        <TableHead cols={[
          { label: "Subject",    className: "flex-1" },
          { label: "Attempted",  className: "w-28 text-right" },
          { label: "Recipients", className: "w-24 text-right" },
          { label: "",           className: "w-56" },
        ]} />

        {loading ? <Spinner /> : data.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>No failed broadcasts</p>
        ) : (
          <>
            <ul>
              {data.map((e, i) => (
                <li key={e.id}>
                  <div
                    className="flex items-center px-5 py-3 border-b"
                    style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--admin-text)" }}>{e.subject || "(no subject)"}</p>
                    </div>
                    <p className="w-28 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                      {e.sent_at ? formatDate(e.sent_at) : e.updated_at ? formatDate(e.updated_at) : "—"}
                    </p>
                    <p className="w-24 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                      {(e.recipient_count as unknown as number) > 0 ? (e.recipient_count as unknown as number).toLocaleString() : "—"}
                    </p>
                    <div className="w-56 flex items-center justify-end gap-2">
                      <button
                        onClick={() => onToggleDetails(e.id)}
                        className="text-[11px] hover:underline"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-muted)" }}
                      >
                        {expandedFailureId === e.id ? "Hide log" : "View log"}
                      </button>
                      <button
                        onClick={() => onRetry(e.id)}
                        disabled={retryingId === e.id}
                        className="admin-btn-primary text-[11px]"
                        style={{ padding: "4px 10px", opacity: retryingId === e.id ? 0.6 : 1 }}
                      >
                        {retryingId === e.id ? "Retrying…" : "Retry"}
                      </button>
                      <button
                        onClick={() => onClone(e.id)}
                        disabled={cloningId === e.id}
                        className="text-[11px] hover:underline"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-muted)", opacity: cloningId === e.id ? 0.5 : 1 }}
                      >
                        Clone
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => onRevert(e.id)}
                          disabled={revertingId === e.id}
                          className="text-[11px] hover:underline"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-sidebar-active)", opacity: revertingId === e.id ? 0.5 : 1 }}
                        >
                          {revertingId === e.id ? "Reverting…" : "Revert"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Failure details panel */}
                  {expandedFailureId === e.id && (
                    <div
                      className="px-5 py-3 border-b"
                      style={{ borderColor: "var(--admin-border-sub)", background: "rgba(192,57,43,.04)" }}
                    >
                      {!failureDetails[e.id] ? (
                        <Spinner />
                      ) : failureDetails[e.id].length === 0 ? (
                        <p className="text-[12px]" style={{ color: "var(--admin-text-faint)" }}>No failure details found.</p>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th className="text-left text-[10.5px] uppercase tracking-wide pb-2" style={{ color: "var(--admin-text-faint)" }}>Email address</th>
                              <th className="text-left text-[10.5px] uppercase tracking-wide pb-2" style={{ color: "var(--admin-text-faint)" }}>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {failureDetails[e.id].map((d, idx) => (
                              <tr key={idx}>
                                <td className="text-[12px] py-1 pr-4" style={{ color: "var(--admin-text)" }}>{d.emailAddress}</td>
                                <td className="text-[12px] py-1" style={{ color: "#C0392B" }}>{d.failureReason ?? "Unknown"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Templates sub-tab ──────────────────────────────────────────── */

function TemplatesSubTab({
  result,
  loading,
  onUse,
  onDelete,
  usingId,
  deletingTemplateId,
  onPageChange,
}: {
  result: PaginatedResult<TemplateListRow> | null;
  loading: boolean;
  onUse: (id: string) => void;
  onDelete: (id: string) => void;
  usingId: string | null;
  deletingTemplateId: string | null;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/admin/emails/new" className="text-[11px] font-medium" style={{ color: "var(--admin-sidebar-active)" }}>
          + New template
        </Link>
      </div>

      {loading ? <Spinner /> : data.length === 0 ? (
        <div className="admin-card px-5 py-8 text-center text-sm" style={{ color: "var(--admin-text-faint)" }}>No templates yet</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data.map((t) => (
              <div key={t.id} className="admin-card p-4 flex flex-col gap-2" style={{ outline: "1px solid var(--admin-border-sub)" }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium leading-snug" style={{ color: "var(--admin-text)" }}>{t.name}</p>
                  <span className="badge badge-neutral shrink-0" style={{ fontSize: "9.5px" }}>Custom</span>
                </div>
                {t.subject && (
                  <p className="text-[11.5px] leading-snug flex-1" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>{t.subject}</p>
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
                  <Link href={`/admin/emails/${t.id}/edit`} className="text-[11.5px] hover:underline" style={{ color: "var(--admin-text-muted)" }}>
                    Edit
                  </Link>
                  <button
                    onClick={() => onDelete(t.id)}
                    disabled={deletingTemplateId === t.id}
                    className="text-[11.5px] hover:underline ml-auto"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", opacity: deletingTemplateId === t.id ? 0.5 : 1 }}
                  >
                    {deletingTemplateId === t.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}

            <Link
              href="/admin/emails/new"
              className="admin-card p-4 flex flex-col items-center justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity"
              style={{ outline: "1px dashed var(--admin-border)", minHeight: "120px" }}
            >
              <span className="text-2xl font-light" style={{ color: "var(--admin-text-faint)" }}>+</span>
              <span className="text-[12px]" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>New template</span>
            </Link>
          </div>
          {result && result.totalPages > 1 && (
            <div className="admin-card overflow-x-auto overflow-hidden">
              <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Unsubscribed sub-tab ───────────────────────────────────────── */

function UnsubscribedSubTab({
  result,
  loading,
  isSuperAdmin,
  onResubscribe,
  resubscribingId,
  onPageChange,
}: {
  result: PaginatedResult<SubscriptionListRow> | null;
  loading: boolean;
  isSuperAdmin: boolean;
  onResubscribe: (userId: string) => void;
  resubscribingId: string | null;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="admin-card overflow-x-auto overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
        <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>Unsubscribed users</p>
      </div>

      <TableHead cols={[
        { label: "Email",         className: "flex-1" },
        { label: "Name",          className: "w-40" },
        { label: "Unsubscribed",  className: "w-32 text-right" },
        ...(isSuperAdmin ? [{ label: "", className: "w-28" }] : []),
      ]} />

      {loading ? <Spinner /> : data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>No unsubscribed users</p>
      ) : (
        <>
          <ul>
            {data.map((row, i) => (
              <li
                key={row.user_id}
                className="flex items-center px-5 py-3 border-b"
                style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
              >
                <p className="flex-1 text-[12.5px] truncate" style={{ color: "var(--admin-text)" }}>{row.users?.email ?? "—"}</p>
                <p className="w-40 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                  {row.users ? `${row.users.first_name} ${row.users.last_name}` : "—"}
                </p>
                <p className="w-32 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {formatDate(row.unsubscribed_at)}
                </p>
                {isSuperAdmin && (
                  <div className="w-28 flex justify-end">
                    <button
                      onClick={() => onResubscribe(row.user_id)}
                      disabled={resubscribingId === row.user_id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-sidebar-active)", opacity: resubscribingId === row.user_id ? 0.5 : 1 }}
                    >
                      {resubscribingId === row.user_id ? "Resubscribing…" : "Re-subscribe"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
        </>
      )}
    </div>
  );
}

/* ─── Subscribed sub-tab ─────────────────────────────────────────── */

function SubscribedSubTab({
  result,
  loading,
  onPageChange,
}: {
  result: PaginatedResult<SubscriptionListRow> | null;
  loading: boolean;
  onPageChange: (p: number) => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="admin-card overflow-x-auto overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
        <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>Subscribed users</p>
      </div>

      <TableHead cols={[
        { label: "Email",  className: "flex-1" },
        { label: "Name",   className: "w-48" },
        { label: "Status", className: "w-24 text-right" },
      ]} />

      {loading ? <Spinner /> : data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>No subscribed users</p>
      ) : (
        <>
          <ul>
            {data.map((row, i) => (
              <li
                key={row.user_id}
                className="flex items-center px-5 py-3 border-b"
                style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
              >
                <p className="flex-1 text-[12.5px] truncate" style={{ color: "var(--admin-text)" }}>{row.users?.email ?? "—"}</p>
                <p className="w-48 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                  {row.users ? `${row.users.first_name} ${row.users.last_name}` : "—"}
                </p>
                <div className="w-24 flex justify-end">
                  <Badge status="success">Subscribed</Badge>
                </div>
              </li>
            ))}
          </ul>
          {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
        </>
      )}
    </div>
  );
}

/* ─── External Subscribers sub-tab ──────────────────────────────── */

function ExternalSubscribersSubTab({
  result,
  loading,
  search,
  onSearchChange,
  onRemove,
  removingSubId,
  onPageChange,
  // Add form
  addName,
  addEmail,
  addPhone,
  addStatus,
  addConflictMsg,
  onAddNameChange,
  onAddEmailChange,
  onAddPhoneChange,
  onAddSubmit,
  onAddForce,
}: {
  result: PaginatedResult<EmailSubscriber> | null;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onRemove: (id: string) => void;
  removingSubId: string | null;
  onPageChange: (p: number) => void;
  addName: string;
  addEmail: string;
  addPhone: string;
  addStatus: "idle" | "loading" | "conflict" | "already_exists" | "error";
  addConflictMsg: string;
  onAddNameChange: (v: string) => void;
  onAddEmailChange: (v: string) => void;
  onAddPhoneChange: (v: string) => void;
  onAddSubmit: () => void;
  onAddForce: () => void;
}) {
  const data = result?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or email…"
          className="admin-input text-[12.5px]"
          style={{ maxWidth: "320px" }}
        />
      </div>

      <div className="admin-card overflow-x-auto overflow-hidden">
        <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>External subscribers</p>
        </div>

        <TableHead cols={[
          { label: "Email",  className: "flex-1" },
          { label: "Name",   className: "w-40" },
          { label: "Phone",  className: "w-32" },
          { label: "Added",  className: "w-28 text-right" },
          { label: "",       className: "w-20" },
        ]} />

        {loading ? <Spinner /> : data.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            {search ? "No results" : "No external subscribers yet"}
          </p>
        ) : (
          <>
            <ul>
              {data.map((sub, i) => (
                <li
                  key={sub.id}
                  className="flex items-center px-5 py-3 border-b"
                  style={{ borderColor: "var(--admin-border-sub)", background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
                >
                  <p className="flex-1 text-[12.5px] truncate" style={{ color: "var(--admin-text)" }}>{sub.email}</p>
                  <p className="w-40 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{sub.name ?? "—"}</p>
                  <p className="w-32 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{sub.phone ?? "—"}</p>
                  <p className="w-28 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>{formatDate(sub.created_at)}</p>
                  <div className="w-20 flex justify-end">
                    <button
                      onClick={() => onRemove(sub.id)}
                      disabled={removingSubId === sub.id}
                      className="text-[11px] hover:underline"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", opacity: removingSubId === sub.id ? 0.5 : 1 }}
                    >
                      {removingSubId === sub.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {result && <Pagination page={result.page} totalPages={result.totalPages} onPrev={() => onPageChange(result.page - 1)} onNext={() => onPageChange(result.page + 1)} />}
          </>
        )}
      </div>

      {/* Add subscriber form */}
      <div className="admin-card p-5">
        <p className="text-[13px] font-medium mb-3" style={{ color: "var(--admin-text)" }}>Add external subscriber</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="admin-stat-label block mb-1">Name</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => onAddNameChange(e.target.value)}
              placeholder="Full name"
              className="admin-input text-[12.5px] w-full"
            />
          </div>
          <div>
            <label className="admin-stat-label block mb-1">Email *</label>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => onAddEmailChange(e.target.value)}
              placeholder="email@example.com"
              className="admin-input text-[12.5px] w-full"
            />
          </div>
          <div>
            <label className="admin-stat-label block mb-1">Phone</label>
            <input
              type="tel"
              value={addPhone}
              onChange={(e) => onAddPhoneChange(e.target.value)}
              placeholder="Optional"
              className="admin-input text-[12.5px] w-full"
            />
          </div>
        </div>

        {addStatus === "conflict" && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-md mb-3"
            style={{ background: "rgba(212,160,0,.08)", border: "1px solid rgba(212,160,0,.3)" }}
          >
            <p className="text-[12px] flex-1" style={{ color: "#7A5A00" }}>{addConflictMsg}</p>
            <button
              onClick={onAddForce}
              className="text-[11.5px] font-medium hover:underline shrink-0"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-sidebar-active)" }}
            >
              Add anyway
            </button>
          </div>
        )}
        {addStatus === "already_exists" && (
          <p className="text-[12px] mb-3" style={{ color: "#C0392B" }}>This email is already in the external subscribers list.</p>
        )}
        {addStatus === "error" && (
          <p className="text-[12px] mb-3" style={{ color: "#C0392B" }}>Something went wrong. Please try again.</p>
        )}

        <button
          onClick={onAddSubmit}
          disabled={!addEmail || addStatus === "loading"}
          className="admin-btn-primary text-[12px]"
          style={{ padding: "6px 16px", opacity: !addEmail || addStatus === "loading" ? 0.5 : 1 }}
        >
          {addStatus === "loading" ? "Adding…" : "Add subscriber"}
        </button>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */

const EMPTY_PAGES: Record<EmailSubTab, number> = {
  broadcasts: 0,
  scheduled: 0,
  sent: 0,
  failed: 0,
  templates: 0,
  unsubscribed: 0,
  subscribed: 0,
  external_subscribers: 0,
};

export function EmailsTabSection() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<EmailSubTab>("broadcasts");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [counts, setCounts] = useState<EmailCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [pages, setPages] = useState<Record<EmailSubTab, number>>(EMPTY_PAGES);
  const [actionError, setActionError] = useState<string | null>(null);

  // Per-tab paginated results
  const [draftsResult, setDraftsResult] = useState<PaginatedResult<EmailListRow> | null>(null);
  const [scheduledResult, setScheduledResult] = useState<PaginatedResult<EmailListRow> | null>(null);
  const [sentResult, setSentResult] = useState<PaginatedResult<EmailAnalyticsRow> | null>(null);
  const [failedResult, setFailedResult] = useState<PaginatedResult<EmailListRow> | null>(null);
  const [templatesResult, setTemplatesResult] = useState<PaginatedResult<TemplateListRow> | null>(null);
  const [unsubResult, setUnsubResult] = useState<PaginatedResult<SubscriptionListRow> | null>(null);
  const [subResult, setSubResult] = useState<PaginatedResult<SubscriptionListRow> | null>(null);
  const [extSubsResult, setExtSubsResult] = useState<PaginatedResult<EmailSubscriber> | null>(null);

  // Sent stats
  const [sentStats, setSentStats] = useState<SentStats | null>(null);

  // Per-tab loading
  const [tabLoading, setTabLoading] = useState<Record<EmailSubTab, boolean>>({
    broadcasts: false, scheduled: false, sent: false, failed: false, templates: false,
    unsubscribed: false, subscribed: false, external_subscribers: false,
  });

  // Action states
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [resubscribingId, setResubscribingId] = useState<string | null>(null);
  const [removingSubId, setRemovingSubId] = useState<string | null>(null);

  // Failure details
  const [expandedFailureId, setExpandedFailureId] = useState<string | null>(null);
  const [failureDetails, setFailureDetails] = useState<Record<string, FailedDelivery[]>>({});

  // External subscriber search + form
  const [extSubSearch, setExtSubSearch] = useState("");
  const [addSubName, setAddSubName] = useState("");
  const [addSubEmail, setAddSubEmail] = useState("");
  const [addSubPhone, setAddSubPhone] = useState("");
  const [addSubStatus, setAddSubStatus] = useState<"idle" | "loading" | "conflict" | "already_exists" | "error">("idle");
  const [addSubConflictMsg, setAddSubConflictMsg] = useState("");

  const extSubSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Role detection ── */
  useEffect(() => {
    async function checkRole() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
      setIsSuperAdmin(data?.role === "super_admin");
    }
    checkRole();
  }, []);

  /* ── Badge counts ── */
  useEffect(() => {
    async function fetchCounts() {
      const supabase = createClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [draftRes, scheduledRes, sentRes, failedRes, tplRes, unsubRes, extRes] = await Promise.all([
        supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "draft").is("deleted_at", null),
        supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "scheduled").is("deleted_at", null),
        supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", thirtyDaysAgo).is("deleted_at", null),
        supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "failed").is("deleted_at", null),
        supabase.from("email_templates").select("*", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("email_subscriptions").select("*", { count: "exact", head: true }).eq("is_subscribed", false),
        supabase.from("email_subscribers").select("*", { count: "exact", head: true }),
      ]);

      setCounts({
        draft: draftRes.count ?? 0,
        scheduled: scheduledRes.count ?? 0,
        sent: sentRes.count ?? 0,
        failed: failedRes.count ?? 0,
        templates: tplRes.count ?? 0,
        unsubscribed: unsubRes.count ?? 0,
        external: extRes.count ?? 0,
      });
      setCountsLoading(false);
    }
    fetchCounts();
  }, []);

  /* ── Sent stats ── */
  useEffect(() => {
    async function fetchSentStats() {
      const supabase = createClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from("email_analytics").select("open_rate, click_rate").gte("sent_at", thirtyDaysAgo);
      const rows = data ?? [];
      const avgOpen = rows.length > 0 ? rows.reduce((s, r) => s + r.open_rate, 0) / rows.length : null;
      const avgClick = rows.length > 0 ? rows.reduce((s, r) => s + r.click_rate, 0) / rows.length : null;
      const { count: totalSentCount } = await supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", thirtyDaysAgo).is("deleted_at", null);
      setSentStats({ avgOpenRate: avgOpen, avgClickRate: avgClick, totalSent: totalSentCount ?? 0 });
    }
    fetchSentStats();
  }, []);

  /* ── Tab data loader ── */
  const loadTab = useCallback(async (tab: EmailSubTab, page: number, search?: string) => {
    setTabLoading((prev) => ({ ...prev, [tab]: true }));
    try {
      if (tab === "broadcasts") {
        setDraftsResult(await listEmails("draft", page));
      } else if (tab === "scheduled") {
        setScheduledResult(await listEmails("scheduled", page));
      } else if (tab === "sent") {
        setSentResult(await listSentEmails(page));
      } else if (tab === "failed") {
        setFailedResult(await listEmails("failed", page));
      } else if (tab === "templates") {
        setTemplatesResult(await listTemplates(page));
      } else if (tab === "unsubscribed") {
        setUnsubResult(await listUnsubscribed(page));
      } else if (tab === "subscribed") {
        setSubResult(await listSubscribed(page));
      } else if (tab === "external_subscribers") {
        setExtSubsResult(await listEmailSubscribers(page, search ?? ""));
      }
    } catch (err) {
      console.error("Failed to load tab data", err);
    } finally {
      setTabLoading((prev) => ({ ...prev, [tab]: false }));
    }
  }, []);

  /* Load on mount */
  useEffect(() => { loadTab("broadcasts", 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load on tab switch */
  useEffect(() => {
    const currentPage = pages[activeTab];
    if (activeTab === "external_subscribers") {
      loadTab(activeTab, currentPage, extSubSearch);
    } else {
      loadTab(activeTab, currentPage);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Debounced external subscriber search */
  useEffect(() => {
    if (activeTab !== "external_subscribers") return;
    if (extSubSearchDebounce.current) clearTimeout(extSubSearchDebounce.current);
    extSubSearchDebounce.current = setTimeout(() => {
      setPages((prev) => ({ ...prev, external_subscribers: 0 }));
      loadTab("external_subscribers", 0, extSubSearch);
    }, 400);
  }, [extSubSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Page change helper */
  function changePage(tab: EmailSubTab, newPage: number) {
    setPages((prev) => ({ ...prev, [tab]: newPage }));
    if (tab === "external_subscribers") {
      loadTab(tab, newPage, extSubSearch);
    } else {
      loadTab(tab, newPage);
    }
  }

  /* ── Action handlers ── */

  async function handleClone(emailId: string) {
    setCloningId(emailId);
    setActionError(null);
    try {
      const { emailId: newId } = await cloneEmail(emailId);
      router.push(`/admin/emails/${newId}/edit`);
    } catch {
      setActionError("Failed to clone email.");
      setCloningId(null);
    }
  }

  async function handleDelete(emailId: string) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setDeletingId(emailId);
    setActionError(null);
    try {
      await deleteEmail(emailId);
      await loadTab("broadcasts", pages.broadcasts);
      setCounts((prev) => prev ? { ...prev, draft: Math.max(0, prev.draft - 1) } : prev);
    } catch {
      setActionError("Failed to delete draft.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCancel(emailId: string) {
    if (!confirm("Cancel this scheduled broadcast? It will be marked cancelled and won't send.")) return;
    setCancellingId(emailId);
    setActionError(null);
    try {
      await cancelEmail(emailId);
      await loadTab("scheduled", pages.scheduled);
      setCounts((prev) => prev ? { ...prev, scheduled: Math.max(0, prev.scheduled - 1) } : prev);
    } catch {
      setActionError("Failed to cancel email.");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleRevert(emailId: string) {
    setRevertingId(emailId);
    setActionError(null);
    try {
      await revertToDraft(emailId);
      // Refresh both scheduled and failed tabs since revert works on both
      await Promise.all([
        loadTab("scheduled", pages.scheduled),
        loadTab("failed", pages.failed),
        loadTab("broadcasts", pages.broadcasts),
      ]);
      setCounts((prev) => prev ? { ...prev, draft: prev.draft + 1 } : prev);
    } catch {
      setActionError("Failed to revert email to draft.");
    } finally {
      setRevertingId(null);
    }
  }

  async function handleRetry(emailId: string) {
    setRetryingId(emailId);
    setActionError(null);
    try {
      await retryFailedRecipients(emailId);
      await loadTab("failed", pages.failed);
    } catch {
      setActionError("Failed to retry delivery.");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleToggleFailureDetails(emailId: string) {
    if (expandedFailureId === emailId) {
      setExpandedFailureId(null);
      return;
    }
    setExpandedFailureId(emailId);
    if (failureDetails[emailId]) return; // already loaded
    try {
      const details = await getEmailFailedDeliveries(emailId);
      setFailureDetails((prev) => ({ ...prev, [emailId]: details }));
    } catch {
      setFailureDetails((prev) => ({ ...prev, [emailId]: [] }));
    }
  }

  async function handleUseTemplate(templateId: string) {
    setUsingTemplateId(templateId);
    try {
      const { emailId } = await cloneTemplateToEmail(templateId);
      router.push(`/admin/emails/${emailId}/edit`);
    } catch {
      setActionError("Failed to use template.");
      setUsingTemplateId(null);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setDeletingTemplateId(templateId);
    setActionError(null);
    try {
      await deleteTemplate(templateId);
      await loadTab("templates", pages.templates);
      setCounts((prev) => prev ? { ...prev, templates: Math.max(0, prev.templates - 1) } : prev);
    } catch {
      setActionError("Failed to delete template.");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function handleResubscribe(userId: string) {
    setResubscribingId(userId);
    setActionError(null);
    try {
      await updateSubscription(userId, true);
      await loadTab("unsubscribed", pages.unsubscribed);
      setCounts((prev) => prev ? { ...prev, unsubscribed: Math.max(0, prev.unsubscribed - 1) } : prev);
    } catch {
      setActionError("Failed to re-subscribe user.");
    } finally {
      setResubscribingId(null);
    }
  }

  async function handleRemoveSubscriber(subscriberId: string) {
    setRemovingSubId(subscriberId);
    setActionError(null);
    try {
      await removeEmailSubscriber(subscriberId);
      await loadTab("external_subscribers", pages.external_subscribers, extSubSearch);
      setCounts((prev) => prev ? { ...prev, external: Math.max(0, prev.external - 1) } : prev);
    } catch {
      setActionError("Failed to remove subscriber.");
    } finally {
      setRemovingSubId(null);
    }
  }

  async function handleAddSubscriber(force = false) {
    if (!addSubEmail) return;
    setAddSubStatus("loading");
    setActionError(null);
    try {
      const result = await addEmailSubscriber(addSubEmail, addSubName, addSubPhone, force);
      if (result.status === "added") {
        setAddSubName("");
        setAddSubEmail("");
        setAddSubPhone("");
        setAddSubStatus("idle");
        setAddSubConflictMsg("");
        await loadTab("external_subscribers", 0, extSubSearch);
        setCounts((prev) => prev ? { ...prev, external: prev.external + 1 } : prev);
      } else if (result.status === "conflict") {
        setAddSubStatus("conflict");
        setAddSubConflictMsg(result.message);
      } else if (result.status === "already_exists") {
        setAddSubStatus("already_exists");
      }
    } catch {
      setAddSubStatus("error");
    }
  }

  /* ── Tab definitions ── */
  const SUB_TABS: { key: EmailSubTab; label: string; count?: number }[] = [
    { key: "broadcasts",          label: "Broadcasts",    count: counts?.draft },
    { key: "scheduled",           label: "Scheduled",     count: counts?.scheduled },
    { key: "sent",                label: "Sent",          count: counts?.sent },
    { key: "failed",              label: "Failed",        count: counts?.failed },
    { key: "templates",           label: "Templates",     count: counts?.templates },
    { key: "unsubscribed",        label: "Unsubscribed",  count: counts?.unsubscribed },
    { key: "subscribed",          label: "Subscribed" },
    { key: "external_subscribers",label: "External",      count: counts?.external },
  ];

  return (
    <div className="space-y-4">
      {/* Top action */}
      <div className="flex justify-end">
        <Link href="/admin/emails/new" className="admin-btn-primary" style={{ fontSize: "13px", padding: "7px 14px" }}>
          + Compose email
        </Link>
      </div>

      {/* Action error */}
      {actionError && (
        <div
          className="px-4 py-3 rounded-md text-[12.5px]"
          style={{ background: "rgba(192,57,43,.08)", border: "1px solid rgba(192,57,43,.2)", color: "#7A1C12" }}
        >
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-2 underline" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>Dismiss</button>
        </div>
      )}

      {/* Sub-tab nav — horizontal scroll on mobile */}
      <div
        className="flex border-b overflow-x-auto"
        style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
      >
        {SUB_TABS.map((t) => {
          const active = activeTab === t.key;
          const isFailed = t.key === "failed" && (t.count ?? 0) > 0;
          const isUnsub = t.key === "unsubscribed" && (t.count ?? 0) > 0;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-3.5 py-2.5 text-[12px] transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              style={{
                borderBottom: `2px solid ${active ? "var(--admin-sidebar-active)" : "transparent"}`,
                color: active ? "var(--admin-sidebar-active)" : (isFailed || isUnsub) ? "#C0392B" : "var(--admin-text-muted)",
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
                    background: active ? "var(--admin-sidebar-active)" : (isFailed || isUnsub) ? "rgba(192,57,43,.12)" : "var(--admin-border)",
                    color: active ? "#fff" : (isFailed || isUnsub) ? "#C0392B" : "var(--admin-text-muted)",
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
            result={draftsResult}
            loading={tabLoading.broadcasts}
            onClone={handleClone}
            onDelete={handleDelete}
            cloningId={cloningId}
            deletingId={deletingId}
            onPageChange={(p) => changePage("broadcasts", p)}
          />
        )}
        {activeTab === "scheduled" && (
          <ScheduledSubTab
            result={scheduledResult}
            loading={tabLoading.scheduled}
            isSuperAdmin={isSuperAdmin}
            onRevert={handleRevert}
            onCancel={handleCancel}
            revertingId={revertingId}
            cancellingId={cancellingId}
            onPageChange={(p) => changePage("scheduled", p)}
          />
        )}
        {activeTab === "sent" && (
          <SentSubTab
            result={sentResult}
            stats={sentStats}
            loading={tabLoading.sent}
            onClone={handleClone}
            cloningId={cloningId}
            onPageChange={(p) => changePage("sent", p)}
          />
        )}
        {activeTab === "failed" && (
          <FailedSubTab
            result={failedResult}
            loading={tabLoading.failed}
            isSuperAdmin={isSuperAdmin}
            onRetry={handleRetry}
            onRevert={handleRevert}
            onClone={handleClone}
            onToggleDetails={handleToggleFailureDetails}
            retryingId={retryingId}
            revertingId={revertingId}
            cloningId={cloningId}
            expandedFailureId={expandedFailureId}
            failureDetails={failureDetails}
            onPageChange={(p) => changePage("failed", p)}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesSubTab
            result={templatesResult}
            loading={tabLoading.templates}
            onUse={handleUseTemplate}
            onDelete={handleDeleteTemplate}
            usingId={usingTemplateId}
            deletingTemplateId={deletingTemplateId}
            onPageChange={(p) => changePage("templates", p)}
          />
        )}
        {activeTab === "unsubscribed" && (
          <UnsubscribedSubTab
            result={unsubResult}
            loading={tabLoading.unsubscribed}
            isSuperAdmin={isSuperAdmin}
            onResubscribe={handleResubscribe}
            resubscribingId={resubscribingId}
            onPageChange={(p) => changePage("unsubscribed", p)}
          />
        )}
        {activeTab === "subscribed" && (
          <SubscribedSubTab
            result={subResult}
            loading={tabLoading.subscribed}
            onPageChange={(p) => changePage("subscribed", p)}
          />
        )}
        {activeTab === "external_subscribers" && (
          <ExternalSubscribersSubTab
            result={extSubsResult}
            loading={tabLoading.external_subscribers}
            search={extSubSearch}
            onSearchChange={setExtSubSearch}
            onRemove={handleRemoveSubscriber}
            removingSubId={removingSubId}
            onPageChange={(p) => changePage("external_subscribers", p)}
            addName={addSubName}
            addEmail={addSubEmail}
            addPhone={addSubPhone}
            addStatus={addSubStatus}
            addConflictMsg={addSubConflictMsg}
            onAddNameChange={setAddSubName}
            onAddEmailChange={setAddSubEmail}
            onAddPhoneChange={setAddSubPhone}
            onAddSubmit={() => handleAddSubscriber(false)}
            onAddForce={() => handleAddSubscriber(true)}
          />
        )}
      </div>
    </div>
  );
}
