"use client";

import { getUsers } from "@/queries/admin";
import { User } from "@/types";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";

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

/* ── page ─────────────────────────────────────────────────────────────── */

export default function UsersAdmin() {
  const supabase = createClient();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getUsers();
      setUsers(data || []);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("users").delete().eq("id", id);
    setDeletingId(null);
    if (error) { alert("Failed to delete user."); return; }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="space-y-5">
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Users</h1>
          <p className="admin-page-subtitle">Manage parent and admin accounts.</p>
        </div>
        <button className="admin-btn-primary admin-btn-sm">+ Add User</button>
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
        ) : users.length === 0 ? (
          <p className="px-5 py-10 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
            No users found.
          </p>
        ) : (
          <>
            {/* Desktop table header */}
            <div
              className="hidden md:flex items-center px-5 py-2"
              style={{ background: "var(--admin-table-header-bg)" }}
            >
              <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Name</span>
              <span className="w-48 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Email</span>
              <span className="w-36 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Phone</span>
              <span className="w-20 text-center text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Primary</span>
              <span className="w-10" />
            </div>

            <ul>
              {users.map((user, i) => {
                const name = `${user.first_name} ${user.last_name}`;
                const color = avatarColor(name);

                return (
                  <li
                    key={user.id}
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
                        {initials(user.first_name, user.last_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--admin-text)" }}>
                          {name}
                        </p>
                        {/* Mobile: email below name */}
                        <p
                          className="md:hidden text-[11.5px] mt-0.5 truncate"
                          style={{ color: "var(--admin-text-faint)" }}
                        >
                          {user.email || "—"}
                          {user.phone_number ? ` · ${user.phone_number}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Mobile: Primary badge */}
                    {user.is_primary_parent && (
                      <span
                        className="md:hidden shrink-0 ml-2 inline-flex items-center rounded-full text-[10.5px] font-semibold px-2 py-0.5"
                        style={{ background: "#F2E7E4", color: "#7B1F1A" }}
                      >
                        Primary
                      </span>
                    )}

                    {/* Desktop columns */}
                    <p className="hidden md:block w-48 text-[12px] truncate" style={{ color: "var(--admin-text-muted)" }}>
                      {user.email || "—"}
                    </p>
                    <p className="hidden md:block w-36 text-[12px] truncate" style={{ color: "var(--admin-text-faint)" }}>
                      {user.phone_number || "—"}
                    </p>
                    <div className="hidden md:flex w-20 justify-center">
                      {user.is_primary_parent && (
                        <span
                          className="inline-flex items-center rounded-full text-[10.5px] font-semibold px-2 py-0.5"
                          style={{ background: "#F2E7E4", color: "#7B1F1A" }}
                        >
                          Primary
                        </span>
                      )}
                    </div>

                    {/* ⋯ menu */}
                    <div className="relative shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === user.id ? null : user.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                        style={{
                          color: "var(--admin-text-faint)",
                          background: openMenuId === user.id ? "var(--admin-surface-sub)" : "transparent",
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>

                      {openMenuId === user.id && (
                        <div
                          className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                          style={{
                            background: "var(--admin-surface)",
                            border: "1px solid var(--admin-border)",
                            minWidth: "148px",
                          }}
                        >
                          <button
                            onClick={() => { setOpenMenuId(null); alert(`Edit user ${user.first_name}`); }}
                            className="w-full text-left flex items-center px-3.5 py-2 text-[12px]"
                            style={{ color: "var(--admin-text)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            Edit user
                          </button>
                          <div style={{ height: "1px", background: "var(--admin-border-sub)", margin: "2px 0" }} />
                          <button
                            onClick={() => { setOpenMenuId(null); handleDelete(user.id); }}
                            disabled={deletingId === user.id}
                            className="w-full text-left flex items-center px-3.5 py-2 text-[12px]"
                            style={{
                              color: "#802818",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              opacity: deletingId === user.id ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,40,24,.06)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {deletingId === user.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
              {users.length.toLocaleString()} user{users.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
