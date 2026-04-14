import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import type { Metadata } from "next";
import { signOut } from "@/app/auth/actions";

export const metadata: Metadata = {
  title: "AYDT — Dance Programs for Young Artists",
  description:
    "Small classes, experienced teachers, and a nurturing community in New York City since 1996. Browse open semesters and register your dancer today.",
};

export default async function HomePage() {
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

  const isLoggedIn = !!user;

  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, name, status, class_sessions(id, start_date, end_date)")
    .in("status", ["published", "closed"])
    .order("created_at", { ascending: false })
    .limit(6);

  // Find the first open semester name for the enrollment banner
  const openSemester = semesters?.find((s) => s.status === "published");

  return (
    <>
      {/* ── Enrollment Banner ──────────────────────────────── */}
      {openSemester && (
        <div className="enrollment-banner">
          <div className="enrollment-banner-dot" />
          <span className="enrollment-banner-text">
            {openSemester.name} enrollment is now open —
          </span>
          <a href="#semesters" className="enrollment-banner-link">
            View available sessions →
          </a>
        </div>
      )}

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="pub-hero">
        <div className="pub-hero-inner">
          <div className="pub-hero-content">
            <div className="pub-hero-eyebrow">American Youth Dance Theater</div>
            <h1 className="pub-hero-title">
              Where Joy and Technique<br />
              Take <em>Center Stage</em>
            </h1>
            <p className="pub-hero-desc">
              Small classes, experienced teachers, and a nurturing community in
              New York City since 1996.
            </p>
            <div className="pub-hero-actions">
              <a href="#semesters" className="btn-hero-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                View Open Programs
              </a>
              {!isLoggedIn && (
                <>
                  <div className="pub-hero-divider">or</div>
                  <Link href="/auth/login" className="btn-hero-ghost">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Log In to My Account
                  </Link>
                </>
              )}
              {isLoggedIn && (
                <>
                  <div className="pub-hero-divider">or</div>
                  <Link href="/profile" className="btn-hero-ghost">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Go to My Account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Available Semesters ────────────────────────────── */}
      <section className="pub-section" id="semesters">
        <div className="pub-section-inner">
          <div className="pub-section-head-row">
            <div>
              <div className="pub-section-eyebrow">Enrollment</div>
              <h2 className="pub-section-title">Available Semesters</h2>
              <p className="pub-section-desc">
                Select a semester to browse sessions, schedules, and pricing.
                Register as many dancers as you need under one account.
              </p>
            </div>
          </div>

          {!semesters || semesters.length === 0 ? (
            <div
              style={{
                background: "var(--pub-surface-warm)",
                border: "1px solid var(--pub-border)",
                borderRadius: "var(--pub-radius-xl)",
                padding: "40px",
                textAlign: "center",
              }}
            >
              <p style={{ color: "var(--pub-text-muted)", fontWeight: 500 }}>
                No semesters are currently open for registration.
              </p>
              <p style={{ color: "var(--pub-text-faint)", fontSize: 13, marginTop: 4 }}>
                Check back soon for upcoming programs.
              </p>
            </div>
          ) : (
            <div className="semester-grid">
              {semesters.map((semester) => {
                const sessions = (
                  semester.class_sessions ?? []
                ) as { id: string; start_date: string | null; end_date: string | null }[];

                const allDates = sessions.flatMap((s) =>
                  [s.start_date, s.end_date].filter(Boolean),
                ) as string[];
                const earliest =
                  allDates.length > 0
                    ? allDates.reduce((a, b) => (a < b ? a : b))
                    : null;
                const latest =
                  allDates.length > 0
                    ? allDates.reduce((a, b) => (a > b ? a : b))
                    : null;

                const isOpen = semester.status === "published";

                return (
                  <div
                    key={semester.id}
                    className={`semester-card${isOpen ? "" : " closed-card"}`}
                    style={isOpen ? {} : { opacity: 0.75, cursor: "default" }}
                  >
                    {/* Card header */}
                    <div className={`semester-card-header${isOpen ? "" : " closed"}`}>
                      <div className="semester-card-header-row">
                        <div className="semester-card-title">{semester.name}</div>
                        <span className={`semester-badge ${isOpen ? "open" : "closed"}`}>
                          <span className="semester-badge-dot" />
                          {isOpen ? "Open" : "Closed"}
                        </span>
                      </div>
                      {earliest && latest && (
                        <div className="semester-card-dates">
                          {formatDate(earliest)} – {formatDate(latest)}
                        </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="semester-card-body">
                      <div className="semester-disc-row">
                        {["Ballet", "Tap", "Hip-Hop", "Broadway", "Contemporary"].map((d) => (
                          <span key={d} className="disc-chip">{d}</span>
                        ))}
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className="semester-card-footer">
                      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                        <div className="semester-stat">
                          <div className={`semester-stat-val${isOpen ? " plum" : ""}`}>
                            {sessions.length}
                          </div>
                          <div className="semester-stat-label">Sessions</div>
                        </div>
                      </div>
                      {isOpen ? (
                        <Link
                          href={`/semester/${semester.id}`}
                          className="btn-view-sessions"
                        >
                          View Sessions
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                          </svg>
                        </Link>
                      ) : (
                        <span
                          className="btn-view-sessions ghost"
                          style={{ pointerEvents: "none", opacity: 0.6 }}
                        >
                          View Details
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Login / Create Account CTA ─────────────────────── */}
      <section className="pub-section">
        <div className="pub-section-inner">
          <div className="pub-section-head-row" style={{ marginBottom: 28 }}>
            <div>
              <div className="pub-section-eyebrow">Your Account</div>
              <h2 className="pub-section-title">
                {isLoggedIn ? `Good to see you, ${firstName ?? "there"}.` : "Ready to Get Started?"}
              </h2>
            </div>
          </div>

          <div className="cta-split">
            {/* Returning families / logged-in panel */}
            <div className="cta-card returning">
              {isLoggedIn ? (
                <>
                  <div className="cta-label" style={{ color: "var(--plum-200)" }}>Your Account</div>
                  <div className="cta-title">
                    You&apos;re signed in<br />as {firstName ?? "a member"}.
                  </div>
                  <div className="cta-body">
                    Head to your dashboard to manage your dancers, view current
                    registrations, and enroll in new programs.
                  </div>
                  <div className="cta-actions">
                    <Link href="/profile" className="btn-cta-dark">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      Go to My Dashboard
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="cta-label">Returning Families</div>
                  <div className="cta-title">
                    Welcome back.<br />Pick up where you left off.
                  </div>
                  <div className="cta-body">
                    Log in to view your registrations, manage your dancers, check
                    upcoming sessions, and enroll for the new semester.
                  </div>
                  <div className="cta-actions">
                    <Link href="/auth/login" className="btn-cta-dark">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10 17 15 12 10 7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                      </svg>
                      Log In to My Account
                    </Link>
                    <Link href="/auth/request-password-reset" className="btn-cta-outline-dark">
                      Forgot password?
                    </Link>
                  </div>
                </>
              )}
            </div>

            {/* New families / already-member panel */}
            <div className="cta-card new-family">
              {isLoggedIn ? (
                <>
                  <div className="cta-label">Not {firstName ?? "you"}?</div>
                  <div className="cta-title">
                    Sign in with a<br />different account.
                  </div>
                  <div className="cta-body">
                    If this isn&apos;t your account, you can sign out and log in
                    with a different email address, or create a new family account.
                  </div>
                  <div className="cta-actions">
                    <form action={signOut}>
                      <button type="submit" className="btn-cta-plum">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Sign Out
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <div className="cta-label">New Families</div>
                  <div className="cta-title">
                    First time at AYDT?<br />Let&apos;s get you set up.
                  </div>
                  <div className="cta-body">
                    Create a free family account to start registering your dancers.
                    It only takes a few minutes, and you&apos;ll be ready to enroll in
                    any open program.
                  </div>
                  <div className="cta-actions">
                    <Link href="/register" className="btn-cta-plum">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                      </svg>
                      Create a Family Account
                    </Link>
                    <a href="#semesters" className="btn-cta-ghost-plum">
                      Browse programs first
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
