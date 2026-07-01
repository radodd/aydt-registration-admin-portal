"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Send, AlertTriangle } from "lucide-react";
import type { Family } from "@/types";
import { getFamilies } from "@/queries/admin";
import { useToast } from "@/app/components/Toast";
import {
  sendActivationInvites,
  type ActivationInviteResult,
} from "../actions/sendActivationInvites";
import { MAX_ACTIVATION_BATCH } from "../actions/activationConstants";

/* ── helpers ──────────────────────────────────────────────────────────── */

type Row = {
  id: string;
  familyName: string;
  parentName: string;
  email: string | null;
  invitedAt: string | null;
};

function toRow(f: Family): Row {
  const primary = f.users.find((u) => u.is_primary_parent) ?? f.users[0];
  const email = primary?.email?.trim() || null;
  const parentName = primary
    ? `${primary.first_name} ${primary.last_name}`.trim()
    : "—";
  return {
    id: f.id,
    familyName: f.family_name ?? "Unknown family",
    parentName,
    email,
    invitedAt: f.activation_invited_at,
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const QUICK_BATCHES = [10, 25, 50];

/* ── page ─────────────────────────────────────────────────────────────── */

export default function ActivationConsole() {
  const toast = useToast();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"uninvited" | "invited">("uninvited");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<ActivationInviteResult[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () =>
    getFamilies()
      .then((data) => setFamilies((data as Family[]) ?? []))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const rows = useMemo(() => families.map(toRow), [families]);
  const uninvited = useMemo(() => rows.filter((r) => !r.invitedAt), [rows]);
  const invited = useMemo(
    () =>
      rows
        .filter((r) => r.invitedAt)
        .sort((a, b) => (b.invitedAt ?? "").localeCompare(a.invitedAt ?? "")),
    [rows],
  );
  const eligibleUninvited = useMemo(() => uninvited.filter((r) => r.email), [uninvited]);

  const view = tab === "uninvited" ? uninvited : invited;
  const selectableInView = view.filter((r) => r.email);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_ACTIVATION_BATCH) {
          toast.warning(`You can send at most ${MAX_ACTIVATION_BATCH} invites per batch.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });

  const selectFirst = (n: number) => {
    // Small -> large rollout: take the first N eligible, never-invited families.
    setSelected(new Set(eligibleUninvited.slice(0, n).map((r) => r.id)));
    setResults(null);
  };

  const selectAllInView = () => {
    setSelected(new Set(selectableInView.slice(0, MAX_ACTIVATION_BATCH).map((r) => r.id)));
    if (selectableInView.length > MAX_ACTIVATION_BATCH) {
      toast.warning(`Capped at ${MAX_ACTIVATION_BATCH}; send the rest in a later batch.`);
    }
    setResults(null);
  };

  const clear = () => setSelected(new Set());

  const send = () => {
    const ids = [...selected];
    startTransition(async () => {
      try {
        const summary = await sendActivationInvites(ids);
        setResults(summary.results);
        setSelected(new Set());
        setConfirming(false);
        if (summary.failed > 0) {
          toast.warning(
            `Sent ${summary.sent} · skipped ${summary.skipped} · failed ${summary.failed}.`,
          );
        } else {
          toast.success(
            `Sent ${summary.sent} invite${summary.sent !== 1 ? "s" : ""}` +
              (summary.skipped ? ` · skipped ${summary.skipped} (no email)` : "") +
              ".",
          );
        }
        await reload();
      } catch (e: unknown) {
        setConfirming(false);
        toast.error(e instanceof Error ? e.message : "Failed to send invites.");
      }
    });
  };

  const resultsById = useMemo(() => {
    const m = new Map<string, ActivationInviteResult>();
    (results ?? []).forEach((r) => m.set(r.familyId, r));
    return m;
  }, [results]);

  const selectedCount = selected.size;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <Link
            href="/admin/families"
            className="inline-flex items-center gap-1 text-[12px] mb-1.5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            <ArrowLeft size={13} /> Families
          </Link>
          <h1 className="admin-page-title">Activate accounts</h1>
          <p className="admin-page-subtitle">
            Send passwordless activation invites to migrated families, in controlled batches.
            Start small, confirm delivery, then send larger cohorts.
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-2">
        <span className="badge badge-warning">{eligibleUninvited.length} ready to invite</span>
        {uninvited.length - eligibleUninvited.length > 0 && (
          <span className="badge badge-error">
            {uninvited.length - eligibleUninvited.length} missing email
          </span>
        )}
        <span className="badge badge-success">{invited.length} already invited</span>
      </div>

      <div className="admin-card overflow-hidden">
        {/* Tabs + batch controls */}
        <div
          className="flex flex-wrap items-center gap-2 px-5 py-3 border-b"
          style={{ borderColor: "var(--admin-border-sub)" }}
        >
          <div className="flex gap-1">
            <button
              onClick={() => setTab("uninvited")}
              className="admin-btn-sm rounded-lg font-semibold transition-colors"
              style={{
                padding: "6px 12px",
                background: tab === "uninvited" ? "var(--admin-surface-sub)" : "transparent",
                color: tab === "uninvited" ? "var(--admin-text)" : "var(--admin-text-faint)",
                boxShadow: tab === "uninvited" ? "inset 0 0 0 1px #8E2A23" : "none",
              }}
            >
              Not invited ({uninvited.length})
            </button>
            <button
              onClick={() => setTab("invited")}
              className="admin-btn-sm rounded-lg font-semibold transition-colors"
              style={{
                padding: "6px 12px",
                background: tab === "invited" ? "var(--admin-surface-sub)" : "transparent",
                color: tab === "invited" ? "var(--admin-text)" : "var(--admin-text-faint)",
                boxShadow: tab === "invited" ? "inset 0 0 0 1px #8E2A23" : "none",
              }}
            >
              Invited ({invited.length})
            </button>
          </div>

          <div className="flex-1" />

          {tab === "uninvited" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                Quick batch:
              </span>
              {QUICK_BATCHES.map((n) => (
                <button
                  key={n}
                  onClick={() => selectFirst(n)}
                  disabled={eligibleUninvited.length === 0}
                  className="admin-btn-neutral admin-btn-sm disabled:opacity-40"
                >
                  First {n}
                </button>
              ))}
              <button
                onClick={selectAllInView}
                disabled={selectableInView.length === 0}
                className="admin-btn-neutral admin-btn-sm disabled:opacity-40"
              >
                All
              </button>
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
            />
          </div>
        ) : view.length === 0 ? (
          <p className="px-5 py-10 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            {tab === "uninvited"
              ? "Every family with an email has been invited."
              : "No families have been invited yet."}
          </p>
        ) : (
          <ul>
            {view.map((r, i) => {
              const isSelected = selected.has(r.id);
              const noEmail = !r.email;
              const result = resultsById.get(r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-4 md:px-5 py-3 border-b"
                  style={{
                    borderColor: "var(--admin-border-sub)",
                    background: isSelected
                      ? "var(--admin-surface-sub)"
                      : i % 2 !== 0
                        ? "var(--admin-table-row-alt)"
                        : "var(--admin-surface)",
                    boxShadow: isSelected ? "inset 2px 0 0 0 #8E2A23" : "none",
                  }}
                >
                  {tab === "uninvited" && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={noEmail || isPending}
                      onChange={() => toggle(r.id)}
                      className="shrink-0 disabled:opacity-30"
                      style={{ accentColor: "#8E2A23", width: 15, height: 15 }}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--admin-text)" }}
                    >
                      {r.familyName}
                    </p>
                    <p className="text-[11.5px] truncate" style={{ color: "var(--admin-text-faint)" }}>
                      {r.parentName}
                      {r.email ? ` · ${r.email}` : ""}
                    </p>
                  </div>

                  {/* per-row status */}
                  {result?.status === "sent" && <span className="badge badge-success">Sent</span>}
                  {result?.status === "skipped" && (
                    <span className="badge badge-warning">{result.detail ?? "Skipped"}</span>
                  )}
                  {result?.status === "error" && (
                    <span className="badge badge-error" title={result.detail}>
                      Failed
                    </span>
                  )}
                  {!result && noEmail && <span className="badge badge-error">No email</span>}
                  {!result && tab === "invited" && (
                    <span className="text-[11.5px]" style={{ color: "var(--admin-text-faint)" }}>
                      {fmtDate(r.invitedAt)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sticky action bar */}
      {tab === "uninvited" && selectedCount > 0 && (
        <div
          className="sticky bottom-4 admin-card flex flex-wrap items-center gap-3 px-5 py-3"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}
        >
          {!confirming ? (
            <>
              <Mail size={15} style={{ color: "var(--admin-text-muted)" }} />
              <span className="text-[13px]" style={{ color: "var(--admin-text)" }}>
                <strong>{selectedCount}</strong> famil{selectedCount === 1 ? "y" : "ies"} selected
              </span>
              <div className="flex-1" />
              <button onClick={clear} className="admin-btn-neutral admin-btn-sm" disabled={isPending}>
                Clear
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="admin-btn-primary admin-btn-sm"
                disabled={isPending}
              >
                <Send size={13} /> Send {selectedCount} invite{selectedCount !== 1 ? "s" : ""}
              </button>
            </>
          ) : (
            <>
              <AlertTriangle size={15} style={{ color: "#8E2A23" }} />
              <span className="text-[13px]" style={{ color: "var(--admin-text)" }}>
                Email {selectedCount} primary parent{selectedCount !== 1 ? "s" : ""} a passwordless
                activation invite? This can take up to ~{Math.ceil((selectedCount * 0.4))}s.
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setConfirming(false)}
                className="admin-btn-neutral admin-btn-sm"
                disabled={isPending}
              >
                Cancel
              </button>
              <button onClick={send} className="admin-btn-primary admin-btn-sm" disabled={isPending}>
                {isPending ? "Sending…" : `Confirm & send`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
