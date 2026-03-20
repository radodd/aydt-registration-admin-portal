"use client";

import { useState, useEffect, useRef } from "react";
import type { PublicSemester } from "@/types/public";
import { SemesterDataProvider } from "@/app/providers/SemesterDataProvider";
import { CartProvider } from "@/app/providers/CartProvider";
import { useCart } from "@/app/providers/CartProvider";
import { SessionGrid } from "@/app/components/public/SessionGrid";
import { CartDrawer } from "@/app/components/public/CartDrawer";
import { CartExpiryTimer } from "@/app/components/public/CartExpiryTimer";
import { PreRegistrationLanding } from "@/app/components/public/PreRegistrationLanding";

interface Props {
  semester: PublicSemester;
  paymentType?: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
  /** Computed server-side to avoid Date.now() hydration mismatch. */
  initialIsOpen: boolean;
}

/* -------------------------------------------------------------------------- */
/* Inner shell — can call useCart() since it renders inside CartProvider       */
/* -------------------------------------------------------------------------- */

interface ShellProps {
  semester: PublicSemester;
  paymentType?: Props["paymentType"];
}

function SemesterShell({ semester, paymentType }: ShellProps) {
  const { itemCount } = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const prevCount = useRef(0);

  // Auto-open drawer when items are ADDED; auto-close when cart empties
  useEffect(() => {
    if (itemCount > prevCount.current) setDrawerOpen(true);
    if (itemCount === 0) setDrawerOpen(false);
    prevCount.current = itemCount;
  }, [itemCount]);

  const dateRange =
    semester.startDate && semester.endDate
      ? `${fmtDate(semester.startDate)} – ${fmtDate(semester.endDate)}`
      : null;

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────── */}
      <div className="sem-hero">
        <div className="sem-hero-inner">
          {dateRange && (
            <div className="sem-hero-eyebrow">{dateRange}</div>
          )}
          <h1 className="sem-hero-title">{semester.name}</h1>
          {semester.description && (
            <p className="sem-hero-desc">{semester.description}</p>
          )}
          <div className="sem-hero-pills">
            {paymentType === "installments" && (
              <span className="sem-hero-pill" style={{
                background: "rgba(122,74,114,0.22)",
                color: "var(--plum-200)",
                border: "1px solid rgba(192,144,184,0.22)",
              }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="4" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                  <rect x="9" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
                Installment plan available
              </span>
            )}
            {(paymentType === "deposit_flat" || paymentType === "deposit_percent") && (
              <span className="sem-hero-pill" style={{
                background: "rgba(122,74,114,0.22)",
                color: "var(--plum-200)",
                border: "1px solid rgba(192,144,184,0.22)",
              }}>
                Deposit + balance option
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Cart expiry (shown inline above session list) ── */}
      <div style={{ background: "var(--pub-surface)", borderBottom: "1px solid var(--pub-border)", padding: "0 40px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <CartExpiryTimer />
        </div>
      </div>

      {/* ── Shifting content wrapper + drawer ─────────────── */}
      <div style={{ display: "flex", position: "relative" }}>
        {/* Session grid — shifts left when drawer is open */}
        <div style={{
          flex: 1,
          minWidth: 0,
          paddingRight: drawerOpen ? 395 : 0,
          transition: "padding-right 0.25s ease",
        }}>
          <div className="sem-main">
            <div className="sem-section-head">
              <div>
                <div className="sem-section-title">Available Classes</div>
                <div className="sem-section-desc">
                  Select a class to see available session times. Add sessions to your cart to continue.
                </div>
              </div>
            </div>

            {semester.sessions.length === 0 ? (
              <div className="sem-empty">
                <p style={{ color: "var(--pub-text-muted)", fontWeight: 500 }}>
                  No sessions are available for this semester yet.
                </p>
              </div>
            ) : (
              <SessionGrid
                sessions={semester.sessions}
                groups={semester.sessionGroups}
              />
            )}
          </div>
        </div>

        {/* Side-panel drawer */}
        <CartDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page component                                                              */
/* -------------------------------------------------------------------------- */

export function SemesterPageContent({ semester, paymentType, initialIsOpen }: Props) {
  const [open, setOpen] = useState(initialIsOpen);

  useEffect(() => {
    if (open || !semester.registrationOpenAt) return;

    const msUntilOpen =
      new Date(semester.registrationOpenAt).getTime() - Date.now();

    if (msUntilOpen <= 0) return;

    const MAX_TIMEOUT_MS = 2_147_483_647;
    if (msUntilOpen > MAX_TIMEOUT_MS) return;

    const id = setTimeout(() => setOpen(true), msUntilOpen);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) {
    return (
      <PreRegistrationLanding
        semester={semester}
        onOpen={() => setOpen(true)}
      />
    );
  }

  return (
    <SemesterDataProvider semester={semester} mode="live">
      <CartProvider semesterId={semester.id}>
        <SemesterShell semester={semester} paymentType={paymentType} />
      </CartProvider>
    </SemesterDataProvider>
  );
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
