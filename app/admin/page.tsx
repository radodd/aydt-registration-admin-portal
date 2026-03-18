"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { DashboardRightPanel } from "./_components/DashboardRightPanel";
import { EmailsTabSection } from "./_components/EmailsTabSection";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal, Plus } from "lucide-react";
import { archiveSemester } from "./semesters/actions/archiveSemester";

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
  class_sessions: {
    classes: { name: string } | null;
    semesters: { name: string } | null;
  } | null;
  registration_batches: {
    grand_total: number | null;
    family_id: string | null;
  } | null;
};

type OverdueRow = {
  id: string;
  amount_due: number;
  due_date: string;
  status: string;
  registration_batches: {
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
  overduePayments: OverdueRow[];
  recentEmails: EmailRow[];
};

type PeopleDancerRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  grade: string | null;
  family_id: string | null;
  families: {
    users: { first_name: string; last_name: string; is_primary_parent: boolean }[];
  } | null;
};

type PeopleFamilyRow = {
  id: string;
  family_name: string | null;
  users: { first_name: string; last_name: string; is_primary_parent: boolean }[];
  dancer_names: string[];
  class_count: number;
};

type WaitlistRow = {
  id: string;
  position: number;
  status: string;
  invitation_sent_at: string | null;
  dancers: { id: string; first_name: string; last_name: string; family_id: string | null; family_name: string | null } | null;
  class_name: string | null;
  semester_name: string | null;
};

type PeopleData = {
  dancers: PeopleDancerRow[];
  families: PeopleFamilyRow[];
  waitlist: WaitlistRow[];
  totalDancers: number;
  totalFamilies: number;
  totalWaitlisted: number;
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

/* ─── Tab nav ───────────────────────────────────────────────────────── */

type Tab = "overview" | "people" | "finance" | "emails";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "people",   label: "People" },
  { key: "finance",  label: "Finance" },
  { key: "emails",   label: "Emails" },
];

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
}: {
  data: DashboardData;
  onSemesterArchived: (id: string) => void;
}) {
  const { activeSemesters, recentRegs, totalEnrolled, openSemesterCount } = data;
  const [search, setSearch] = useState("");
  const [statusSort, setStatusSort] = useState<"asc" | "desc" | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openRegMenuId, setOpenRegMenuId] = useState<string | null>(null);
  const [semView, setSemView] = useState<"active" | "past">("active");
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

  const SortIcon =
    statusSort === "asc"
      ? ArrowUp
      : statusSort === "desc"
      ? ArrowDown
      : ArrowUpDown;

  return (
    <>
    {(openMenuId || openRegMenuId) && (
      <div className="fixed inset-0 z-10" onClick={() => { setOpenMenuId(null); setConfirmArchiveId(null); setOpenRegMenuId(null); }} />
    )}
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Registrations" value={totalEnrolled.toLocaleString()} sub="confirmed enrollments" />
        <MetricCard label="Open semesters" value={String(openSemesterCount)} sub="published" />
        <MetricCard label="Active classes" value="—" sub="across open semesters" />
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
            {/* Create semester */}
            <Link
              href="/admin/semesters/new"
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium"
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

        {/* Table header with clickable Status */}
        <div
          className="flex items-center px-5 py-2"
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
          <div className="overflow-y-auto" style={{ maxHeight: "272px" }}>
          <ul>
            {displayed.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                <div className="flex-1">
                  <Link
                    href={`/admin/semesters/${s.id}`}
                    className="text-[13px] font-medium hover:underline"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {s.name}
                  </Link>
                  {s.publish_at && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                      Published {formatDate(s.publish_at.split("T")[0])}
                    </p>
                  )}
                </div>
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
                      className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
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
                        href={`/admin/semesters/${s.id}/dashboard`}
                        onClick={() => setOpenMenuId(null)}
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
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </div>
        )}
      </div>

      {/* Recent registrations */}
      <div className="admin-card overflow-hidden">
        <SectionHeader title="Recent registrations" />
        {recentRegs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            No recent registrations
          </p>
        ) : (
          <ul>
            {recentRegs.map((r) => {
              const dancer = r.dancers;
              const cls = r.class_sessions;
              const batch = r.registration_batches;
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
                      href={dancerId ? `/admin/dancers/${dancerId}` : familyId ? `/admin/families/${familyId}` : "#"}
                      className="text-[12.5px] font-medium truncate block hover:underline"
                      style={{ color: "var(--admin-text)" }}
                    >
                      {name}
                    </Link>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
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
      </div>
    </div>
    </>
  );
}

/* ─── People tab ────────────────────────────────────────────────────── */

type SubPeopleTab = "dancers" | "families" | "waitlisted";

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  return String(Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 86_400_000)));
}

