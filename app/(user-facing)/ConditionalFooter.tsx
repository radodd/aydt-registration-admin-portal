"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const CHECKOUT_PATHS = ["/cart", "/register"];

interface ConditionalFooterProps {
  isLoggedIn?: boolean;
  firstName?: string | null;
}

export default function ConditionalFooter({ isLoggedIn = false, firstName }: ConditionalFooterProps) {
  const pathname = usePathname();
  const isCheckout = CHECKOUT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isCheckout) return null;

  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div className="pub-footer-top">

          {/* Brand column */}
          <div>
            <Link href="/" className="pub-footer-logo">
              <div className="pub-footer-logo-mark">AY</div>
              <div className="pub-footer-logo-text">American Youth Dance Theater</div>
            </Link>
            <div className="pub-footer-tagline">
              Where joy and technique take center stage.
            </div>
            <div className="pub-footer-wine-badge">Spring 2026 Enrollment Open</div>
            <div className="pub-footer-contact">
              <div className="pub-footer-contact-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.49 5.49l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/>
                </svg>
                (212) 717-5419
              </div>
              <div className="pub-footer-contact-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                admin@aydt.nyc
              </div>
            </div>
            <div className="pub-footer-social">
              <a href="https://www.instagram.com/aydt_nyc/" target="_blank" rel="noopener" className="pub-footer-social-btn" aria-label="Instagram">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M17.5 6.5h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </a>
              <a href="https://www.facebook.com/americanyouthdancetheater" target="_blank" rel="noopener" className="pub-footer-social-btn" aria-label="Facebook">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Programs column */}
          <div>
            <div className="pub-footer-col-title">Programs</div>
            <div className="pub-footer-links">
              <a href="https://aydt.nyc/early-childhood/" target="_blank" rel="noopener" className="pub-footer-link">Early Childhood</a>
              <a href="https://aydt.nyc/junior-division/" target="_blank" rel="noopener" className="pub-footer-link">Junior Division</a>
              <a href="https://aydt.nyc/senior-division/" target="_blank" rel="noopener" className="pub-footer-link">Senior Division</a>
              <a href="https://aydt.nyc/summer/" target="_blank" rel="noopener" className="pub-footer-link">Summer</a>
              <a href="https://aydt.nyc/adult/" target="_blank" rel="noopener" className="pub-footer-link">Adult</a>
              <a href="https://aydt.nyc/events/" target="_blank" rel="noopener" className="pub-footer-link">Events</a>
            </div>
          </div>

          {/* Account column — adapts based on auth state */}
          <div>
            <div className="pub-footer-col-title">
              {isLoggedIn ? `Hi, ${firstName ?? "there"}` : "My Account"}
            </div>
            <div className="pub-footer-links">
              {isLoggedIn ? (
                <>
                  <Link href="/profile" className="pub-footer-link">My Account</Link>
                  <Link href="/profile" className="pub-footer-link">My Registrations</Link>
                  <Link href="/profile" className="pub-footer-link">Payment History</Link>
                  <Link href="/auth/request-password-reset" className="pub-footer-link">Reset Password</Link>
                </>
              ) : (
                <>
                  <Link href="/auth/login" className="pub-footer-link">Log In</Link>
                  <Link href="/auth?tab=signup" className="pub-footer-link">Create Account</Link>
                  <Link href="/auth/request-password-reset" className="pub-footer-link">Reset Password</Link>
                </>
              )}
            </div>
          </div>

          {/* Locations column */}
          <div>
            <div className="pub-footer-col-title">Locations</div>

            <div className="pub-footer-location">
              <div className="pub-footer-location-name">Upper East Side</div>
              <div className="pub-footer-location-detail">
                <span>428 E 75th Street</span>
                <span>New York, NY 10021</span>
                <span>O: (212) 717-5419</span>
                <span>F: (866) 679-8943</span>
              </div>
              <div className="pub-footer-location-hours">
                Mon – Fri 9:00 am – 8:30 pm<br />
                Sat 9:00 am – 3:00 pm
              </div>
            </div>

            <div className="pub-footer-location">
              <div className="pub-footer-location-name">Washington Heights</div>
              <div className="pub-footer-location-detail">
                <span>4140 Broadway, Fl 2 @ NoMAA</span>
                <span>New York, NY 10033</span>
                <span>O: (212) 717-5419</span>
                <span>F: (866) 679-8943</span>
                <span>Español: (646) 586-8661</span>
              </div>
              <div className="pub-footer-location-hours">
                Tues 3:00 pm – 5:45 pm<br />
                Sat 10:00 am – 1:00 pm
              </div>
            </div>
          </div>

        </div>

        <div className="pub-footer-bottom">
          <div className="pub-footer-copy">
            © {new Date().getFullYear()} American Youth Dance Theater. All rights reserved. · Est. 1996, New York City.
          </div>
          <div className="pub-footer-bottom-links">
            <a href="https://aydt.nyc/privacy-policy/" target="_blank" rel="noopener" className="pub-footer-bottom-link">Privacy Policy</a>
            <a href="https://aydt.nyc/terms-of-use/" target="_blank" rel="noopener" className="pub-footer-bottom-link">Terms of Use</a>
            <Link href="#" className="pub-footer-bottom-link">Accessibility</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
