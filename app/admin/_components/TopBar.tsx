"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Search,
  GraduationCap,
  UserCircle,
  ExternalLink,
  ChevronDown,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { signOut } from "@/app/auth/actions";
import { NotificationBell } from "./NotificationBell";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
};

export function TopBar({ adminInitial }: { adminInitial?: string }) {
  const pathname = usePathname();
  const supabase = createClient();
  const initial = adminInitial ?? "A";

  const [adminName, setAdminName] = useState<string>("Admin");
  const [adminRole, setAdminRole] = useState<string>("Admin");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load the signed-in admin's display name + role for the account chip.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("first_name, last_name, role")
        .eq("id", user.id)
        .single();
      if (data) {
        const last = data.last_name ? ` ${data.last_name[0]}.` : "";
        setAdminName(`${data.first_name ?? "Admin"}${last}`.trim());
        setAdminRole(ROLE_LABELS[data.role] ?? "Admin");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the account menu on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [menuOpen]);

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 md:px-8 min-w-0"
      style={{
        height: "56px",
        background: "var(--admin-surface)",
        borderBottom: "0.5px solid var(--admin-border)",
        flexShrink: 0,
      }}
    >

      {/* ── Mobile left: avatar + persistent brand (links to dashboard) ── */}
      <div className="flex items-center gap-3 md:hidden">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
          style={{ background: "var(--admin-sidebar-bg)", color: "#fff", letterSpacing: "0.02em" }}
        >
          {initial}
        </div>
        <Link href="/admin" className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold" style={{ color: "var(--admin-text)", letterSpacing: "-0.01em" }}>AYDT Admin</span>
          <span className="text-[10px]" style={{ color: "var(--admin-text-muted)" }}>Parent Portal</span>
        </Link>
      </div>

      {/* ── Desktop left: persistent brand (links back to the dashboard) ─ */}
      <div className="hidden md:flex items-center min-w-0 overflow-hidden">
        <Link
          href="/admin"
          className="flex flex-col leading-tight shrink-0 rounded-md px-1.5 py-1 -ml-1.5 transition-colors"
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span className="text-[14px] font-semibold" style={{ color: "var(--admin-text)" }}>AYDT Admin</span>
          <span className="text-[10px]" style={{ color: "var(--admin-text-muted)" }}>Parent Portal</span>
        </Link>
      </div>

      {/* ── Mobile right: search + bell ─────────────────────────── */}
      <div className="flex items-center gap-1 md:hidden">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--admin-text-muted)", background: "transparent" }}
          aria-label="Search"
        >
          <Search size={20} strokeWidth={2} />
        </button>
        <NotificationBell />
      </div>

      {/* ── Desktop right: contextual action + bell + account chip ─ */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {/* Page-contextual action (e.g. Media upload). The global
            "Register dancer" action now lives in page content. */}
        {pathname === "/admin/media" && (
          <button
            type="button"
            onClick={() => document.dispatchEvent(new CustomEvent("media:open-upload"))}
            className="admin-btn-primary inline-flex items-center gap-1.5"
            style={{ fontSize: "13px", padding: "7px 14px" }}
          >
            <Upload size={14} />
            Upload image
          </button>
        )}
        <NotificationBell />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center gap-2.5 rounded-lg pl-1.5 pr-2.5 py-1.5 transition-colors"
            style={{ border: "0.5px solid var(--admin-border)", background: "var(--admin-surface)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--admin-surface)")}
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
              style={{ background: "var(--admin-sidebar-bg)", color: "#fff", letterSpacing: "0.02em" }}
            >
              {initial}
            </span>
            <span className="flex flex-col items-start leading-tight text-left">
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--admin-text)" }}>{adminName}</span>
              <span className="text-[10.5px]" style={{ color: "var(--admin-text-muted)" }}>{adminRole}</span>
            </span>
            <ChevronDown size={13} style={{ color: "var(--admin-text-faint)" }} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1.5 w-56 rounded-xl p-1.5 z-30"
              style={{
                background: "var(--admin-surface)",
                border: "0.5px solid var(--admin-border)",
                boxShadow: "var(--shadow-dropdown, 0 8px 24px rgba(0,0,0,.10))",
              }}
            >
              {/* Cross-surface navigation */}
              <Link
                href="/instructor"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors"
                style={{ color: "var(--admin-text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <GraduationCap size={15} style={{ color: "var(--admin-text-muted)" }} />
                Instructor Dashboard
              </Link>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors"
                style={{ color: "var(--admin-text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <UserCircle size={15} style={{ color: "var(--admin-text-muted)" }} />
                User Portal
                <ExternalLink size={11} className="ml-auto" style={{ color: "var(--admin-text-faint)" }} />
              </a>

              <div style={{ height: "0.5px", background: "var(--admin-border)", margin: "6px 4px" }} />

              <Link
                href="/admin/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors"
                style={{ color: "var(--admin-text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Settings size={15} style={{ color: "var(--admin-text-muted)" }} />
                Account settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors"
                style={{ color: "var(--admin-text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <LogOut size={15} style={{ color: "var(--admin-text-muted)" }} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
