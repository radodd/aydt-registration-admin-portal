"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, LayoutDashboard, Trophy, ExternalLink } from "lucide-react";

type Props = { semesterId: string };

const MENU_ITEMS = [
  {
    href: (id: string) => `/admin/semesters/${id}/dashboard`,
    icon: LayoutDashboard,
    label: "Semester dashboard",
  },
  {
    href: (id: string) => `/admin/semesters/${id}/invites`,
    icon: Trophy,
    label: "Competition invites",
  },
  {
    href: (id: string) => `/preview/semester/${id}`,
    icon: ExternalLink,
    label: "Preview page",
    external: true,
  },
];

export default function SemesterHeaderMenu({ semesterId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Desktop (lg+): inline buttons ─────────────────────────── */}
      <div className="hidden lg:flex items-center gap-2">
        {MENU_ITEMS.map(({ href, icon: Icon, label, external }) => (
          <Link
            key={label}
            href={href(semesterId)}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="admin-btn-neutral admin-btn-sm inline-flex items-center gap-1.5"
          >
            <Icon size={13} />
            {label}
          </Link>
        ))}
      </div>

      {/* ── Tablet + Mobile (< lg): overflow menu ─────────────────── */}
      <div className="lg:hidden relative">
        {/* Backdrop — high z so it covers sidebar, right panels, etc. */}
        {open && (
          <div
            className="fixed inset-0"
            style={{ zIndex: 48 }}
            onClick={() => setOpen(false)}
          />
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{
            color: "var(--admin-text-muted)",
            background: open ? "var(--admin-surface-sub)" : "transparent",
            border: `1px solid ${open ? "var(--admin-border)" : "transparent"}`,
          }}
          aria-label="More actions"
        >
          <MoreHorizontal size={16} />
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-1.5 rounded-xl overflow-hidden"
            style={{
              zIndex: 50,
              background: "var(--admin-surface)",
              border: "1px solid var(--admin-border)",
              minWidth: "200px",
              boxShadow: "var(--shadow-dropdown)",
            }}
          >
            <div className="py-1">
              {MENU_ITEMS.map(({ href, icon: Icon, label, external }) => (
                <Link
                  key={label}
                  href={href(semesterId)}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors"
                  style={{ color: "var(--admin-text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon size={14} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />
                  {label}
                  {external && (
                    <ExternalLink
                      size={11}
                      className="ml-auto"
                      style={{ color: "var(--admin-text-faint)" }}
                    />
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
