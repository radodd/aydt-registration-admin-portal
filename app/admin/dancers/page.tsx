"use client";

import { getDancers } from "@/queries/admin";
import { Dancer } from "@/types";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";

/* ── helpers ──────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  { bg: "rgba(158,196,180,.25)", text: "#20503A" },
  { bg: "rgba(196,160,212,.20)", text: "#5A2878" },
  { bg: "rgba(212,160,192,.20)", text: "#702858" },
  { bg: "rgba(232,184,176,.20)", text: "#802818" },
  { bg: "rgba(125,206,194,.20)", text: "#0A5A50" },
];

function avatarColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function initials(first: string, last: string) {
  return (first[0] ?? "") + (last[0] ?? "");
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  return String(
    Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 86_400_000))
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function DancersAdmin() {
  const supabase = createClient();

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getDancers();
      setDancers(data || []);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this dancer?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("dancers").delete().eq("id", id);
    setDeletingId(null);
    if (error) { alert("Failed to delete dancer."); return; }
    setDancers((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-5">
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Dancers</h1>
          <p className="admin-page-subtitle">Manage dancer profiles across families.</p>
        </div>
        <button className="admin-btn-primary admin-btn-sm">+ Add Dancer</button>
      </div>

      {/* Card */}
      <div className="admin-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
            />
          </div>
        ) : dancers.length === 0 ? (
          <p className="px-5 py-10 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            No dancers found.
          </p>
        ) : (
          <>
            {/* Desktop table header */}
            <div
              className="hidden md:flex items-center px-5 py-2"
              style={{ background: "var(--admin-table-header-bg)" }}
            >
              <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Name</span>
              <span className="w-16 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Age</span>
              <span className="w-24 pl-4 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Grade</span>
              <span className="w-40 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Location</span>
              <span className="w-10" />
            </div>

            <ul>
              {dancers.map((dancer, i) => {
                const name = `${dancer.first_name} ${dancer.last_name}`;
                const color = avatarColor(name);
                const age = calcAge(dancer.birth_date);
                const location =
                  [dancer.city, dancer.state].filter(Boolean).join(", ") || "—";
                const managedBy =
                  Array.isArray(dancer.users) && dancer.users.length > 0
                    ? `${dancer.users[0].first_name} ${dancer.users[0].last_name}`
                    : null;

                return (
                  <li
                    key={dancer.id}
                    className="flex items-center px-4 md:px-5 py-3 border-b"
                    style={{
                      borderColor: "var(--admin-border-sub)",
                      background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                    }}
                  >
                    {/* Avatar + name + mobile sub-text */}
                    <div className="flex-1 flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: color.bg, color: color.text }}
                      >
                        {initials(dancer.first_name, dancer.last_name)}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/dancers/${dancer.id}`}
                          className="text-[13px] font-medium truncate block hover:underline"
                          style={{ color: "var(--admin-text)" }}
                        >
                          {name}
                        </Link>
                        {/* Mobile: age · grade · managed by */}
                        <p
                          className="md:hidden text-[11.5px] mt-0.5 truncate"
                          style={{ color: "var(--admin-text-faint)" }}
                        >
                          {age !== "—" ? `${age} yrs` : "—"}
                          {dancer.grade ? ` · Grade ${dancer.grade}` : ""}
                          {managedBy ? ` · ${managedBy}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Desktop columns */}
                    <p className="hidden md:block w-16 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                      {age}
                    </p>
                    <p className="hidden md:block w-24 pl-4 text-[12px] truncate" style={{ color: "var(--admin-text-faint)" }}>
                      {dancer.grade || "—"}
                    </p>
                    <p className="hidden md:block w-40 text-[12px] truncate" style={{ color: "var(--admin-text-muted)" }}>
                      {location}
                    </p>

                    {/* ⋯ menu */}
                    <div className="relative shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === dancer.id ? null : dancer.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                        style={{
                          color: "var(--admin-text-faint)",
                          background: openMenuId === dancer.id ? "var(--admin-surface-sub)" : "transparent",
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>

                      {openMenuId === dancer.id && (
                        <div
                          className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                          style={{
                            background: "var(--admin-surface)",
                            border: "1px solid var(--admin-border)",
                            minWidth: "148px",
                          }}
                        >
                          <Link
                            href={`/admin/dancers/${dancer.id}`}
                            onClick={() => setOpenMenuId(null)}
                            className="flex items-center px-3.5 py-2 text-[12px]"
                            style={{ color: "var(--admin-text)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            View profile
                          </Link>
                          <button
                            onClick={() => { setOpenMenuId(null); alert(`Edit dancer ${dancer.first_name}`); }}
                            className="w-full text-left flex items-center px-3.5 py-2 text-[12px]"
                            style={{ color: "var(--admin-text)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            Edit dancer
                          </button>
                          <div style={{ height: "1px", background: "var(--admin-border-sub)", margin: "2px 0" }} />
                          <button
                            onClick={() => { setOpenMenuId(null); handleDelete(dancer.id); }}
                            disabled={deletingId === dancer.id}
                            className="w-full text-left flex items-center px-3.5 py-2 text-[12px]"
                            style={{
                              color: "#802818",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              opacity: deletingId === dancer.id ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,40,24,.06)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {deletingId === dancer.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
              {dancers.length.toLocaleString()} dancer{dancers.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