function formatGrade(grade: string | null): string {
  if (!grade) return "—";
  const n = parseInt(grade, 10);
  if (isNaN(n)) return grade; // "K", "Pre-K", etc.
  const mod = n % 100;
  const suffix =
    mod >= 11 && mod <= 13 ? "th"
    : n % 10 === 1 ? "st"
    : n % 10 === 2 ? "nd"
    : n % 10 === 3 ? "rd"
    : "th";
  return `${n}${suffix}`;
}

const WAITLIST_STATUS_BADGE: Record<string, BadgeStatus> = {
  waiting:  "neutral",
  invited:  "info",
  expired:  "error",
  accepted: "success",
  declined: "error",
};

const WAITLIST_STATUS_LABEL: Record<string, string> = {
  waiting:  "Not yet",
  invited:  "Invited",
  expired:  "Expired",
  accepted: "Accepted",
  declined: "Declined",
};

function DancersTable({ rows, search }: { rows: PeopleDancerRow[]; search: string }) {
  return (
    <>
      <TableHead cols={[
        { label: "Dancer",  className: "flex-1" },
        { label: "Age",     className: "w-16 text-right" },
        { label: "Grade",   className: "w-32 pl-8" },
        { label: "Parent",  className: "w-40" },
        { label: "",        className: "w-28" },
      ]} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
          {search ? `No dancers matching "${search}"` : "No dancers"}
        </p>
      ) : (
        <ul>
          {rows.map((d, i) => {
            const name = `${d.first_name} ${d.last_name}`;
            const color = avatarColor(name);
            const familyUsers = d.families?.users ?? [];
            const parent = familyUsers.find((u) => u.is_primary_parent) ?? familyUsers[0];
            const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "—";
            return (
              <li
                key={d.id}
                className="group flex items-center px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {initials(d.first_name, d.last_name)}
                  </div>
                  <button
                    onClick={() => alert("Dancer profile coming soon")}
                    className="text-[12.5px] font-medium truncate hover:underline text-left"
                    style={{ color: "var(--admin-text)", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-outfit)" }}
                  >
                    {name}
                  </button>
                </div>
                <p className="w-16 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {calcAge(d.birth_date)}
                </p>
                <p className="w-32 pl-8 text-[12px] truncate" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                  {formatGrade(d.grade)}
                </p>
                <p className="w-40 text-[12px] truncate" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {parentName}
                </p>
                <div className="w-28 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.family_id && (
                    <Link
                      href={`/admin/emails/new?familyId=${d.family_id}`}
                      className="px-2 py-1 rounded text-[11px] font-medium"
                      style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", background: "var(--admin-surface)", fontFamily: "var(--font-outfit)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
                    >
                      Email
                    </Link>
                  )}
                  <button
                    onClick={() => alert("Dancer profile coming soon")}
                    className="px-2 py-1 rounded text-[11px] font-medium"
                    style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", background: "var(--admin-surface)", cursor: "pointer", fontFamily: "var(--font-outfit)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
                  >
                    View
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
          Showing {rows.length.toLocaleString()} {rows.length === 1 ? "dancer" : "dancers"}
        </p>
      )}
    </>
  );
}

function FamiliesTable({ rows, search }: { rows: PeopleFamilyRow[]; search: string }) {
  return (
    <>
      <TableHead cols={[
        { label: "Family",         className: "flex-1" },
        { label: "Primary Parent", className: "w-40" },
        { label: "Dancers",        className: "w-48" },
        { label: "Classes",        className: "w-20 text-right" },
        { label: "",               className: "w-28" },
      ]} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
          {search ? `No families matching "${search}"` : "No families"}
        </p>
      ) : (
        <ul>
          {rows.map((f, i) => {
            const familyName = f.family_name ?? "Unknown family";
            const primaryParent = f.users.find((u) => u.is_primary_parent) ?? f.users[0];
            const primaryParentName = primaryParent
              ? `${primaryParent.first_name} ${primaryParent.last_name}`
              : "—";
            const color = primaryParent
              ? avatarColor(`${primaryParent.first_name} ${primaryParent.last_name}`)
              : avatarColor(familyName);
            const avatarInitials = primaryParent
              ? initials(primaryParent.first_name, primaryParent.last_name)
              : initials(familyName.split(" ")[0] ?? "F", familyName.split(" ")[1] ?? "A");
            const MAX_SHOWN = 2;
            const shownNames = f.dancer_names.slice(0, MAX_SHOWN).join(", ");
            const extra = f.dancer_names.length - MAX_SHOWN;
            const dancerNamesDisplay =
              f.dancer_names.length === 0
                ? "—"
                : extra > 0
                ? `${shownNames} +${extra} more`
                : shownNames;
            return (
              <li
                key={f.id}
                className="group flex items-center px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {avatarInitials}
                  </div>
                  <Link
                    href={`/admin/families/${f.id}`}
                    className="text-[12.5px] font-medium truncate hover:underline"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {familyName}
                  </Link>
                </div>
                <p className="w-40 text-[12px] truncate" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {primaryParentName}
                </p>
                <p className="w-48 text-[12px] truncate" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                  {dancerNamesDisplay}
                </p>
                <p className="w-20 text-right text-[12px]" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {f.class_count}
                </p>
                <div className="w-28 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    href={`/admin/emails/new?familyId=${f.id}`}
                    className="px-2 py-1 rounded text-[11px] font-medium"
                    style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", background: "var(--admin-surface)", fontFamily: "var(--font-outfit)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
                  >
                    Email
                  </Link>
                  <Link
                    href={`/admin/families/${f.id}`}
                    className="px-2 py-1 rounded text-[11px] font-medium"
                    style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", background: "var(--admin-surface)", fontFamily: "var(--font-outfit)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
                  >
                    View
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
          Showing {rows.length.toLocaleString()} {rows.length === 1 ? "family" : "families"}
        </p>
      )}
    </>
  );
}

function WaitlistTable({ rows, search }: { rows: WaitlistRow[]; search: string }) {
  return (
    <>
      <TableHead cols={[
        { label: "Dancer",   className: "flex-1" },
        { label: "Class",    className: "w-40" },
        { label: "Semester", className: "w-36" },
        { label: "Position", className: "w-20 text-right" },
        { label: "Invited?", className: "w-24 text-right" },
        { label: "",         className: "w-28" },
      ]} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
          {search ? `No waitlisted dancers matching "${search}"` : "No waitlisted dancers"}
        </p>
      ) : (
        <ul>
          {rows.map((w, i) => {
            const dancer = w.dancers;
            const name = dancer ? `${dancer.first_name} ${dancer.last_name}` : "Unknown";
            const color = avatarColor(name);
            return (
              <li
                key={w.id}
                className="group flex items-center px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {dancer ? initials(dancer.first_name, dancer.last_name) : "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--admin-text)" }}>
                      {name}
                    </p>
                    {dancer?.family_name && (
                      <p className="text-[11px]" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                        {dancer.family_name}
                      </p>
                    )}
                  </div>
                </div>
                <p className="w-40 text-[12px] truncate" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  {w.class_name ?? "—"}
                </p>
                <p className="w-36 text-[11px] truncate" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
                  {w.semester_name ?? "—"}
                </p>
                <p className="w-20 text-right text-[12px] font-medium" style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}>
                  #{w.position}
                </p>
                <div className="w-24 flex justify-end">
                  <Badge status={WAITLIST_STATUS_BADGE[w.status] ?? "neutral"}>
                    {WAITLIST_STATUS_LABEL[w.status] ?? w.status}
                  </Badge>
                </div>
                <div className="w-28 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {w.status === "waiting" && (
                    <button
                      onClick={() => alert("Invite flow coming soon")}
                      className="px-2 py-1 rounded text-[11px] font-medium"
                      style={{ color: "#fff", background: "var(--admin-sidebar-active)", border: "none", cursor: "pointer", fontFamily: "var(--font-outfit)" }}
                    >
                      Invite
                    </button>
                  )}
                  {w.status === "invited" && (
                    <button
                      onClick={() => alert("View invite coming soon")}
                      className="px-2 py-1 rounded text-[11px] font-medium"
                      style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", background: "var(--admin-surface)", cursor: "pointer", fontFamily: "var(--font-outfit)" }}
                    >
                      View Invite
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}>
          Showing {rows.length.toLocaleString()} waitlisted
        </p>
      )}
    </>
  );
}

function PeopleTab({
  peopleData,
  loading,
}: {
  peopleData: PeopleData | null;
  loading: boolean;
}) {
  const [subTab, setSubTab] = useState<SubPeopleTab>("dancers");
  const [search, setSearch] = useState("");

  const filteredDancers = useMemo(() => {
    if (!peopleData) return [];
    const q = search.toLowerCase();
    if (!q) return peopleData.dancers;
    return peopleData.dancers.filter((d) => {
      const name = `${d.first_name} ${d.last_name}`.toLowerCase();
      const email = (d.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [peopleData, search]);

  const filteredFamilies = useMemo(() => {
    if (!peopleData) return [];
    const q = search.toLowerCase();
    if (!q) return peopleData.families;
    return peopleData.families.filter((f) => {
      const name = (f.family_name ?? "").toLowerCase();
      const parents = f.users.map((u) => `${u.first_name} ${u.last_name}`).join(" ").toLowerCase();
      return name.includes(q) || parents.includes(q);
    });
  }, [peopleData, search]);

  const filteredWaitlist = useMemo(() => {
    if (!peopleData) return [];
    const q = search.toLowerCase();
    if (!q) return peopleData.waitlist;
    return peopleData.waitlist.filter((w) => {
      const dancer = w.dancers ? `${w.dancers.first_name} ${w.dancers.last_name}`.toLowerCase() : "";
      const cls = (w.class_name ?? "").toLowerCase();
      return dancer.includes(q) || cls.includes(q);
    });
  }, [peopleData, search]);

  const SUB_TABS: { key: SubPeopleTab; label: string; count: number }[] = [
    { key: "dancers",    label: "Dancers",    count: peopleData?.totalDancers ?? 0 },
    { key: "families",   label: "Families",   count: peopleData?.totalFamilies ?? 0 },
    { key: "waitlisted", label: "Waitlisted", count: peopleData?.totalWaitlisted ?? 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Dancers" value={peopleData ? peopleData.totalDancers.toLocaleString() : "—"} sub="across all semesters" />
        <MetricCard label="Families" value={peopleData ? peopleData.totalFamilies.toLocaleString() : "—"} sub="active accounts" />
        <MetricCard label="Waitlisted" value={peopleData ? peopleData.totalWaitlisted.toLocaleString() : "—"} sub="across all classes" />
      </div>

      {/* Main card */}
      <div className="admin-card overflow-hidden">
        {/* Search bar */}
        <div className="px-5 py-2.5 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: "var(--admin-surface-sub)", border: "1px solid var(--admin-border)" }}
          >
            <Search size={13} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search by name, email, or class…"
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

        {/* Sub-tab pills */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
          {SUB_TABS.map((t) => {
            const active = subTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setSubTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--admin-sidebar-active)" : "transparent",
                  color: active ? "#fff" : "var(--admin-text-muted)",
                  border: active ? "none" : "1px solid var(--admin-border)",
                  cursor: "pointer",
                  fontFamily: "var(--font-outfit)",
                }}
              >
                {t.label}
                <span className="text-[11px]" style={{ opacity: active ? 0.8 : 0.6 }}>
                  {t.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {/* Tables */}
        {!loading && subTab === "dancers"    && <DancersTable    rows={filteredDancers}  search={search} />}
        {!loading && subTab === "families"   && <FamiliesTable   rows={filteredFamilies} search={search} />}
        {!loading && subTab === "waitlisted" && <WaitlistTable   rows={filteredWaitlist} search={search} />}
      </div>
    </div>
  );
}

/* ─── Finance tab ───────────────────────────────────────────────────── */

function FinanceTab({ data }: { data: DashboardData }) {
  const { overduePayments } = data;

  const totalOverdue = overduePayments.reduce((s, r) => s + r.amount_due, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Collected (YTD)" value="—" sub="payments received" />
        <MetricCard label="Outstanding" value="—" sub="across all families" />
        <MetricCard
          label="Overdue"
          value={String(overduePayments.length)}
          sub={overduePayments.length > 0 ? formatCurrency(totalOverdue) + " total" : "none past due"}
        />
        <MetricCard label="Credits issued" value="—" sub="this semester" />
      </div>

      <div className="admin-card overflow-hidden">
        <SectionHeader
          title="Overdue payments"
          linkLabel="All payments"
          linkHref="/admin/payments"
        />
        <TableHead cols={[
          { label: "Family",    className: "flex-1" },
          { label: "Balance",   className: "w-24 text-right" },
          { label: "Due date",  className: "w-28 text-right" },
          { label: "Status",    className: "w-24 text-right" },
        ]} />
        {overduePayments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            No overdue payments
          </p>
        ) : (
          <ul>
            {overduePayments.map((row, i) => {
              const batch = row.registration_batches;
              const user = batch?.users;
              const family = batch?.families;
              const familyName = family
                ? family.family_name
                : user
                ? `${user.first_name} ${user.last_name}`
                : "Unknown";
              const daysOverdue = Math.floor(
                (Date.now() - new Date(row.due_date + "T00:00:00").getTime()) / 86_400_000
              );
              return (
                <li
                  key={row.id}
                  className="flex items-center px-5 py-3 border-b"
                  style={{
                    borderColor: "var(--admin-border-sub)",
                    background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                  }}
                >
                  <div className="flex-1">
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--admin-text)" }}>
                      {familyName}
                    </p>
                  </div>
                  <p className="w-24 text-right text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
                    {formatCurrency(row.amount_due)}
                  </p>
                  <p className="w-28 text-right text-[11px]" style={{ color: "#802818", fontFamily: "var(--font-outfit)" }}>
                    {formatDate(row.due_date)}
                  </p>
                  <div className="w-24 flex justify-end">
                    <Badge status="error">{daysOverdue}d overdue</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [peopleData, setPeopleData] = useState<PeopleData | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);

  useEffect(() => {
    async function fetchDashboard() {
      const supabase = createClient();

      // Active semesters
      const { data: semesters } = await supabase
        .from("semesters")
        .select("id, name, status, publish_at, created_at")
        .in("status", ["published", "scheduled"])
        .order("created_at", { ascending: false });

      // Total confirmed registrations
      const { count: totalEnrolled } = await supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("status", "confirmed");

      // Registration counts per semester
      const { data: regCounts } = await supabase
        .from("registrations")
        .select("session_id, class_sessions(semester_id)")
        .eq("status", "confirmed");

      const semesterRegMap: Record<string, number> = {};
      for (const r of regCounts ?? []) {
        const semId = (r.class_sessions as any)?.semester_id;
        if (semId) semesterRegMap[semId] = (semesterRegMap[semId] ?? 0) + 1;
      }

      const activeSemesters: SemesterRow[] = (semesters ?? []).map((s) => ({
        ...s,
        reg_count: semesterRegMap[s.id] ?? 0,
      }));

      // Recent registrations — fetch 60 so dedup by dancer+class leaves enough rows
      const { data: recentRegsRaw } = await supabase
        .from("registrations")
        .select(
          `id, created_at, dancer_id,
           dancers(first_name, last_name),
           class_sessions(classes(name), semesters(name)),
           registration_batches:registration_batch_id(grand_total, family_id)`
        )
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(60);

      // Deduplicate: one row per dancer+class (keep the most recent)
      const seenRegKey = new Set<string>();
      const recentRegs = (recentRegsRaw ?? []).filter((r: any) => {
        const key = `${r.dancer_id}-${r.class_sessions?.classes?.name ?? ""}`;
        if (seenRegKey.has(key)) return false;
        seenRegKey.add(key);
        return true;
      }).slice(0, 10);

      // Overdue installments
      const { data: overduePayments } = await supabase
        .from("batch_payment_installments")
        .select(
          `id, amount_due, due_date, status,
           registration_batches:batch_id(
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
        overduePayments: (overduePayments ?? []) as unknown as OverdueRow[],
        recentEmails: ((recentEmails ?? []) as any[]).map((e) => ({
          ...e,
          recipient_count: Array.isArray(e.recipient_count)
            ? (e.recipient_count[0]?.count ?? 0)
            : (e.recipient_count ?? 0),
        })),
      });
      setLoading(false);
    }

    fetchDashboard();
  }, []);

  useEffect(() => {
    if (activeTab !== "people" || peopleData !== null) return;
    async function fetchPeople() {
      setPeopleLoading(true);
      const supabase = createClient();

      const [{ count: totalDancers }, { count: totalFamilies }, { count: totalWaitlisted }] = await Promise.all([
        supabase.from("dancers").select("*", { count: "exact", head: true }),
        supabase.from("families").select("*", { count: "exact", head: true }),
        supabase.from("waitlist_entries").select("*", { count: "exact", head: true }).in("status", ["waiting", "invited"]),
      ]);

      const [dancersRes, familiesRes, waitlistRes] = await Promise.all([
        supabase
          .from("dancers")
          .select("id, first_name, last_name, birth_date, grade, family_id, families!family_id(users!family_id(first_name, last_name, is_primary_parent))")
          .order("last_name", { ascending: true })
          .limit(200),

        supabase
          .from("families")
          .select(`
            id, family_name,
            users:users!family_id(first_name, last_name, is_primary_parent),
            dancers:dancers!family_id(
              id, first_name,
              registrations:registrations!dancer_id(id, status, class_sessions!session_id(classes(name)))
            )
          `)
          .order("family_name", { ascending: true })
          .limit(200),

        supabase
          .from("waitlist_entries")
          .select(`
            id, position, status, invitation_sent_at,
            dancers(id, first_name, last_name, family_id, families(family_name)),
            class_sessions!session_id(classes(name), semesters(name))
          `)
          .in("status", ["waiting", "invited"])
          .order("position", { ascending: true })
          .limit(200),
      ]);

      const families: PeopleFamilyRow[] = ((familiesRes.data ?? []) as any[]).map((f) => {
        const confirmedRegs = (f.dancers ?? []).flatMap((d: any) =>
          (d.registrations ?? []).filter((r: any) => r.status === "confirmed")
        );
        const uniqueClasses = new Set(
          confirmedRegs.map((r: any) => r.class_sessions?.classes?.name).filter(Boolean)
        );
        return {
          id: f.id,
          family_name: f.family_name,
          users: f.users ?? [],
          dancer_names: (f.dancers ?? []).map((d: any) => d.first_name).filter(Boolean),
          class_count: uniqueClasses.size,
        };
      });

      const waitlist: WaitlistRow[] = ((waitlistRes.data ?? []) as any[]).map((w) => {
        const dancer = Array.isArray(w.dancers) ? w.dancers[0] : w.dancers;
        const cs = Array.isArray(w.class_sessions) ? w.class_sessions[0] : w.class_sessions;
        return {
          id: w.id,
          position: w.position,
          status: w.status,
          invitation_sent_at: w.invitation_sent_at,
          dancers: dancer
            ? {
                id: dancer.id,
                first_name: dancer.first_name,
                last_name: dancer.last_name,
                family_id: dancer.family_id,
                family_name: dancer.families?.family_name ?? null,
              }
            : null,
          class_name: cs?.classes?.name ?? null,
          semester_name: cs?.semesters?.name ?? null,
        };
      });

      setPeopleData({
        dancers: (dancersRes.data ?? []) as PeopleDancerRow[],
        families,
        waitlist,
        totalDancers: totalDancers ?? 0,
        totalFamilies: totalFamilies ?? 0,
        totalWaitlisted: totalWaitlisted ?? 0,
      });
      setPeopleLoading(false);
    }
    fetchPeople();
  }, [activeTab, peopleData]);

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
    <div className="flex gap-0 -mx-8 -my-8" style={{ minHeight: "calc(100vh - 52px)" }}>
      {/* Tab content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Secondary nav tabs */}
        <div
          className="flex border-b px-8"
          style={{
            background: "var(--admin-surface)",
            borderColor: "var(--admin-border)",
          }}
        >
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="px-3.5 py-2.5 text-[12px] transition-colors border-b-2"
                style={{
                  borderBottomColor: active ? "var(--admin-sidebar-active)" : "transparent",
                  color: active ? "var(--admin-sidebar-active)" : "var(--admin-text-muted)",
                  fontWeight: active ? 500 : 400,
                  fontFamily: "var(--font-outfit)",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? "var(--admin-sidebar-active)" : "transparent"}`,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div className="px-8 py-6">
          {activeTab === "overview" && (
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
            />
          )}
          {activeTab === "people"   && <PeopleTab   peopleData={peopleData} loading={peopleLoading} />}
          {activeTab === "finance"  && <FinanceTab  data={data} />}
          {activeTab === "emails"   && <EmailsTabSection />}
        </div>
      </div>

      {/* Right panel */}
      <DashboardRightPanel emailsMode={activeTab === "emails"} />
    </div>
  );
}
