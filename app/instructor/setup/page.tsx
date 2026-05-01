"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { completeInstructorSetup } from "@/app/instructor/actions/completeSetup";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function InstructorSetupPage() {
  const router = useRouter();

  const [firstName,   setFirstName]   = useState("");
  const [checking,    setChecking]    = useState(true);
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Confirm this is an invited instructor. If they're already active, skip to dashboard.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth"); return; }

      const { data: profile } = await supabase
        .from("users")
        .select("first_name, role, status")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "instructor") { router.replace("/"); return; }
      if (profile.status === "active") { router.replace("/instructor"); return; }

      setFirstName(profile.first_name ?? "");
      setChecking(false);
    });
  }, [router]);

  const passwordsMatch     = password === confirm;
  const passwordLongEnough = password.length >= 8;
  const canSubmit          = passwordLongEnough && passwordsMatch && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw new Error(pwError.message);

      await completeInstructorSetup();

      setDone(true);
      setTimeout(() => router.replace("/instructor"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  if (checking) return null;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm">
        <div
          className="rounded-2xl px-6 py-8"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={40} style={{ color: "var(--admin-sidebar-active)" }} />
              <p className="font-semibold text-lg" style={{ color: "var(--admin-text)" }}>
                You&apos;re all set!
              </p>
              <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
                Taking you to your dashboard…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
                  Welcome, {firstName}!
                </h1>
                <p className="text-sm mt-1" style={{ color: "var(--admin-text-muted)" }}>
                  Create a password to finish setting up your instructor account.
                </p>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="At least 8 characters"
                    required
                    autoComplete="new-password"
                    className="w-full rounded-xl px-3 py-2.5 pr-10 focus:outline-none"
                    style={{
                      background: "var(--admin-surface-sub)",
                      border: "1px solid var(--admin-border-sub)",
                      color: "var(--admin-text)",
                      fontSize: "16px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--admin-text-faint)" }}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {password.length > 0 && !passwordLongEnough && (
                  <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
                    Must be at least 8 characters
                  </p>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    placeholder="Re-enter your password"
                    required
                    autoComplete="new-password"
                    className="w-full rounded-xl px-3 py-2.5 pr-10 focus:outline-none"
                    style={{
                      background: "var(--admin-surface-sub)",
                      border: "1px solid var(--admin-border-sub)",
                      color: "var(--admin-text)",
                      fontSize: "16px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--admin-text-faint)" }}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
                    Passwords don&apos;t match
                  </p>
                )}
              </div>

              {error && (
                <p
                  className="text-sm rounded-xl px-3 py-2.5"
                  style={{ background: "#FEF2F2", color: "#DC2626" }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{
                  background: "var(--admin-sidebar-active)",
                  color: "#fff",
                  minHeight: "48px",
                }}
              >
                {submitting ? "Setting up your account…" : "Create password & continue"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
