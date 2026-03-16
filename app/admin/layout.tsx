"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  GraduationCap,
  Clock,
  Mail,
  ImageIcon,
  Users,
  Home,
  CreditCard,
  UserCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react";

/* ── Nav structure ──────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Studio",
    items: [
      { href: "/admin/semesters", label: "Semesters",  icon: CalendarDays },
      { href: "/admin/classes",   label: "Classes",    icon: GraduationCap },
      { href: "/admin/sessions",  label: "Sessions",   icon: Clock },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/dancers",   label: "Dancers",    icon: Users },
      { href: "/admin/families",  label: "Families",   icon: Home },
      { href: "/admin/users",     label: "Users",      icon: ShieldCheck },
    ],
  },
  {
    label: "Finance & Comms",
    items: [
      { href: "/admin/payments",  label: "Payments",   icon: CreditCard },
      { href: "/admin/emails",    label: "Emails",     icon: Mail },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/media",     label: "Media",      icon: ImageIcon },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/auth"); return; }

      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", authUser.id)
        .single();

      if (user?.role !== "super_admin") {
        router.push("/");
      } else {
        setIsAdmin(true);
      }
    })();
  }, [router, supabase]);

  if (isAdmin === null) {
    return (
      <div className="admin-shell flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: '#8E2A23', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--admin-text-faint)' }}>
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
    <div className="admin-shell flex">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="admin-sidebar">

        {/* Brand */}
        <div className="admin-sidebar-logo">
          <p className="admin-sidebar-logo-title">AYDT</p>
          <p className="admin-sidebar-logo-sub">Studio Admin</p>
        </div>

        {/* Nav */}
        <nav className="admin-sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest"
                 style={{ color: 'var(--admin-sidebar-text)', opacity: 0.5 }}>
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={isActive ? "admin-nav-item-active" : "admin-nav-item"}
                    >
                      <Icon size={14} className="shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom — profile + sign out */}
        <div className="admin-sidebar-footer flex flex-col gap-0.5">
          <Link
            href="/admin/profile"
            className={pathname === "/admin/profile" ? "admin-nav-item-active" : "admin-nav-item"}
          >
            <UserCircle size={14} className="shrink-0" />
            My Profile
          </Link>
          <button
            onClick={handleSignOut}
            className="admin-nav-item w-full text-left hover:!text-red-400"
          >
            <LogOut size={14} className="shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="admin-main flex-1">
        {children}
      </main>

    </div>
  );
}
