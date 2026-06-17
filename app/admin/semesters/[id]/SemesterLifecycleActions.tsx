"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { InlineDatePicker } from "@/app/components/ui/InlineDatePicker";
import {
  publishSemesterNow,
  scheduleSemester,
  saveSemesterDraft,
} from "../actions/semesterLifecycle";
import { archiveSemester } from "../actions/archiveSemester";
import { unpublishSemester } from "../actions/unpublishSemester";
import { restoreSemester } from "../actions/restoreSemester";
import { useToast } from "@/app/components/Toast";
import { Check, AlertTriangle, Pencil, Loader2 } from "lucide-react";

type HealthData = {
  classCount: number;
  paymentSet: boolean;
  regFormBuilt: boolean;
  emailSet: boolean;
  waitlistCount: number;
};

type AuditLog = {
  id: string;
  action: string;
  created_at: string;
  changes?: any;
};

type Props = {
  semesterId: string;
  status: string;
  publishAt: string | null;
  health: HealthData;
  auditLogs: AuditLog[];
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  published: { bg: "rgba(125,206,194,.18)", color: "#0A5A50" },
  draft:     { bg: "rgba(158,196,180,.18)", color: "#20503A" },
  scheduled: { bg: "rgba(196,160,212,.18)", color: "#5A2878" },
  archived:  { bg: "rgba(232,184,176,.18)", color: "#802818" },
};

function fmtAuditDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function auditLabel(action: string): string {
  const map: Record<string, string> = {
    published_now:      "Published",
    saved_draft:        "Saved as draft",
    scheduled_publish:  "Scheduled",
    archived:           "Archived",
    restored:           "Restored",
    unpublished:        "Unpublished",
    discount_updated:   "Discount updated",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

export default function SemesterLifecycleActions({
  semesterId, status, publishAt, health, auditLogs,
}: Props) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);

  function run(key: string, fn: () => Promise<any>, successMsg: string) {
    setActionError(null);
    setPendingAction(key);
    startTransition(async () => {
      try {
        await fn();
        toast.success(successMsg);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Action failed.";
        setActionError(msg);
        toast.error(msg);
      } finally {
        setPendingAction(null);
      }
    });
  }

  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;

  const healthRows = [
    { label: "Classes",      ok: health.classCount > 0,  value: health.classCount > 0 ? String(health.classCount) : "None" },
    { label: "Payment plan", ok: health.paymentSet,       value: health.paymentSet    ? "Set"   : "Not set" },
    { label: "Reg form",     ok: health.regFormBuilt,     value: health.regFormBuilt  ? "Built" : "Empty" },
    { label: "Conf. email",  ok: health.emailSet,         value: health.emailSet      ? "Set"   : "Not set" },
  ];

  return (
    <div className="space-y-3">

      {/* ── Status & Publishing ───────────────────────────────────── */}
      <div className="admin-card p-4 space-y-4">
        {/* Card header */}
        <h3
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--admin-text-faint)" }}
        >
          Status &amp; Publishing
        </h3>

        {actionError && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: "rgba(192,57,43,.06)",
              border: "1px solid rgba(192,57,43,.2)",
              color: "#7A1C12",
            }}
          >
            {actionError}
          </div>
        )}

        {/* Current status */}
        <div className="flex items-center justify-between">
          <span className="text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
            Current status
          </span>
          <span
            className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full capitalize"
            style={{ background: badge.bg, color: badge.color }}
          >
            {status}
          </span>
        </div>

        {/* Primary actions */}
        <div className="space-y-2">
          {/* Edit semester — always first, outlined */}
          <Link
            href={`/admin/semesters/${semesterId}/edit`}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-colors"
            style={{
              border: "1px solid var(--admin-sidebar-active)",
              color: "var(--admin-sidebar-active)",
              background: "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(142,42,35,.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Pencil size={13} />
            Edit semester
          </Link>

          {(status === "draft" || status === "scheduled") && (
            <button
              onClick={() => run("publish", () => publishSemesterNow(semesterId), "Semester published.")}
              disabled={pending}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ background: "var(--admin-sidebar-active)" }}
            >
              {pendingAction === "publish" && <Loader2 size={13} className="animate-spin" />}
              {pendingAction === "publish" ? "Publishing…" : "Publish Now"}
            </button>
          )}

          {(status === "scheduled" || status === "published") && (
            <div className="flex gap-2">
              <button
                onClick={() => run("draft", () => saveSemesterDraft(semesterId), "Reverted to draft.")}
                disabled={pending}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium disabled:opacity-50 transition-colors"
                style={{
                  border: "1px solid var(--admin-border)",
                  color: "var(--admin-text-muted)",
                  background: "var(--admin-surface)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
              >
                {pendingAction === "draft" && <Loader2 size={12} className="animate-spin" />}
                {pendingAction === "draft" ? "Reverting…" : "Revert to draft"}
              </button>
              {status === "published" && (
                <button
                  onClick={() => run("unpublish", () => unpublishSemester(semesterId), "Semester unpublished.")}
                  disabled={pending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium disabled:opacity-50 transition-colors"
                  style={{
                    border: "1px solid var(--admin-border)",
                    color: "var(--admin-text-muted)",
                    background: "var(--admin-surface)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
                >
                  {pendingAction === "unpublish" && <Loader2 size={12} className="animate-spin" />}
                  {pendingAction === "unpublish" ? "Unpublishing…" : "Unpublish"}
                </button>
              )}
            </div>
          )}

          {status === "published" && (
            <button
              onClick={() => run("archive", () => archiveSemester(semesterId), "Semester archived.")}
              disabled={pending}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium disabled:opacity-50 transition-colors"
              style={{
                border: "1px solid var(--admin-border-sub)",
                color: "var(--admin-text-faint)",
                background: "var(--admin-surface)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
            >
              {pendingAction === "archive" && <Loader2 size={12} className="animate-spin" />}
              {pendingAction === "archive" ? "Archiving…" : "Archive semester"}
            </button>
          )}

          {status === "archived" && (
            <button
              onClick={() => run("restore", () => restoreSemester(semesterId), "Semester restored.")}
              disabled={pending}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium disabled:opacity-50 transition-colors"
              style={{
                border: "1px solid var(--admin-border)",
                color: "var(--admin-text-muted)",
                background: "var(--admin-surface)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
            >
              {pendingAction === "restore" && <Loader2 size={12} className="animate-spin" />}
              {pendingAction === "restore" ? "Restoring…" : "Restore semester"}
            </button>
          )}
        </div>

        {/* Schedule publish */}
        {status !== "archived" && (
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--admin-border-sub)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
              Schedule publish
            </p>
            <div className="flex gap-2">
              <InlineDatePicker value={scheduledDate} onChange={setScheduledDate} />
              <button
                onClick={() => {
                  if (!scheduledDate) return;
                  run(
                    "schedule",
                    () => scheduleSemester(semesterId, new Date(scheduledDate + "T00:00:00").toISOString()),
                    status === "scheduled" ? "Publish rescheduled." : "Publish scheduled.",
                  );
                }}
                disabled={!scheduledDate || pending}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{
                  border: "1px solid var(--admin-sidebar-active)",
                  color: "var(--admin-sidebar-active)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(142,42,35,.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {pendingAction === "schedule" && <Loader2 size={12} className="animate-spin" />}
                {pendingAction === "schedule"
                  ? status === "scheduled" ? "Rescheduling…" : "Scheduling…"
                  : status === "scheduled" ? "Reschedule" : "Schedule"}
              </button>
            </div>
            {publishAt && status === "scheduled" && (
              <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                Scheduled for{" "}
                {new Date(publishAt).toLocaleString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Readiness Check ───────────────────────────────────────── */}
      <div className="admin-card p-4 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--admin-text-faint)" }}>
          Readiness Check
        </h3>
        <div className="space-y-2">
          {healthRows.map(({ label, ok, value }) => (
            <div key={label} className="flex items-center justify-between text-[12px]">
              <span style={{ color: "var(--admin-text-muted)" }}>{label}</span>
              <span
                className="flex items-center gap-1 font-medium"
                style={{ color: ok ? "#0A5A50" : "var(--admin-text-faint)" }}
              >
                {ok && <Check className="w-3 h-3" strokeWidth={3} />}
                {value}
              </span>
            </div>
          ))}
          {health.waitlistCount > 0 && (
            <div className="flex items-center justify-between text-[12px]">
              <span style={{ color: "var(--admin-text-muted)" }}>Waitlist</span>
              <span className="flex items-center gap-1 font-medium" style={{ color: "#7A4E08" }}>
                <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
                {health.waitlistCount} waiting
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ───────────────────────────────────────── */}
      {auditLogs.length > 0 && (
        <div className="admin-card p-4 space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--admin-text-faint)" }}>
            Recent Activity
          </h3>
          <div className="space-y-2.5">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 text-[12px]">
                <span style={{ color: "var(--admin-text)", fontWeight: 500 }}>
                  {auditLabel(log.action)}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                  {fmtAuditDate(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
