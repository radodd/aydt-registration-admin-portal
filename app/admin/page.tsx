"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal, Plus } from "lucide-react";
import { archiveSemester } from "./semesters/actions/archiveSemester";
import { deleteSemester } from "./semesters/actions/deleteSemester";

/* ─── Types ─────────────────────────────────────────────────────────── */

type SemesterRow = {
  id: string;
  name: string;
  status: string;
  publish_at: string | null;
  created_at: string;
  reg_count?: number;
};

type RecentReg = {
  id: string;
  created_at: string;
  dancer_id: string | null;
  dancers: { first_name: string; last_name: string } | null;
  class_meetings: {
    classes: { name: string } | null;
    semesters: { name: string } | null;
  } | null;
  registration_orders: {
    grand_total: number | null;
    family_id: string | null;
    users: { first_name: string; last_name: string } | null;
  } | null;
};

type OverdueRow = {
  id: string;
  amount_due: number;
  due_date: string;
  status: string;
  registration_orders: {
    users: { first_name: string; last_name: string } | null;
    families: { family_name: string } | null;
  } | null;
};

type EmailRow = {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  recipient_count: number;
};

type DashboardData = {
  activeSemesters: SemesterRow[];
  recentRegs: RecentReg[];
  totalEnrolled: number;
  openSemesterCount: number;
  activeClassCount: number;
  overduePayments: OverdueRow[];
  recentEmails: EmailRow[];
};

/* ─── Helpers ───────────────────────────────────────────────────────── */

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function initials(first: string, last: string): string {
  return (first[0] ?? "") + (last[0] ?? "");
}

const AVATAR_COLORS = [
  { bg: "rgba(158,196,180,.25)",  text: "#20503A" },
  { bg: "rgba(196,160,212,.20)",  text: "#5A2878" },
  { bg: "rgba(212,160,192,.20)",  text: "#702858" },
  { bg: "rgba(232,184,176,.20)",  text: "#802818" },
  { bg: "rgba(125,206,194,.20)",  text: "#0A5A50" },
];

function avatarColor(str: string) {
  let hash = 0;
  for (const c of str) hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
}

const STATUS_LABEL: Record<string, string> = {
  draft:      "Draft",
  published:  "Published",
  scheduled:  "Scheduled",
  archived:   "Archived",
  cancelled:  "Cancelled",
};

const STATUS_BADGE: Record<string, BadgeStatus> = {
  draft:      "neutral",
  published:  "success",
  scheduled:  "info",
  archived:   "error",
  cancelled:  "error",
};

const EMAIL_STATUS_BADGE: Record<string, BadgeStatus> = {
  draft:      "neutral",
  scheduled:  "info",
  sending:    "warning",
  sent:       "success",
  failed:     "error",
  cancelled:  "error",
};

/* ─── Metric card ───────────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="admin-card-stat flex flex-col">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {sub && <p className="admin-stat-sub">{sub}</p>}
    </div>
  );
}

/* ─── Section header row ────────────────────────────────────────────── */

