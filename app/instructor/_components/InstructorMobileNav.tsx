"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, UserCircle } from "lucide-react";

const NAV_ITEMS = [
  { href: "/instructor/classes", label: "Classes", icon: BookOpen },
  { href: "/instructor/profile", label: "Profile", icon: UserCircle },
];

export function InstructorMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden"
      style={{
        background: "var(--admin-surface)",
        borderTop: "0.5px solid var(--admin-border)",
        boxShadow: "0 -1px 0 rgba(0,0,0,0.04), 0 -4px 20px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-stretch pt-2 pb-6">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 flex-1 py-1.5 px-1"
              style={{
                color: isActive
                  ? "var(--admin-sidebar-active)"
                  : "var(--admin-text-faint)",
                textDecoration: "none",
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2 : 1.75} />
              <span style={{ fontSize: "10px", fontWeight: isActive ? 600 : 500 }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
