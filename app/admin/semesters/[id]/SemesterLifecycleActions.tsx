"use client";

import { useState, useTransition } from "react";
import { InlineDatePicker } from "@/app/components/ui/InlineDatePicker";
import {
  publishSemesterNow,
  scheduleSemester,
  saveSemesterDraft,
} from "../actions/semesterLifecycle";
import { archiveSemester } from "../actions/archiveSemester";
import { unpublishSemester } from "../actions/unpublishSemester";
import { restoreSemester } from "../actions/restoreSemester";
import { Check, AlertTriangle } from "lucide-react";

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

const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-neutral-100 text-neutral-600",
  scheduled: "bg-blue-100 text-blue-700",
  archived: "bg-red-100 text-red-600",
};

function fmtAuditDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function auditLabel(action: string): string {
  const map: Record<string, string> = {
    published_now: "Semester published",
    saved_draft: "Saved as draft",
    scheduled_publish: "Scheduled to publish",
    archived: "Semester archived",
    restored: "Semester restored",
    unpublished: "Semester unpublished",
    discount_updated: "Discount rule updated",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

export default function SemesterLifecycleActions({
  semesterId,
  status,
  publishAt,
  health,
  auditLogs,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);

  function run(fn: () => Promise<any>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  const statusBadge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;

  const healthRows = [
    {
      label: "Classes",
      ok: health.classCount > 0,
      warn: false,
      value: health.classCount > 0 ? String(health.classCount) : "None",
    },
    {
      label: "Payment plan",
      ok: health.paymentSet,
      warn: false,
      value: health.paymentSet ? "Set" : "Not set",
    },
    {
      label: "Reg form",
      ok: health.regFormBuilt,
      warn: false,
      value: health.regFormBuilt ? "Built" : "Empty",
    },
    {
      label: "Conf. email",
      ok: health.emailSet,
      warn: false,
      value: health.emailSet ? "Set" : "Not set",
    },
  ];

  return (
    <div className="space-y-3">
      {/* ── Lifecycle Controls ───────────────────────────────────────── */}
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4 space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Lifecycle Controls
        </h3>

        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {/* Current status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">Current status</span>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusBadge}`}
          >
            {status}
          </span>
        </div>

        {/* Primary action buttons */}
        <div className="space-y-2">
          {(status === "draft" || status === "scheduled") && (
            <button
              onClick={() => run(() => publishSemesterNow(semesterId))}
              disabled={pending}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "var(--admin-sidebar-active)" }}
            >
              Publish Now
            </button>
          )}

          {(status === "scheduled" || status === "published") && (
            <div className="flex gap-2">
              <button
                onClick={() => run(() => saveSemesterDraft(semesterId))}
                disabled={pending}
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Revert to draft
              </button>
              {status === "published" && (
                <button
                  onClick={() => run(() => unpublishSemester(semesterId))}
                  disabled={pending}
                  className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Unpublish
                </button>
              )}
            </div>
          )}

          {status === "published" && (
            <button
              onClick={() => run(() => archiveSemester(semesterId))}
              disabled={pending}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              Archive semester
            </button>
          )}

          {status === "archived" && (
            <button
              onClick={() => run(() => restoreSemester(semesterId))}
              disabled={pending}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Restore
            </button>
          )}
        </div>

        {/* Schedule publish */}
        {status !== "archived" && (
          <div className="space-y-2 pt-2 border-t border-neutral-100">
            <div className="text-xs font-medium text-neutral-600">
              Schedule publish
            </div>
            <div className="flex gap-2">
              <InlineDatePicker
                value={scheduledDate}
                onChange={setScheduledDate}
              />
              <button
                onClick={() => {
                  if (!scheduledDate) return;
                  run(() =>
                    scheduleSemester(
                      semesterId,
                      new Date(scheduledDate + "T00:00:00").toISOString(),
                    ),
                  );
                }}
                disabled={!scheduledDate || pending}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
                style={{
                  borderColor: "var(--admin-sidebar-active)",
                  color: "var(--admin-sidebar-active)",
                }}
              >
                {status === "scheduled" ? "Reschedule" : "Schedule"}
              </button>
            </div>
            {publishAt && status === "scheduled" && (
              <p className="text-[11px] text-neutral-400">
                Scheduled for{" "}
                {new Date(publishAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Semester Health ──────────────────────────────────────────── */}
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Semester Health
        </h3>
        <div className="space-y-2.5">
          {healthRows.map(({ label, ok, value }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">{label}</span>
              <span
                className={`flex items-center gap-1 font-medium ${
                  ok ? "text-green-600" : "text-neutral-400"
                }`}
              >
                {ok && <Check className="w-3 h-3" strokeWidth={3} />}
                {value}
              </span>
            </div>
          ))}

          {health.waitlistCount > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">Waitlist</span>
              <span className="flex items-center gap-1 font-medium text-amber-600">
                <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
                {health.waitlistCount} waiting
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ──────────────────────────────────────────── */}
      {auditLogs.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4 space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <span className="text-neutral-700 font-medium leading-snug">
                  {auditLabel(log.action)}
                </span>
                <span className="text-neutral-400 shrink-0 text-[11px]">
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
