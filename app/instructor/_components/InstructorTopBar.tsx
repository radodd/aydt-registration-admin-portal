"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function InstructorTopBar({ displayName }: { displayName: string }) {
  const router  = useRouter();
  const [open, setOpen] = useState(false);

  const initial = displayName.trim()[0]?.toUpperCase() ?? "I";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-4 md:px-8"
      style={{
        height: "56px",
        background: "var(--admin-sidebar-bg)",
        borderBottom: "1px solid var(--admin-sidebar-border)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center text-xs font-bold rounded"
          style={{
            width: 28, height: 28,
            background: "var(--admin-sidebar-active)",
            color: "#fff",
          }}
        >
          AY
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide" style={{ color: "#fff" }}>
            AYDT
          </p>
          <p className="text-[10px] leading-none" style={{ color: "var(--admin-sidebar-text)" }}>
            Instructor
          </p>
        </div>
      </div>

      {/* Avatar + dropdown trigger */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 focus:outline-none"
          aria-label="Account menu"
        >
          <span className="text-xs hidden sm:block" style={{ color: "var(--admin-sidebar-text)" }}>
            {displayName}
          </span>
          <div
            className="flex items-center justify-center rounded-full text-xs font-semibold"
            style={{
              width: 32, height: 32,
              background: "var(--admin-sidebar-active)",
              color: "#fff",
            }}
          >
            {initial}
          </div>
        </button>

        {open && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            {/* Dropdown */}
            <div
              className="absolute right-0 top-full mt-2 z-20 rounded-xl shadow-lg overflow-hidden"
              style={{
                background: "var(--admin-surface)",
                border: "1px solid var(--admin-border)",
                minWidth: "160px",
              }}
            >
              <div
                className="px-4 py-2.5 text-xs"
                style={{ color: "var(--admin-text-muted)", borderBottom: "1px solid var(--admin-border-sub)" }}
              >
                {displayName}
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-neutral-50 transition-colors"
                style={{ color: "var(--admin-text)" }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
