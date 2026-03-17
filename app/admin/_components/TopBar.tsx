"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

const PAGE_TITLES: Record<string, string> = {
  "/admin":              "Dashboard",
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

export function TopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between px-8"
      style={{
        height: "52px",
        background: "var(--admin-surface)",
        borderBottom: "1px solid var(--admin-border)",
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-[15px] font-medium"
          style={{ color: "var(--admin-text)" }}
        >
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

      <div className="flex items-center gap-2">
        <NotificationBell />
        <Link
          href="/admin/register"
          className="admin-btn-primary inline-flex items-center gap-1.5"
          style={{ fontSize: "13px", padding: "7px 14px" }}
        >
          <Plus size={14} />
          Register dancer
        </Link>
      </div>
    </div>
  );
}
