"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Upload, Search } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

const PAGE_TITLES: Record<string, string> = {
  "/admin":              "AYDT Admin",
  "/admin/semesters":   "Semesters",
  "/admin/classes":     "Classes",
  "/admin/sessions":    "Sessions",
  "/admin/dancers":     "Dancers",
  "/admin/families":    "Families",
  "/admin/users":       "Users",
  "/admin/payments":    "Payments",
  "/admin/credits":     "Credits",
  "/admin/emails":      "Emails",
  "/admin/media":       "Media",
  "/admin/profile":     "Profile",
  "/admin/register":    "Register Dancer",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(key + "/")) return PAGE_TITLES[key];
  }
  return "Admin";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TopBar({ adminInitial }: { adminInitial?: string }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const initial = adminInitial ?? "A";

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between px-4 md:px-8 min-w-0 overflow-x-hidden"
      style={{
        height: "56px",
        background: "var(--admin-surface)",
        borderBottom: "0.5px solid var(--admin-border)",
        flexShrink: 0,
      }}
    >

      {/* ── Mobile left: avatar + page title ────────────────────── */}
      <div className="flex items-center gap-3 md:hidden">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
          style={{ background: "var(--admin-sidebar-bg)", color: "#fff", letterSpacing: "0.02em" }}
        >
          {initial}
        </div>
        <span className="text-[17px] font-medium" style={{ color: "var(--admin-text)", letterSpacing: "-0.01em" }}>
          {title}
        </span>
      </div>

      {/* ── Desktop left: page title + date badge ───────────────── */}
      <div className="hidden md:flex items-center gap-3">
        <span className="text-[15px] font-medium" style={{ color: "var(--admin-text)" }}>
          {title}
        </span>
        <span
          className="text-[11px] px-2.5 py-1 rounded-full border"
          style={{
            color: "var(--admin-text-faint)",
            borderColor: "var(--admin-border)",
            background: "var(--admin-page-bg)",
            fontFamily: "var(--font-outfit)",
          }}
        >
          {formatDate()}
        </span>
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

      {/* ── Desktop right: bell + action button ─────────────────── */}
      <div className="hidden md:flex items-center gap-2">
        <NotificationBell />
        {pathname === "/admin/media" ? (
          <button
            type="button"
            onClick={() => document.dispatchEvent(new CustomEvent("media:open-upload"))}
            className="admin-btn-primary inline-flex items-center gap-1.5"
            style={{ fontSize: "13px", padding: "7px 14px" }}
          >
            <Upload size={14} />
            Upload image
          </button>
        ) : (
          <Link
            href="/admin/register"
            className="admin-btn-primary inline-flex items-center gap-1.5"
            style={{ fontSize: "13px", padding: "7px 14px" }}
          >
            <Plus size={14} />
            Register dancer
          </Link>
        )}
      </div>

    </div>
  );
}
