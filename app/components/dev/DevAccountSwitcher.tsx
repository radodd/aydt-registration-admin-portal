"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Role = "admin" | "super_admin" | "instructor" | "parent" | null;

const ACCOUNTS = {
  admin: {
    email:    process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? "",
    label:    "Admin",
    dest:     "/admin",
  },
  instructor: {
    email:    process.env.NEXT_PUBLIC_DEV_INSTRUCTOR_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEV_INSTRUCTOR_PASSWORD ?? "",
    label:    "Instructor",
    dest:     "/instructor",
  },
} as const;

export function DevAccountSwitcher() {
  const router   = useRouter();
  const [role,   setRole]   = useState<Role>(null);
  const [open,   setOpen]   = useState(false);
  const [loading, setLoading] = useState<"admin" | "instructor" | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setRole(null); return; }
      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      setRole((data?.role as Role) ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) { setRole(null); return; }
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        setRole((data?.role as Role) ?? null);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const switchTo = async (target: "admin" | "instructor") => {
    const account = ACCOUNTS[target];
    if (!account.email || !account.password) {
      alert(`Set NEXT_PUBLIC_DEV_${target.toUpperCase()}_EMAIL / _PASSWORD in .env.local`);
      return;
    }
    setLoading(target);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email:    account.email,
      password: account.password,
    });
    if (error) {
      alert(`Switch failed: ${error.message}`);
      setLoading(null);
      return;
    }
    setOpen(false);
    setLoading(null);
    router.push(account.dest);
    router.refresh();
  };

  const roleLabel =
    role === "admin" || role === "super_admin" ? "Admin"
    : role === "instructor"                    ? "Instructor"
    : role === "parent"                        ? "Parent"
    : "Logged out";

  const isAdmin      = role === "admin" || role === "super_admin";
  const isInstructor = role === "instructor";

  return (
    <div className="fixed bottom-5 left-4 z-[9999] select-none">
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div
            className="mb-2 rounded-xl overflow-hidden shadow-xl"
            style={{
              background: "#1a1a1a",
              border: "1px solid rgba(255,100,50,0.35)",
              minWidth: "170px",
            }}
          >
            <p
              className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "rgba(255,100,50,0.7)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              Dev · Switch Account
            </p>

            {(["admin", "instructor"] as const).map((target) => {
              const acc     = ACCOUNTS[target];
              const current = target === "admin" ? isAdmin : isInstructor;
              return (
                <button
                  key={target}
                  onClick={() => !current && switchTo(target)}
                  disabled={current || loading !== null}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left transition disabled:opacity-40"
                  style={{
                    color:      current ? "rgba(255,255,255,0.4)" : "#fff",
                    background: current ? "rgba(255,255,255,0.05)" : "transparent",
                    cursor:     current ? "default" : "pointer",
                    fontSize:   "12px",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => { if (!current) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { if (!current) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span>{acc.label}</span>
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                    {loading === target ? "switching…"
                      : current        ? "current"
                      : acc.email      ? acc.email.split("@")[0]
                      : "not set"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Pill trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg transition hover:opacity-90"
        style={{
          background: "#1a1a1a",
          border:     "1px solid rgba(255,100,50,0.5)",
          color:      "rgba(255,100,50,0.9)",
        }}
      >
        <span
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: "rgba(255,100,50,0.8)", flexShrink: 0 }}
        />
        DEV · {roleLabel}
      </button>
    </div>
  );
}
