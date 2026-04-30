"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface Semester {
  id: string;
  name: string;
  status: string;
  class_sessions: { id: string; start_date: string | null; end_date: string | null }[];
}

interface Props {
  semesters: Semester[];
  isLoggedIn: boolean;
  firstName: string | null;
  openSemesterName: string | null;
}

interface BrandAsset {
  label: string;
  src: string;
  type: "icon" | "primary" | "secondary";
}

const ICONS: BrandAsset[] = [
  { label: "Blush Cherry",      src: "/brand/icon-blush-cherry.png",      type: "icon" },
  { label: "Lilac Cherry",      src: "/brand/icon-lilac-cherry.png",      type: "icon" },
  { label: "Sand",              src: "/brand/icon-sand.png",              type: "icon" },
  { label: "Teal",              src: "/brand/icon-teal.png",              type: "icon" },
  { label: "Teal Lilac Cherry", src: "/brand/icon-teal-lilac-cherry.png", type: "icon" },
];

const PRIMARY_LOGOS: BrandAsset[] = [
  { label: "Blush Cherry",      src: "/brand/logo-primary-blush-cherry.png",      type: "primary" },
  { label: "Lilac Cherry",      src: "/brand/logo-primary-lilac-cherry.png",      type: "primary" },
  { label: "Sand",              src: "/brand/logo-primary-sand.png",              type: "primary" },
  { label: "Teal",              src: "/brand/logo-primary-teal.png",              type: "primary" },
  { label: "Teal Lilac Cherry", src: "/brand/logo-primary-teal-lilac-cherry.png", type: "primary" },
];

const SECONDARY_LOGOS: BrandAsset[] = [
  { label: "Blush Cherry",      src: "/brand/logo-secondary-blush-cherry.png",      type: "secondary" },
  { label: "Lilac Cherry",      src: "/brand/logo-secondary-lilac-cherry.png",      type: "secondary" },
  { label: "Sand",              src: "/brand/logo-secondary-sand.png",              type: "secondary" },
  { label: "Teal",              src: "/brand/logo-secondary-teal.png",              type: "secondary" },
  { label: "Teal Lilac Cherry", src: "/brand/logo-secondary-teal-lilac-cherry.png", type: "secondary" },
];

