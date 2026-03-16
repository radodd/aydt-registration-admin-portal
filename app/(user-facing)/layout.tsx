import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AuthProvider } from "@/app/providers/AuthProvider";

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
      <div className="user-shell flex flex-col">

        {/* ── Navigation ──────────────────────────────────────── */}
        <header className="user-topnav">
          <nav className="max-w-6xl mx-auto w-full px-6 h-full flex items-center justify-between">

            {/* Brand */}
            <Link
              href="/"
              className="user-nav-link"
              style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '0.1em' }}
            >
              American Youth Dance Theater
            </Link>

            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-6">
              <Link href="/" className="user-nav-link">
                Semesters
              </Link>
              {user && (
                <Link href="/profile" className="user-nav-link">
                  Profile
                </Link>
              )}
            </div>

            {/* Auth CTA */}
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:block text-sm" style={{ color: 'var(--user-text-faint)' }}>
                    Hi, {firstName ?? "there"}
                  </span>
                  <Link href="/profile">
                    <button className="user-btn-neutral user-btn-sm">Account</button>
                  </Link>
                </div>
              ) : (
                <Link href="/auth/login">
                  <button className="user-btn-primary user-btn-sm">Sign In</button>
                </Link>
              )}
            </div>
          </nav>
        </header>

        {/* ── Page content ────────────────────────────────────── */}
        <main className="flex-1">{children}</main>

        {/* ── Footer ──────────────────────────────────────────── */}
        <footer className="py-8 mt-auto" style={{ background: 'var(--user-surface-sub)', borderTop: '1px solid var(--user-border)' }}>
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm" style={{ color: 'var(--user-text-faint)' }}>
              © {new Date().getFullYear()} American Youth Dance Theater. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/auth/login"
                className="text-sm"
                style={{ color: 'var(--user-text-faint)' }}
              >
                Admin Login
              </Link>
            </div>
          </div>
        </footer>

      </div>
    </AuthProvider>
  );
}
