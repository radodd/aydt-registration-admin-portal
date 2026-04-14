import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AuthProvider } from "@/app/providers/AuthProvider";
import ConditionalFooter from "./ConditionalFooter";
import { NavCartButton } from "@/app/components/public/NavCartButton";
import "./portal.css";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let firstName: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("first_name")
      .eq("id", user.id)
      .single();
    firstName = data?.first_name ?? null;
  }

  return (
    <AuthProvider>
      <div className="pub-portal-shell">

        {/* ── Top Navigation ──────────────────────────────────── */}
        <nav className="topnav">
          <Link href="/" className="topnav-logo">
            <div className="topnav-logo-mark">AY</div>
            <div>
              <div className="topnav-logo-text">AYDT</div>
              <div className="topnav-logo-sub">Registration Portal</div>
            </div>
          </Link>

          <div className="topnav-links">
            <Link href="/#semesters" className="topnav-link active">Programs</Link>
          </div>

          <div className="topnav-right">
            <NavCartButton />
            {user ? (
              <>
                <span className="topnav-greeting" style={{ fontSize: 13, color: "var(--pub-nav-text)" }}>
                  Hi, {firstName ?? "there"}
                </span>
                <Link href="/profile" className="btn-nav-ghost">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span className="topnav-btn-text">My Account</span>
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="btn-nav-ghost">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  <span className="topnav-btn-text">Log In</span>
                </Link>
                <Link href="/register" className="btn-nav-primary">
                  <span className="topnav-btn-text">Create Account</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* ── Page Content ────────────────────────────────────── */}
        <main style={{ flex: 1 }}>{children}</main>

        {/* ── Footer ──────────────────────────────────────────── */}
        <ConditionalFooter />

      </div>
    </AuthProvider>
  );
}