const ALL_ASSETS = [...ICONS, ...PRIMARY_LOGOS, ...SECONDARY_LOGOS];
const DISCIPLINES = ["Ballet", "Tap", "Hip-Hop", "Broadway", "Contemporary"];

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export default function HomeV2Client({ semesters, isLoggedIn, firstName, openSemesterName }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(3); // default: icon-teal
  const [cyclerOpen, setCyclerOpen] = useState(false);

  const selected = ALL_ASSETS[selectedIdx];

  const prev = useCallback(() => setSelectedIdx(i => (i - 1 + ALL_ASSETS.length) % ALL_ASSETS.length), []);
  const next = useCallback(() => setSelectedIdx(i => (i + 1) % ALL_ASSETS.length), []);

  const displayName = firstName ?? "there";
  const isIcon = selected.type === "icon";

  return (
    <>
      {/* ── Nav ─────────────────────────────────────── */}
      <nav className="v2-topnav">
        <div className="v2-topnav-inner">
          <Link href="/v2" className="v2-nav-logo">
            <Image
              src={selected.src}
              alt="AYDT"
              width={36}
              height={36}
              className="v2-nav-logo-img"
              style={{ objectFit: "contain", height: 36, width: "auto" }}
            />
            <div className="v2-nav-logo-text">
              <div className="v2-nav-logo-name">American Youth</div>
              <span className="v2-nav-logo-script">Dance Theater</span>
            </div>
          </Link>

          <div className="v2-nav-tabs">
            <a href="#programs" className="v2-nav-tab active">Programs</a>
          </div>

          <div className="v2-nav-right">
            {isLoggedIn && (
              <span className="v2-nav-greeting">
                Hi, <span className="name">{displayName}</span>
              </span>
            )}
            {isLoggedIn ? (
              <Link href="/profile" className="v2-btn v2-btn-ghost-nav">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                My Account
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="v2-btn v2-btn-ghost-nav">Log In</Link>
                <Link href="/auth?tab=signup" className="v2-btn v2-btn-primary-nav">Create Account</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Announcement ────────────────────────────── */}
      {openSemesterName && (
        <div className="v2-announce">
          <div className="v2-announce-inner">
            <span className="v2-announce-dot" />
            <span className="v2-announce-text">
              <strong>{openSemesterName}</strong> — enrollment is now open
            </span>
            <a href="#programs" className="v2-announce-link">View available sessions →</a>
          </div>
        </div>
      )}

      {/* ── Hero ────────────────────────────────────── */}
      <section className="v2-hero">
        <div className="v2-hero-orb v2-hero-orb-1" />
        <div className="v2-hero-orb v2-hero-orb-2" />

        <div className="v2-hero-inner">
          <div>
            <div className="v2-hero-eyebrow">American Youth Dance Theater</div>
            <h1 className="v2-hero-title">Where joy<br />and technique</h1>
            <div className="v2-hero-script">take center stage.</div>
            <p className="v2-hero-body">
              Small classes, experienced teachers, and a nurturing community in New York City since 1996.
            </p>
            <div className="v2-hero-ctas">
              <a href="#programs" className="v2-btn-hero-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                View Open Programs
              </a>
              <span className="v2-hero-or">or</span>
              {isLoggedIn ? (
                <Link href="/profile" className="v2-btn-hero-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Go to My Account
                </Link>
              ) : (
                <Link href="/auth/login" className="v2-btn-hero-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Log In to My Account
                </Link>
              )}
            </div>
          </div>

          {/* Framed logo moment */}
          <div className="v2-hero-feature">
            <div className="v2-hero-logo-frame">
              <Image
                src={selected.src}
                alt={`AYDT — ${selected.label}`}
                width={isIcon ? 108 : 280}
                height={108}
                className={`v2-hero-logo-img${isIcon ? " is-icon" : ""}`}
                style={{ objectFit: "contain" }}
              />
              {isIcon && (
                <>
                  <div className="v2-hero-logo-wordmark">American Youth</div>
                  <div className="v2-hero-logo-script">Dance Theater</div>
                </>
              )}
              <div className="v2-hero-logo-rule" />
              <div className="v2-hero-logo-est">Est. 1996 · New York City</div>
              <div className="v2-hero-logo-nav">
                <button className="v2-logo-nav-btn" onClick={prev} aria-label="Previous logo">‹</button>
                <span className="v2-logo-nav-count">{selectedIdx + 1} / {ALL_ASSETS.length}</span>
                <button className="v2-logo-nav-btn" onClick={next} aria-label="Next logo">›</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Programs ────────────────────────────────── */}
      <section className="v2-section" id="programs">
        <div className="v2-section-eyebrow">Enrollment</div>
        <h2 className="v2-section-title">Available Programs</h2>
        <div className="v2-section-script">this season</div>
        <p className="v2-section-intro">
          Select a program to browse classes, schedules, and pricing. Register as many dancers as you need under one account.
        </p>

        {semesters.length === 0 ? (
          <div style={{ marginTop: 56, padding: 40, background: "var(--surface-warm)", border: "1px solid var(--border)", borderRadius: 16, textAlign: "center" }}>
            <p style={{ color: "var(--text-muted)", fontWeight: 500 }}>No programs are currently open for registration.</p>
            <p style={{ color: "var(--text-faint)", fontSize: 13, marginTop: 4 }}>Check back soon for upcoming programs.</p>
          </div>
        ) : (
          <div className="v2-programs-grid">
            {semesters.map((semester) => {
              const sessions = semester.class_sessions ?? [];
              const allDates = sessions.flatMap(s => [s.start_date, s.end_date].filter(Boolean)) as string[];
              const earliest = allDates.length > 0 ? allDates.reduce((a, b) => a < b ? a : b) : null;
              const latest   = allDates.length > 0 ? allDates.reduce((a, b) => a > b ? a : b) : null;
              const isOpen = semester.status === "published";

              return (
                <article key={semester.id} className="v2-semester-card" style={isOpen ? {} : { opacity: 0.75 }}>
                  <div className={`v2-card-header${isOpen ? "" : " closed"}`}>
                    <div className="v2-card-header-row">
                      <div className="v2-card-title">{semester.name}</div>
                      <span className={`v2-badge ${isOpen ? "v2-badge-open" : "v2-badge-closed"}`}>
                        <span className="v2-badge-dot" />
                        {isOpen ? "Open" : "Closed"}
                      </span>
                    </div>
                    {earliest && latest && (
                      <div className="v2-card-dates">{formatDate(earliest)} – {formatDate(latest)}</div>
                    )}
                  </div>
                  <div className="v2-card-body">
                    <div className="v2-disc-chips">
                      {DISCIPLINES.map(d => <span key={d} className="v2-disc-chip">{d}</span>)}
                    </div>
                    <div className="v2-card-footer">
                      <div className="v2-card-stat">
                        <span className="v2-card-stat-val">{sessions.length}</span>
                        <span className="v2-card-stat-label">Classes</span>
                      </div>
                      {isOpen ? (
                        <Link href={`/semester/${semester.id}`} className="v2-btn-view">
                          View Classes →
                        </Link>
                      ) : (
                        <span className="v2-btn-view disabled">Closed</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Brand Divider ───────────────────────────── */}
      <div className="v2-brand-divider">
        <div className="v2-divider-rule" />
        <div className="v2-divider-mark">
          <Image
            src={selected.src}
            alt="AYDT"
            width={100}
            height={36}
            className="v2-divider-icon"
            style={{ objectFit: "contain", height: 36, width: "auto", maxWidth: 100 }}
          />
          <span className="v2-divider-script">American Youth Dance Theater</span>
        </div>
        <div className="v2-divider-rule" />
      </div>

      {/* ── Account Section ─────────────────────────── */}
      <section className="v2-account-section" id="account">
        <div className="v2-account-inner">
          <div className="v2-section-eyebrow">Your Account</div>
          <h2 className="v2-account-greeting-title">
            {isLoggedIn ? `Good to see you,` : "Ready to get started?"}
          </h2>
          {isLoggedIn && <div className="v2-account-greeting-script">{displayName}.</div>}

          <div className="v2-account-cards">
            <div className="v2-account-card dark">
              <Image
                src={selected.src}
                alt=""
                width={180}
                height={180}
                className="v2-account-card-watermark"
                style={{ objectFit: "contain" }}
                aria-hidden
              />
              {isLoggedIn ? (
                <>
                  <div className="v2-account-card-eyebrow">Your Account</div>
                  <h3 className="v2-account-card-title">
                    You&apos;re signed in <span className="script">as {displayName}.</span>
                  </h3>
                  <p className="v2-account-card-body">
                    Head to your dashboard to manage your dancers, view current registrations, and enroll in new programs.
                  </p>
                  <Link href="/profile" className="v2-btn-card-action">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Go to My Account
                  </Link>
                </>
              ) : (
                <>
                  <div className="v2-account-card-eyebrow">Returning Families</div>
                  <h3 className="v2-account-card-title">
                    Welcome back. <span className="script">Pick up where you left off.</span>
                  </h3>
                  <p className="v2-account-card-body">
                    Log in to view your registrations, manage your dancers, and enroll for the new semester.
                  </p>
                  <Link href="/auth/login" className="v2-btn-card-action">Log In to My Account</Link>
                </>
              )}
            </div>

            <div className="v2-account-card blush">
              <Image
                src={selected.src}
                alt=""
                width={180}
                height={180}
                className="v2-account-card-watermark"
                style={{ objectFit: "contain" }}
                aria-hidden
              />
              {isLoggedIn ? (
                <>
                  <div className="v2-account-card-eyebrow">Not {displayName}?</div>
                  <h3 className="v2-account-card-title">
                    Sign in with a <span className="script">different account.</span>
                  </h3>
                  <p className="v2-account-card-body">
                    Sign out and log in with a different email address, or create a new family account.
                  </p>
                  <Link href="/auth/login" className="v2-btn-card-action">Sign Out</Link>
                </>
              ) : (
                <>
                  <div className="v2-account-card-eyebrow">New Families</div>
                  <h3 className="v2-account-card-title">
                    First time at AYDT? <span className="script">Let&apos;s get you set up.</span>
                  </h3>
                  <p className="v2-account-card-body">
                    Create a free family account to start registering your dancers. It only takes a few minutes.
                  </p>
                  <Link href="/auth?tab=signup" className="v2-btn-card-action">Create a Family Account</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="v2-footer">
        <div className="v2-footer-inner">
          <div className="v2-footer-top">
            <div>
              <div className="v2-footer-brand">
                <Image
                  src={selected.src}
                  alt="AYDT"
                  width={44}
                  height={44}
                  className="v2-footer-brand-img"
                  style={{ objectFit: "contain", height: 44, width: "auto" }}
                />
                <div className="v2-footer-brand-text">
                  <div className="v2-footer-brand-name">American Youth</div>
                  <span className="v2-footer-brand-script">Dance Theater</span>
                </div>
              </div>
              <p className="v2-footer-tag">Where joy and technique take center stage.</p>
              {openSemesterName && (
                <div className="v2-footer-enroll-pill">
                  <span className="dot" /> {openSemesterName} Open
                </div>
              )}
              <div className="v2-footer-contact">
                <div className="v2-footer-contact-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  (212) 717-5419
                </div>
                <div className="v2-footer-contact-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  admin@aydt.nyc
                </div>
              </div>
              <div className="v2-footer-socials">
                <a href="#" className="v2-footer-social" aria-label="Instagram">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                  </svg>
                </a>
                <a href="#" className="v2-footer-social" aria-label="Facebook">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <div className="v2-footer-col-title">Programs</div>
              <div className="v2-footer-links">
                {["Early Childhood", "Junior Division", "Senior Division", "Summer", "Adult", "Events"].map(l => (
                  <a key={l} href="#" className="v2-footer-link">{l}</a>
                ))}
              </div>
            </div>

            <div>
              <div className="v2-footer-col-title">{isLoggedIn ? `Hi, ${displayName}` : "My Account"}</div>
              <div className="v2-footer-links">
                <a href="#" className="v2-footer-link">My Account</a>
                <a href="#" className="v2-footer-link">My Registrations</a>
                <a href="#" className="v2-footer-link">Payment History</a>
                <a href="#" className="v2-footer-link">Reset Password</a>
              </div>
            </div>

            <div>
              <div className="v2-footer-col-title">Locations</div>
              <div className="v2-footer-location">
                <div className="v2-footer-location-name">Upper East Side</div>
                <div className="v2-footer-location-details">
                  428 E 75th Street<br />
                  New York, NY 10021<br />
                  O: (212) 717-5419<br />
                  F: (866) 679-8943<br />
                  <em>Mon – Fri 9:00 am – 8:30 pm</em><br />
                  <em>Sat 9:00 am – 3:00 pm</em>
                </div>
              </div>
              <div className="v2-footer-location">
                <div className="v2-footer-location-name">Washington Heights</div>
                <div className="v2-footer-location-details">
                  4140 Broadway, Fl 2 @ NoMAA<br />
                  New York, NY 10033<br />
                  O: (212) 717-5419<br />
                  Español: (646) 586-8661<br />
                  <em>Tues 3:00 pm – 5:45 pm</em><br />
                  <em>Sat 10:00 am – 1:00 pm</em>
                </div>
              </div>
            </div>
          </div>

          <div className="v2-footer-bottom">
            <div className="v2-footer-copy">© 2026 American Youth Dance Theater. All rights reserved. · Est. 1996, New York City.</div>
            <div className="v2-footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Use</a>
              <a href="#">Accessibility</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Logo Cycler ─────────────────────────────── */}
      <button
        className={`v2-cycler-toggle${cyclerOpen ? " open" : ""}`}
        onClick={() => setCyclerOpen(o => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        {cyclerOpen ? "Close" : "Logos"}
      </button>

      {cyclerOpen && (
        <div className="v2-cycler-panel">
          <div className="v2-cycler-panel-title">Brand Assets</div>

          <div className="v2-cycler-group">
            <div className="v2-cycler-group-label">Icons</div>
            <div className="v2-cycler-grid">
              {ICONS.map((asset, i) => (
                <button
                  key={asset.src}
                  className={`v2-cycler-thumb${selectedIdx === i ? " active" : ""}`}
                  onClick={() => setSelectedIdx(i)}
                  title={asset.label}
                >
                  <Image src={asset.src} alt={asset.label} width={48} height={48} style={{ objectFit: "contain" }} />
                </button>
              ))}
            </div>
          </div>

          <div className="v2-cycler-group">
            <div className="v2-cycler-group-label">Primary Logos</div>
            <div className="v2-cycler-logo-grid">
              {PRIMARY_LOGOS.map((asset, i) => {
                const absIdx = ICONS.length + i;
                return (
                  <button
                    key={asset.src}
                    className={`v2-cycler-logo-thumb${selectedIdx === absIdx ? " active" : ""}`}
                    onClick={() => setSelectedIdx(absIdx)}
                    title={asset.label}
                  >
                    <Image src={asset.src} alt={asset.label} width={120} height={60} style={{ objectFit: "contain" }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="v2-cycler-group">
            <div className="v2-cycler-group-label">Secondary Logos</div>
            <div className="v2-cycler-logo-grid">
              {SECONDARY_LOGOS.map((asset, i) => {
                const absIdx = ICONS.length + PRIMARY_LOGOS.length + i;
                return (
                  <button
                    key={asset.src}
                    className={`v2-cycler-logo-thumb${selectedIdx === absIdx ? " active" : ""}`}
                    onClick={() => setSelectedIdx(absIdx)}
                    title={asset.label}
                  >
                    <Image src={asset.src} alt={asset.label} width={120} height={60} style={{ objectFit: "contain" }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="v2-cycler-selected-name">
            {selected.type === "icon" ? "Icon" : selected.type === "primary" ? "Primary Logo" : "Secondary Logo"} · {selected.label}
          </div>
        </div>
      )}

      {/* ── Theme switcher badge ─────────────────────── */}
      <div className="v2-theme-badge">
        <span className="v2-theme-badge-label">Design B</span>
        <div className="v2-theme-divider" />
        <Link href="/" className="v2-theme-switch-link">
          ← View Design A
        </Link>
      </div>
    </>
  );
}
