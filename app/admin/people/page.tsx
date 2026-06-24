"use client";

/*
 * People view — restored from the old dashboard "People" tab (removed in the
 * 2026-06-17 top-nav redesign). Standalone route at /admin/people with the
 * original three sub-tabs: Dancers, Families, Waitlisted.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";
import { Search, MoreHorizontal } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

type PeopleDancerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
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

type SubPeopleTab = "dancers" | "families" | "waitlisted";
type WaitlistFilter = "all" | "waiting" | "invited";

/* ─── Helpers ───────────────────────────────────────────────────────── */

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
  waiting:  "warning",
  invited:  "success",
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

/* ─── Metric card ───────────────────────────────────────────────────── */

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-card-stat flex flex-col">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {sub && <p className="admin-stat-sub">{sub}</p>}
    </div>
  );
}

/* ─── Dancers table ─────────────────────────────────────────────────── */

function DancersTable({ rows, search }: { rows: PeopleDancerRow[]; search: string }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  return (
    <>
      {openMenuId && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}

      {/* Desktop header — hidden on mobile */}
      <div className="hidden md:flex items-center px-5 py-2" style={{ background: "var(--admin-table-header-bg)" }}>
        <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Dancer</span>
        <span className="w-16 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Age</span>
        <span className="w-28 pl-6 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Grade</span>
        <span className="w-10" />
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
          {search ? `No dancers matching "${search}"` : "No dancers"}
        </p>
      ) : (
        <ul>
          {rows.map((d, i) => {
            const name = `${d.first_name} ${d.last_name}`;
            const color = avatarColor(name);
            const age = calcAge(d.birth_date);
            const grade = formatGrade(d.grade);
            return (
              <li
                key={d.id}
                className="flex items-center px-4 md:px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                {/* Avatar + name + mobile meta */}
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {initials(d.first_name, d.last_name)}
                  </div>
                  <div className="min-w-0">
                    {d.family_id ? (
                      <Link
                        href={`/admin/families/${d.family_id}?focus=dancer:${d.id}`}
                        className="text-[13px] font-medium truncate block hover:underline"
                        style={{ color: "var(--admin-text)" }}
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="text-[13px] font-medium truncate block" style={{ color: "var(--admin-text)" }}>
                        {name}
                      </span>
                    )}
                    {/* Mobile: age · grade below name */}
                    <p className="md:hidden text-[11.5px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                      {age !== "—" ? `${age} yrs` : "—"}{grade !== "—" ? ` · ${grade} grade` : ""}
                    </p>
                  </div>
                </div>

                {/* Desktop-only columns */}
                <p className="hidden md:block w-16 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{age}</p>
                <p className="hidden md:block w-28 pl-6 text-[12px] truncate" style={{ color: "var(--admin-text-faint)" }}>{grade}</p>

                {/* ⋯ menu */}
                <div className="relative shrink-0 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === d.id ? null : d.id); }}
                    className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                    style={{ color: "var(--admin-text-faint)", background: openMenuId === d.id ? "var(--admin-surface-sub)" : "transparent" }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {openMenuId === d.id && d.family_id && (
                    <div
                      className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                      style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", minWidth: "148px" }}
                    >
                      <Link
                        href={`/admin/emails/new?familyId=${d.family_id}`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px]"
                        style={{ color: "var(--admin-text)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Email family
                      </Link>
                      <Link
                        href={`/admin/families/${d.family_id}?focus=dancer:${d.id}`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px]"
                        style={{ color: "var(--admin-text)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        View profile
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          Showing {rows.length.toLocaleString()} {rows.length === 1 ? "dancer" : "dancers"}
        </p>
      )}
    </>
  );
}

/* ─── Families table ────────────────────────────────────────────────── */

function FamiliesTable({ rows, search }: { rows: PeopleFamilyRow[]; search: string }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  return (
    <>
      {openMenuId && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}

      {/* Desktop header — hidden on mobile */}
      <div className="hidden md:flex items-center px-5 py-2" style={{ background: "var(--admin-table-header-bg)" }}>
        <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Family</span>
        <span className="w-40 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Primary Parent</span>
        <span className="w-44 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Dancers</span>
        <span className="w-20 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Classes</span>
        <span className="w-10" />
      </div>

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
              f.dancer_names.length === 0 ? "—"
              : extra > 0 ? `${shownNames} +${extra} more`
              : shownNames;
            return (
              <li
                key={f.id}
                className="flex items-center px-4 md:px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                {/* Avatar + family name + mobile meta */}
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/families/${f.id}`}
                      className="text-[13px] font-medium truncate block hover:underline"
                      style={{ color: "var(--admin-text)" }}
                    >
                      {familyName}
                    </Link>
                    {/* Mobile: primary parent below family name */}
                    <p className="md:hidden text-[11.5px] mt-0.5 truncate" style={{ color: "var(--admin-text-faint)" }}>
                      {primaryParentName}
                    </p>
                  </div>
                </div>

                {/* Desktop-only columns */}
                <p className="hidden md:block w-40 text-[12px] truncate" style={{ color: "var(--admin-text-muted)" }}>{primaryParentName}</p>
                <p className="hidden md:block w-44 text-[12px] truncate" style={{ color: "var(--admin-text-faint)" }}>{dancerNamesDisplay}</p>
                <p className="hidden md:block w-20 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>{f.class_count}</p>

                {/* ⋯ menu */}
                <div className="relative shrink-0 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === f.id ? null : f.id); }}
                    className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                    style={{ color: "var(--admin-text-faint)", background: openMenuId === f.id ? "var(--admin-surface-sub)" : "transparent" }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {openMenuId === f.id && (
                    <div
                      className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                      style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", minWidth: "148px" }}
                    >
                      <Link
                        href={`/admin/emails/new?familyId=${f.id}`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px]"
                        style={{ color: "var(--admin-text)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Email family
                      </Link>
                      <Link
                        href={`/admin/families/${f.id}`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px]"
                        style={{ color: "var(--admin-text)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        View family
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          Showing {rows.length.toLocaleString()} {rows.length === 1 ? "family" : "families"}
        </p>
      )}
    </>
  );
}

/* ─── Waitlist table ────────────────────────────────────────────────── */

function WaitlistTable({ rows, search }: { rows: WaitlistRow[]; search: string }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WaitlistFilter>("all");

  const visibleRows = statusFilter === "all"
    ? rows
    : rows.filter((w) => w.status === statusFilter);

  return (
    <>
      {openMenuId && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}

      {/* Status filter pills */}
      <div className="flex items-center gap-2 px-4 md:px-5 py-2.5 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
        {(["all", "waiting", "invited"] as const).map((f) => {
          const active = statusFilter === f;
          const activeBg =
            f === "waiting" ? "rgba(212,160,192,0.3)" :
            f === "invited" ? "rgba(125,206,194,0.3)" :
            "var(--admin-sidebar-active)";
          const activeColor =
            f === "waiting" ? "#702858" :
            f === "invited" ? "#0A5A50" :
            "#fff";
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3 py-1 rounded-full text-[11.5px] font-medium transition-colors"
              style={{
                background: active ? activeBg : "transparent",
                color: active ? activeColor : "var(--admin-text-muted)",
                border: active ? "none" : "1px solid var(--admin-border)",
                cursor: "pointer",
              }}
            >
              {f === "all" ? "All" : f === "waiting" ? "Not yet invited" : "Invited"}
            </button>
          );
        })}
      </div>

      {/* Desktop header — hidden on mobile */}
      <div className="hidden md:flex items-center px-5 py-2" style={{ background: "var(--admin-table-header-bg)" }}>
        <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Dancer</span>
        <span className="w-40 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Class</span>
        <span className="w-36 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Semester</span>
        <span className="w-20 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Position</span>
        <span className="w-24 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Status</span>
        <span className="w-10" />
      </div>

      {visibleRows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
          {search
            ? `No waitlisted dancers matching "${search}"`
            : statusFilter !== "all"
            ? `No ${statusFilter === "waiting" ? "uninvited" : "invited"} dancers`
            : "No waitlisted dancers"}
        </p>
      ) : (
        <ul>
          {visibleRows.map((w, i) => {
            const dancer = w.dancers;
            const name = dancer ? `${dancer.first_name} ${dancer.last_name}` : "Unknown";
            const color = avatarColor(name);
            return (
              <li
                key={w.id}
                className="flex items-center px-4 md:px-5 py-3 border-b"
                style={{
                  borderColor: "var(--admin-border-sub)",
                  background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                }}
              >
                {/* Avatar + name + mobile meta */}
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {dancer ? initials(dancer.first_name, dancer.last_name) : "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--admin-text)" }}>
                      {name}
                    </p>
                    {/* Mobile: class name below name */}
                    <p className="md:hidden text-[11.5px] mt-0.5 truncate" style={{ color: "var(--admin-text-faint)" }}>
                      {w.class_name ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Mobile: position badge (loud, labelled) + status badge */}
                <div className="md:hidden flex items-center gap-2 shrink-0 ml-2">
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className="inline-flex items-center justify-center rounded-full text-[12px] font-bold"
                      style={{
                        minWidth: "28px",
                        height: "28px",
                        padding: "0 6px",
                        background: "rgba(142,42,35,0.1)",
                        color: "var(--admin-sidebar-active)",
                        border: "1.5px solid rgba(142,42,35,0.25)",
                      }}
                    >
                      #{w.position}
                    </span>
                    <span
                      className="text-[9px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      in queue
                    </span>
                  </div>
                  <Badge status={WAITLIST_STATUS_BADGE[w.status] ?? "neutral"}>
                    {WAITLIST_STATUS_LABEL[w.status] ?? w.status}
                  </Badge>
                </div>

                {/* Desktop-only columns */}
                <p className="hidden md:block w-40 text-[12px] truncate" style={{ color: "var(--admin-text-muted)" }}>{w.class_name ?? "—"}</p>
                <p className="hidden md:block w-36 text-[11px] truncate" style={{ color: "var(--admin-text-faint)" }}>{w.semester_name ?? "—"}</p>
                <p className="hidden md:block w-20 text-right text-[12px] font-medium" style={{ color: "var(--admin-text-muted)" }}>#{w.position}</p>
                <div className="hidden md:flex w-24 justify-end">
                  <Badge status={WAITLIST_STATUS_BADGE[w.status] ?? "neutral"}>
                    {WAITLIST_STATUS_LABEL[w.status] ?? w.status}
                  </Badge>
                </div>

                {/* ⋯ menu */}
                <div className="relative shrink-0 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === w.id ? null : w.id); }}
                    className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                    style={{ color: "var(--admin-text-faint)", background: openMenuId === w.id ? "var(--admin-surface-sub)" : "transparent" }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {openMenuId === w.id && (
                    <div
                      className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                      style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", minWidth: "148px" }}
                    >
                      {dancer?.family_id && (
                        <Link
                          href={`/admin/families/${dancer.family_id}`}
                          onClick={() => setOpenMenuId(null)}
                          className="flex items-center px-3.5 py-2 text-[12px]"
                          style={{ color: "var(--admin-text)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          View family
                        </Link>
                      )}
                      <Link
                        href="/admin/waitlist"
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center px-3.5 py-2 text-[12px]"
                        style={{ color: "var(--admin-text)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Manage in Waitlist
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {visibleRows.length > 0 && (
        <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          Showing {visibleRows.length.toLocaleString()}{statusFilter !== "all" ? ` (filtered from ${rows.length})` : ""} waitlisted
        </p>
      )}
    </>
  );
}

/* ─── People view ───────────────────────────────────────────────────── */

function PeopleView({ peopleData, loading }: { peopleData: PeopleData | null; loading: boolean }) {
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3">
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
              style={{ color: "var(--admin-text)" }}
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
        {!loading && subTab === "dancers"    && <DancersTable  rows={filteredDancers}  search={search} />}
        {!loading && subTab === "families"   && <FamiliesTable rows={filteredFamilies} search={search} />}
        {!loading && subTab === "waitlisted" && <WaitlistTable rows={filteredWaitlist} search={search} />}
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function PeoplePage() {
  const [peopleData, setPeopleData] = useState<PeopleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPeople() {
      setLoading(true);
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
              registrations:meeting_enrollments!dancer_id(id, status, class_meetings!meeting_id(classes(name)))
            )
          `)
          .order("family_name", { ascending: true })
          .limit(200),

        supabase
          .from("waitlist_entries")
          .select(`
            id, position, status, invitation_sent_at,
            dancers(id, first_name, last_name, family_id, families(family_name)),
            class_meetings!meeting_id(classes(name), semesters(name))
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
          confirmedRegs.map((r: any) => r.class_meetings?.classes?.name).filter(Boolean)
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
        const cs = Array.isArray(w.class_meetings) ? w.class_meetings[0] : w.class_meetings;
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
        dancers: (dancersRes.data ?? []) as unknown as PeopleDancerRow[],
        families,
        waitlist,
        totalDancers: totalDancers ?? 0,
        totalFamilies: totalFamilies ?? 0,
        totalWaitlisted: totalWaitlisted ?? 0,
      });
      setLoading(false);
    }
    fetchPeople();
  }, []);

  return (
    <div className="space-y-5">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">People</h1>
          <p className="admin-page-subtitle">Dancers, families, and waitlisted registrants</p>
        </div>
      </div>

      <PeopleView peopleData={peopleData} loading={loading} />
    </div>
  );
}