function SectionHeader({
  title,
  linkLabel,
  linkHref,
}: {
  title: string;
  linkLabel?: string;
  linkHref?: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3 border-b"
      style={{ borderColor: "var(--admin-border-sub)" }}
    >
      <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
        {title}
      </p>
      {linkLabel && linkHref && (
        <Link
          href={linkHref}
          className="text-[11px] font-medium"
          style={{ color: "var(--admin-sidebar-active)" }}
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/* ─── Table header ──────────────────────────────────────────────────── */

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

/* ─── Overview tab ──────────────────────────────────────────────────── */

const STATUS_PRIORITY: Record<string, number> = { published: 0, scheduled: 1 };

function OverviewTab({
  data,
  onSemesterArchived,
  onSemesterDeleted,
}: {
  data: DashboardData;
  onSemesterArchived: (id: string) => void;
  onSemesterDeleted: (id: string) => void;
}) {
  const { activeSemesters, recentRegs, totalEnrolled, openSemesterCount, activeClassCount } = data;
  const [search, setSearch] = useState("");
  const [statusSort, setStatusSort] = useState<"asc" | "desc" | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openRegMenuId, setOpenRegMenuId] = useState<string | null>(null);
  const [semView, setSemView] = useState<"active" | "past">("active");
  const router = useRouter();
  const [archivedSemesters, setArchivedSemesters] = useState<SemesterRow[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  useEffect(() => {
    if (semView !== "past") return;
    setArchivedLoading(true);
    createClient()
      .from("semesters")
      .select("id, name, status, publish_at, created_at")
      .eq("status", "archived")
      .order("created_at", { ascending: false })
      .then(({ data: rows }) => {
        setArchivedSemesters((rows ?? []).map((s) => ({ ...s })));
        setArchivedLoading(false);
      });
  }, [semView]);

  const displayed = useMemo(() => {
    const source = semView === "active" ? activeSemesters : archivedSemesters;
    let list = [...source];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    if (statusSort) {
      list.sort((a, b) => {
        const diff =
          (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99);
        return statusSort === "asc" ? diff : -diff;
      });
    }
    return list;
  }, [activeSemesters, archivedSemesters, semView, search, statusSort]);

  function cycleStatusSort() {
    setStatusSort((prev) =>
      prev === null ? "asc" : prev === "asc" ? "desc" : null
    );
  }

  async function handleArchive(id: string) {
    setArchivingId(id);
    try {
      await archiveSemester(id);
      onSemesterArchived(id);
    } finally {
      setArchivingId(null);
      setConfirmArchiveId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteSemester(id);
      // Remove from whichever list it lives in (active or past).
      setArchivedSemesters((prev) => prev.filter((s) => s.id !== id));
      onSemesterDeleted(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
      setOpenMenuId(null);
    }
  }

  const SortIcon =
    statusSort === "asc"
      ? ArrowUp
      : statusSort === "desc"
      ? ArrowDown
      : ArrowUpDown;

  return (
    <>
    {(openMenuId || openRegMenuId) && (
      <div className="fixed inset-0 z-10" onClick={() => { setOpenMenuId(null); setConfirmArchiveId(null); setConfirmDeleteId(null); setOpenRegMenuId(null); }} />
    )}
    <div className="space-y-3 md:space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        <MetricCard label="Registrations" value={totalEnrolled.toLocaleString()} sub="confirmed enrollments" />
        <MetricCard label="Open semesters" value={String(openSemesterCount)} sub="published" />
        <MetricCard label="Active classes" value={String(activeClassCount)} sub="across open semesters" />
        <MetricCard label="Sessions this week" value="—" sub="next 7 days" />
      </div>

      {/* Active semesters */}
      <div className="admin-card overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--admin-border-sub)" }}
        >
          <p className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
            Semesters
          </p>
          <div className="flex items-center gap-2">
            {/* Active / Past toggle */}
            <div className="inline-flex rounded-md overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              {(["active", "past"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSemView(v)}
                  className="px-3 py-1 text-[11.5px] font-medium transition-colors"
                  style={{
                    background: semView === v ? "var(--admin-sidebar-active)" : "var(--admin-surface-sub)",
                    color: semView === v ? "#fff" : "var(--admin-text-muted)",
                    borderRight: v === "active" ? "1px solid var(--admin-border)" : "none",
                    cursor: "pointer",
                  }}
                >
                  {v === "active" ? "Active" : "Past"}
                </button>
              ))}
            </div>
            {/* Create semester — desktop only (mobile uses FAB) */}
            <Link
              href="/admin/semesters/new"
              className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium"
              style={{ background: "var(--admin-sidebar-active)", color: "#fff" }}
            >
              <Plus size={12} />
              Create
            </Link>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-5 py-2.5 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: "var(--admin-surface-sub)", border: "1px solid var(--admin-border)" }}
          >
            <Search size={13} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search semesters…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[12.5px]"
              style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-[11px] leading-none"
                style={{ color: "var(--admin-text-faint)" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Table header — desktop only */}
        <div
          className="hidden md:flex items-center px-5 py-2"
          style={{ background: "var(--admin-table-header-bg)" }}
        >
          <span
            className="flex-1 text-[10.5px] font-medium uppercase tracking-wide"
            style={{ color: "var(--admin-table-header-text)" }}
          >
            Semester
          </span>
          <span
            className="w-28 text-right text-[10.5px] font-medium uppercase tracking-wide"
            style={{ color: "var(--admin-table-header-text)" }}
          >
            Registrations
          </span>
          <button
            onClick={cycleStatusSort}
            className="w-24 flex items-center justify-end gap-1 text-[10.5px] font-medium uppercase tracking-wide transition-opacity hover:opacity-80"
            style={{ color: "var(--admin-table-header-text)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            Status
            <SortIcon size={11} />
          </button>
          <span className="w-10" />
        </div>

        {archivedLoading ? (
          <div className="flex items-center justify-center py-8">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--admin-sidebar-active)", borderTopColor: "transparent" }}
            />
          </div>
        ) : displayed.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            {search
              ? `No semesters matching "${search}"`
              : semView === "active"
              ? "No active semesters"
              : "No archived semesters"}
          </p>
        ) : (
          // Scroll window grows with viewport height — taller screens show more
          // semesters before scrolling (bounded so it never gets unwieldy).
          <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: "clamp(340px, calc(100vh - 340px), 900px)" }}>
          <ul>
            {displayed.map((s, i) => {
              // Last rows sit at the bottom of the overflow-clipped scroll
              // window — flip the menu upward so it isn't cut off.
              const flipUp = displayed.length > 2 && i >= displayed.length - 2;
              return (
              <li
                key={s.id}
                onClick={() => router.push(`/admin/semesters/${s.id}`)}
                className="flex items-center px-4 md:px-5 py-3.5 md:py-3 border-t cursor-pointer"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: "var(--admin-surface)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
              >
                {/* Name + meta — always shown */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/admin/semesters/${s.id}`}
                    className="text-[13.5px] md:text-[13px] font-medium truncate block hover:underline"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {s.name}
                  </Link>
                  {s.publish_at && (
                    <p className="text-[11.5px] md:text-[11px] mt-0.5 truncate" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                      Published {formatDate(s.publish_at.split("T")[0])}
                    </p>
                  )}
                </div>

                {/* Mobile right: badge + reg count stacked */}
                <div className="flex flex-col items-end gap-1 ml-3 shrink-0 md:hidden">
                  <Badge status={STATUS_BADGE[s.status] ?? "neutral"}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                  <span className="text-[11.5px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                    {s.reg_count != null ? `${s.reg_count.toLocaleString()} reg` : "—"}
                  </span>
                </div>

                {/* Desktop right: columns */}
                <div className="hidden md:flex items-center">
                  <div className="w-28 text-right">
                    <span className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
                      {s.reg_count != null ? s.reg_count.toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="w-24 flex justify-end">
                    <Badge status={STATUS_BADGE[s.status] ?? "neutral"}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </div>
                  <div className="w-10 flex items-center justify-end relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === s.id ? null : s.id);
                      setConfirmArchiveId(null);
                      setConfirmDeleteId(null);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:opacity-70"
                    style={{
                      color: "var(--admin-text-muted)",
                      background: openMenuId === s.id ? "var(--admin-surface-sub)" : "transparent",
                      border: openMenuId === s.id ? "1px solid var(--admin-border)" : "1px solid transparent",
                    }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {openMenuId === s.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute right-0 ${flipUp ? "bottom-full mb-1" : "top-full mt-1"} rounded-lg shadow-lg z-20 overflow-hidden`}
                      style={{
                        background: "var(--admin-surface)",
                        border: "1px solid var(--admin-border)",
                        minWidth: "168px",
                      }}
                    >
                      <Link
                        href={`/admin/semesters/${s.id}/edit`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px] transition-colors hover:opacity-80"
                        style={{ color: "var(--admin-text)", background: "transparent", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/classes?semester=${s.id}`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px] transition-colors"
                        style={{ color: "var(--admin-text)", background: "transparent", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Classes &amp; Offerings
                      </Link>
                      <Link
                        href={`/admin/reports?semester=${s.id}`}
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }}
                        className="flex items-center px-3.5 py-2 text-[12px] transition-colors"
                        style={{ color: "var(--admin-text)", background: "transparent", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Reports
                      </Link>
                      <div style={{ height: "1px", background: "var(--admin-border-sub)", margin: "2px 0" }} />
                      {confirmArchiveId === s.id ? (
                        <div className="px-3.5 py-2 flex items-center gap-2">
                          <button
                            onClick={() => handleArchive(s.id)}
                            disabled={archivingId === s.id}
                            className="text-[11px] font-medium px-2 py-1 rounded"
                            style={{
                              color: "#fff",
                              background: "#8E2A23",
                              opacity: archivingId === s.id ? 0.6 : 1,
                              cursor: archivingId === s.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {archivingId === s.id ? "Archiving…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmArchiveId(null)}
                            className="text-[11px]"
                            style={{ color: "var(--admin-text-faint)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmArchiveId(s.id)}
                          className="w-full text-left flex items-center px-3.5 py-2 text-[12px] transition-colors"
                          style={{ color: "#802818", background: "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,40,24,.06)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          Archive
                        </button>
                      )}
                      <div style={{ height: "1px", background: "var(--admin-border-sub)", margin: "2px 0" }} />
                      {confirmDeleteId === s.id ? (
                        <div className="px-3.5 py-2">
                          <p className="text-[11px] mb-1.5" style={{ color: "var(--admin-text-muted)" }}>
                            Delete permanently?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(s.id)}
                              disabled={deletingId === s.id}
                              className="text-[11px] font-medium px-2 py-1 rounded"
                              style={{
                                color: "#fff",
                                background: "#B91C1C",
                                opacity: deletingId === s.id ? 0.6 : 1,
                                cursor: deletingId === s.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {deletingId === s.id ? "Deleting…" : "Delete"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px]"
                              style={{ color: "var(--admin-text-faint)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(s.id)}
                          className="w-full text-left flex items-center px-3.5 py-2 text-[12px] transition-colors"
                          style={{ color: "#B91C1C", background: "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(185,28,28,.06)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </div>{/* end desktop columns */}
              </li>
              );
            })}
          </ul>
          </div>
        )}

        {/* Mobile: "View all semesters" footer */}
        <div
          className="md:hidden border-t py-3.5 text-center"
          style={{ borderColor: "var(--admin-border-sub)" }}
        >
          <Link
            href="/admin/semesters"
            className="text-[13px] font-semibold"
            style={{ color: "var(--admin-sidebar-active)" }}
          >
            View all semesters
          </Link>
        </div>
      </div>

      {/* Recent registrations */}
      <div className="admin-card overflow-hidden">
        <SectionHeader title="Recent registrations" linkLabel="See all" linkHref="/admin/families" />
        {recentRegs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            No recent registrations
          </p>
        ) : (
          <ul>
            {recentRegs.map((r) => {
              const dancer = r.dancers;
              const cls = r.class_meetings;
              const batch = r.registration_orders;
              const name = dancer ? `${dancer.first_name} ${dancer.last_name}` : "Unknown";
              const color = avatarColor(name);
              const familyId = batch?.family_id;
              const dancerId = r.dancer_id;
              const className = cls?.classes?.name;
              const semName = cls?.semesters?.name;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-5 py-3 border-b"
                  style={{ borderColor: "var(--admin-border-sub)" }}
                >
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {dancer ? initials(dancer.first_name, dancer.last_name) : "?"}
                  </div>

                  {/* Name + class */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={familyId ? `/admin/families/${familyId}` : dancerId ? `/admin/dancers/${dancerId}` : "#"}
                      className="text-[12.5px] font-medium truncate block hover:underline"
                      style={{ color: "var(--admin-text)" }}
                    >
                      {name}
                    </Link>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                      {batch?.users && familyId && (
                        <>
                          <Link
                            href={`/admin/families/${familyId}`}
                            className="hover:underline"
                            style={{ color: "var(--admin-text-muted)" }}
                          >
                            {batch.users.first_name} {batch.users.last_name}
                          </Link>
                          {" · "}
                        </>
                      )}
                      {className ?? "—"}
                      {semName && <span> · {semName}</span>}
                      <span> · {timeAgo(r.created_at)}</span>
                    </p>
                  </div>

                  {/* Amount */}
                  {batch?.grand_total != null && (
                    <span className="text-[13px] font-semibold shrink-0" style={{ color: "var(--admin-text)" }}>
                      {formatCurrency(batch.grand_total)}
                    </span>
                  )}

                  {/* ... menu */}
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRegMenuId(openRegMenuId === r.id ? null : r.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:opacity-70"
                      style={{
                        color: "var(--admin-text-muted)",
                        background: openRegMenuId === r.id ? "var(--admin-surface-sub)" : "transparent",
                        border: openRegMenuId === r.id ? "1px solid var(--admin-border)" : "1px solid transparent",
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {openRegMenuId === r.id && (
                      <div
                        className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                        style={{
                          background: "var(--admin-surface)",
                          border: "1px solid var(--admin-border)",
                          minWidth: "172px",
                        }}
                      >
                        {dancerId && (
                          <Link
                            href={`/admin/dancers/${dancerId}`}
                            onClick={() => setOpenRegMenuId(null)}
                            className="flex items-center px-3.5 py-2 text-[12px]"
                            style={{ color: "var(--admin-text)", background: "transparent" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            View dancer profile
                          </Link>
                        )}
                        {familyId && (
                          <Link
                            href={`/admin/families/${familyId}`}
                            onClick={() => setOpenRegMenuId(null)}
                            className="flex items-center px-3.5 py-2 text-[12px]"
                            style={{ color: "var(--admin-text)", background: "transparent" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            View family
                          </Link>
                        )}
                        <div style={{ height: "1px", background: "var(--admin-border-sub)", margin: "2px 0" }} />
                        <Link
                          href={familyId ? `/admin/emails/new?familyId=${familyId}` : "/admin/emails/new"}
                          onClick={() => setOpenRegMenuId(null)}
                          className="flex items-center px-3.5 py-2 text-[12px]"
                          style={{ color: "var(--admin-text)", background: "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          Email family
                        </Link>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Mobile: "View all registrations" footer */}
        {recentRegs.length > 0 && (
          <div
            className="md:hidden border-t py-3.5 text-center"
            style={{ borderColor: "var(--admin-border-sub)" }}
          >
            <Link
              href="/admin/families"
              className="text-[13px] font-semibold"
              style={{ color: "var(--admin-sidebar-active)" }}
            >
              View all registrations
            </Link>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      const supabase = createClient();
      try {

      // Active semesters — drafts included so they surface on the dashboard
      // (this is the single source of truth; the old /admin/semesters list redirects here).
      const { data: semesters } = await supabase
        .from("semesters")
        .select("id, name, status, publish_at, created_at")
        .in("status", ["published", "scheduled", "draft"])
        .order("created_at", { ascending: false });

      // Distinct classes across open semesters — drafts excluded so the metric stays "open" only.
      const activeSemesterIds = (semesters ?? [])
        .filter((s) => s.status !== "draft")
        .map((s) => s.id);
      let activeClassCount = 0;
      if (activeSemesterIds.length > 0) {
        const { data: activeClassSessions } = await supabase
          .from("class_meetings")
          .select("class_id")
          .in("semester_id", activeSemesterIds);
        activeClassCount = new Set((activeClassSessions ?? []).map((cs: any) => cs.class_id)).size;
      }

      // Total confirmed enrollments — across both tables.
      const [{ count: totalRegistrationsCount }, { count: totalScheduleEnrollmentsCount }] = await Promise.all([
        supabase.from("meeting_enrollments").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase
          .from("section_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("status", "confirmed"),
      ]);
      const totalEnrolled = (totalRegistrationsCount ?? 0) + (totalScheduleEnrollmentsCount ?? 0);

      // Per-semester counts — merge both sources.
      const [{ data: regCounts }, { data: enrollCounts }] = await Promise.all([
        supabase
          .from("meeting_enrollments")
          .select("meeting_id, class_meetings(semester_id)")
          .eq("status", "confirmed"),
        supabase
          .from("section_enrollments")
          .select("section_id, class_sections(semester_id)")
          .eq("status", "confirmed"),
      ]);

      const semesterRegMap: Record<string, number> = {};
      for (const r of regCounts ?? []) {
        const semId = (r.class_meetings as any)?.semester_id;
        if (semId) semesterRegMap[semId] = (semesterRegMap[semId] ?? 0) + 1;
      }
      for (const e of enrollCounts ?? []) {
        const semId = (e.class_sections as any)?.semester_id;
        if (semId) semesterRegMap[semId] = (semesterRegMap[semId] ?? 0) + 1;
      }

      const activeSemesters: SemesterRow[] = (semesters ?? []).map((s) => ({
        ...s,
        reg_count: semesterRegMap[s.id] ?? 0,
      }));

      // Recent registrations — fetch 60 so dedup by dancer+class leaves enough rows.
      // TODO(Phase 3a follow-up): merge with section_enrollments so admin-created
      // full-term enrollments also appear in the dashboard activity feed.
      const { data: recentRegsRaw } = await supabase
        .from("meeting_enrollments")
        .select(
          `id, created_at, dancer_id,
           dancers(first_name, last_name),
           class_meetings(classes(name), semesters(name)),
           registration_orders:registration_batch_id(grand_total, family_id, users:parent_id(first_name, last_name))`
        )
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(60);

      // Deduplicate: one row per dancer+class (keep the most recent)
      const seenRegKey = new Set<string>();
      const recentRegs = (recentRegsRaw ?? []).filter((r: any) => {
        const key = `${r.dancer_id}-${r.class_meetings?.classes?.name ?? ""}`;
        if (seenRegKey.has(key)) return false;
        seenRegKey.add(key);
        return true;
      }).slice(0, 10);

      // Overdue installments
      const { data: overduePayments } = await supabase
        .from("order_payment_installments")
        .select(
          `id, amount_due, due_date, status,
           registration_orders:batch_id(
             users:parent_id(first_name, last_name),
             families:family_id(family_name)
           )`
        )
        .eq("status", "overdue")
        .order("due_date", { ascending: true })
        .limit(10);

      // Recent emails (last 8, all statuses)
      const { data: recentEmails } = await supabase
        .from("emails")
        .select(
          `id, subject, status, sent_at, scheduled_at, created_at,
           recipient_count:email_recipients(count)`
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);

      setData({
        activeSemesters,
        recentRegs: (recentRegs ?? []) as unknown as RecentReg[],
        totalEnrolled: totalEnrolled ?? 0,
        openSemesterCount: (semesters ?? []).filter((s) => s.status === "published").length,
        activeClassCount,
        overduePayments: (overduePayments ?? []) as unknown as OverdueRow[],
        recentEmails: ((recentEmails ?? []) as any[]).map((e) => ({
          ...e,
          recipient_count: Array.isArray(e.recipient_count)
            ? (e.recipient_count[0]?.count ?? 0)
            : (e.recipient_count ?? 0),
        })),
      });
    } finally {
      setLoading(false);
    }
    }

    fetchDashboard();

  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
          />
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            Loading dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0 min-w-0 md:-mx-8 md:-my-8" style={{ minHeight: "calc(100vh - 56px)" }}>
      {/* Dashboard content */}
      <div className="flex-1 min-w-0 w-0 overflow-y-auto overflow-x-hidden">
        {/* Body */}
        <div className="pt-2 pb-28 px-0 md:px-8 md:pt-6 md:pb-8">
          <OverviewTab
            data={data}
            onSemesterArchived={(id) =>
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      activeSemesters: prev.activeSemesters.filter((s) => s.id !== id),
                      openSemesterCount: prev.openSemesterCount - 1,
                    }
                  : prev
              )
            }
            onSemesterDeleted={(id) =>
              setData((prev) => {
                if (!prev) return prev;
                const activeSemesters = prev.activeSemesters.filter((s) => s.id !== id);
                return {
                  ...prev,
                  activeSemesters,
                  openSemesterCount: activeSemesters.filter((s) => s.status === "published").length,
                };
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
