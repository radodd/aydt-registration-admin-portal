"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  GraduationCap,
  ImageIcon,
  Users,
  Home,
  CreditCard,
  UserCircle,
  LogOut,
  LayoutDashboard,
  Plus,
  UserCheck,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { TopBar } from "./_components/TopBar";
import { MobileNav } from "./_components/MobileNav";
import { ToastProvider } from "@/app/components/Toast";

/* ── Desktop sidebar nav structure ─────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Studio",
    items: [
      { href: "/admin/classes",      label: "Classes",     icon: GraduationCap },
      { href: "/admin/instructors",  label: "Instructors", icon: UserCheck },
      { href: "/admin/waitlist",     label: "Waitlist",    icon: ClipboardList },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/dancers",   label: "Dancers",    icon: Users },
      { href: "/admin/families",  label: "Families",   icon: Home },
    ],
  },
  {
    label: "Finance & Comms",
    items: [
      { href: "/admin/payments",  label: "Payments",   icon: CreditCard },
      { href: "/admin/warnings",  label: "Warnings",   icon: AlertTriangle },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/media",     label: "Media",      icon: ImageIcon },
    ],
  },
];

const COLLAPSED_WIDTH = "52px";
const EXPANDED_WIDTH  = "var(--admin-sidebar-width)";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [isAdmin,      setIsAdmin]      = useState<boolean | null>(null);
  const [expanded,     setExpanded]     = useState(false);
  const [isMobile,     setIsMobile]     = useState(false);
  const [adminInitial, setAdminInitial] = useState("A");

  // JS-based breakpoint detection — drives sidebar transform + margin without CSS fights
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/auth"); return; }

      const { data: user } = await supabase
        .from("users")
        .select("role, first_name")
        .eq("id", authUser.id)
        .single();

      if (!user?.role || !["admin", "super_admin"].includes(user.role)) {
        router.push("/");
      } else {
        setIsAdmin(true);
        if (user.first_name) setAdminInitial(user.first_name[0].toUpperCase());
      }
    })();
  }, [router, supabase]);

  if (isAdmin === null) {
    return (
      <div className="admin-shell flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            Checking permissions…
          </p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <ToastProvider>
    <div className="admin-shell flex">

      {/* ── Desktop sidebar (hidden on mobile via transform) ─────── */}
      <aside
        className="admin-sidebar overflow-hidden"
        onMouseEnter={() => !isMobile && setExpanded(true)}
        onMouseLeave={() => !isMobile && setExpanded(false)}
        style={{
          width: isMobile ? EXPANDED_WIDTH : (expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH),
          transform: isMobile ? "translateX(-100%)" : "translateX(0)",
          transition: "width 200ms ease",
          boxShadow: expanded ? "4px 0 20px rgba(0,0,0,0.18)" : "none",
          overflow: "hidden",
        }}
      >
        {/* Brand */}
        <div
          className="admin-sidebar-logo"
          style={{ padding: expanded ? undefined : "20px 0", textAlign: expanded ? undefined : "center" }}
        >
          {expanded ? (
            <>
              <p className="admin-sidebar-logo-title">AYDT</p>
              <p className="admin-sidebar-logo-sub">Studio Admin</p>
            </>
          ) : (
            <p className="text-sm font-semibold tracking-widest text-white">A</p>
          )}
        </div>

        {/* Nav */}
        <nav className="admin-sidebar-nav">
          <div className="mb-4">
            <div className="flex flex-col gap-0.5">
              <Link
                href="/admin"
                className={pathname === "/admin" ? "admin-nav-item-active" : "admin-nav-item"}
                style={{ justifyContent: expanded ? undefined : "center", gap: expanded ? undefined : 0 }}
              >
                <LayoutDashboard size={14} className="shrink-0" />
                {expanded && <span>Dashboard</span>}
              </Link>
            </div>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              {expanded && (
                <p
                  className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--admin-sidebar-text)", opacity: 0.5 }}
                >
                  {group.label}
                </p>
              )}
              {!expanded && <div className="mb-1" style={{ height: "1px", background: "rgba(255,255,255,0.05)", margin: "6px 8px" }} />}
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={isActive ? "admin-nav-item-active" : "admin-nav-item"}
                      style={{ justifyContent: expanded ? undefined : "center", gap: expanded ? undefined : 0 }}
                    >
                      <Icon size={14} className="shrink-0" />
                      {expanded && <span>{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile + sign out */}
        <div className="admin-sidebar-footer flex flex-col gap-0.5">
          <Link
            href="/admin/profile"
            className={pathname === "/admin/profile" ? "admin-nav-item-active" : "admin-nav-item"}
            style={{ justifyContent: expanded ? undefined : "center", gap: expanded ? undefined : 0 }}
          >
            <UserCircle size={14} className="shrink-0" />
            {expanded && <span>My Profile</span>}
          </Link>
          <button
            onClick={handleSignOut}
            className="admin-nav-item w-full text-left hover:text-red-400!"
            style={{ justifyContent: expanded ? undefined : "center", gap: expanded ? undefined : 0 }}
          >
            <LogOut size={14} className="shrink-0" />
            {expanded && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      {/* min-w-0 prevents flex-1 from growing past its container.
          overflow-x-hidden is intentionally NOT set here — it would create
          a scroll container in iOS Safari that blocks natural vertical scroll.
          Horizontal overflow is handled by overflow-x:hidden on .admin-shell. */}
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ marginLeft: isMobile ? 0 : COLLAPSED_WIDTH, minHeight: "100vh" }}
      >
        <TopBar adminInitial={adminInitial} />
        <main
          className="flex-1 px-4 py-4 md:px-8 md:py-8"
          style={{ background: "var(--admin-page-bg)" }}
        >
          {children}
        </main>
      </div>

      {/* ── Mobile: FAB + bottom nav (hidden on desktop via CSS) ── */}
      <Link
        href="/admin/register"
        aria-label="Register dancer"
        className="fixed z-20 flex items-center justify-center rounded-full md:hidden"
        style={{
          width: "56px",
          height: "56px",
          bottom: "88px",
          right: "20px",
          background: "var(--admin-sidebar-active)",
          color: "#fff",
          boxShadow: "0 6px 16px rgba(142,42,35,0.35), 0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <Plus size={24} strokeWidth={2.5} />
      </Link>

      <MobileNav />

    </div>
    </ToastProvider>
  );
}
