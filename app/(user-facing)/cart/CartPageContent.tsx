"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/providers/CartProvider";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { gaEvent } from "@/utils/analytics";
import type { PublicSession } from "@/types/public";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function sessionPrice(session: PublicSession): number {
  if (session.pricingModel === "per_session") {
    return session.dropInPrice ?? 0;
  }
  const defaultTier =
    session.priceTiers?.find((t) => t.isDefault) ?? session.priceTiers?.[0];
  return defaultTier?.amount ?? 0;
}

function getDisciplineAbbrev(session: PublicSession): string {
  const source = session.discipline ?? session.name;
  const words = source.split(/[\s\-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0].slice(0, 3).toUpperCase()}\n${words[1].slice(0, 3).toUpperCase()}`;
  }
  const s = source.toUpperCase();
  return s.length <= 4 ? s : `${s.slice(0, 3)}\n${s.slice(3, 6)}`;
}

function fmtTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

const STEPS = [
  { label: "Sessions" },
  { label: "Review\nCart" },
  { label: "Dancer\nInfo" },
  { label: "Reg.\nInfo" },
  { label: "Payment" },
  { label: "Confirm" },
];

export function CartPageContent() {
  const router = useRouter();

  const {
    sessionIds,
    semesterId,
    remove,
    isExpired,
    clear,
    itemCount,
    hydrated,
    secondsRemaining,
    preview,
  } = useCart();

  const [semesterSessions, setSemesterSessions] = useState<PublicSession[]>([]);
  const [semesterName, setSemesterName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    if (!semesterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSemesterForDisplay(semesterId, preview ? "preview" : "live").then(
      (semester) => {
        setSemesterSessions(semester.sessions);
        setSemesterName(semester.name);
        setLoading(false);
      },
    );
  }, [hydrated, semesterId]);

  const enrichedSessions = useMemo(
    () => semesterSessions.filter((s) => sessionIds.includes(s.id)),
    [semesterSessions, sessionIds],
  );

  useEffect(() => {
    if (isExpired) {
      clear();
      router.push(
        preview ? `/preview/semester/${semesterId}` : `/semester/${semesterId}`,
      );
    }
  }, [isExpired, clear, router, semesterId, secondsRemaining, hydrated, itemCount]);

  const subtotal = useMemo(
    () => enrichedSessions.reduce((acc, s) => acc + sessionPrice(s), 0),
    [enrichedSessions],
  );

  // Fire view_cart once when cart loads with items
  const viewCartFired = useRef(false);
  useEffect(() => {
    if (viewCartFired.current || enrichedSessions.length === 0) return;
    viewCartFired.current = true;
    gaEvent("view_cart", {
      currency: "USD",
      value: subtotal / 100,
      items: enrichedSessions.map((s) => ({
        item_id: s.id,
        item_name: s.name,
        item_category: s.discipline ?? s.name,
        price: sessionPrice(s) / 100,
        quantity: 1,
      })),
    });
  }, [enrichedSessions, subtotal]);

  const semesterLink = preview
    ? `/preview/semester/${semesterId}`
    : `/semester/${semesterId}`;

  const continueLink = preview
    ? `/preview/semester/${semesterId}/register`
    : `/register?semester=${semesterId}`;

  /* ── Loading guards ── */
  if (!hydrated) {
    return (
      <div className="cart-page-main">
        <div className="cart-page-inner">
          <div style={{ color: "var(--pub-text-muted)", fontSize: 14 }}>
            Loading cart…
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cart-page-main">
        <div className="cart-page-inner">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 100,
                  borderRadius: "var(--pub-radius-lg)",
                  background: "var(--pub-surface-warm)",
                  border: "1px solid var(--pub-border)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!loading && enrichedSessions.length === 0) {
    return (
      <div className="cart-empty-state">
        <div className="cart-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <div className="cart-empty-title">Your cart is empty</div>
        <div className="cart-empty-desc">
          Browse available semesters to add sessions.
        </div>
        <Link href="/" className="btn-continue">
          Browse Semesters
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </Link>
      </div>
    );
  }

  const isUrgent = secondsRemaining < 300;

  return (
    <>
      {/* ── Step indicator ── */}
      <div className="cart-steps-bar">
        <div className="cart-steps-inner">
          <div className="reg-steps">
            {STEPS.map((step, i) => {
              const done = i < 1;
              const active = i === 1;
              return (
                <div
                  key={i}
                  className={`reg-step${done ? " done" : ""}${active ? " active" : ""}`}
                >
                  <div className="reg-step-circle">
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div className="reg-step-label">
                    {step.label.split("\n").map((line, li) => (
                      <span key={li}>{li > 0 && <br />}{line}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="cart-page-main">
        <div className="cart-page-inner">

          {/* Page header */}
          <div className="cart-page-header">
            <div>
              <div className="cart-page-title">Review Your Cart</div>
              <div className="cart-page-subtitle">
                Confirm your sessions before continuing to registration.
              </div>
            </div>
            {itemCount > 0 && (
              <div className={`cart-ttl${isUrgent ? " urgent" : ""}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Cart expires in{" "}
                <span className="cart-ttl-time">{fmtTimer(secondsRemaining)}</span>
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="cart-section-label">
            Your selections{semesterName ? ` — ${semesterName}` : ""}
          </div>

          {enrichedSessions.map((session) => {
            const price = sessionPrice(session);
            const abbrev = getDisciplineAbbrev(session).split("\n");
            return (
              <div key={session.id} className="cart-item">
                <div className="cart-item-disc">
                  {abbrev.map((line, i) => (
                    <span key={i}>{i > 0 && <br />}{line}</span>
                  ))}
                </div>
                <div className="cart-item-info">
                  <div className="cart-item-name">{session.name}</div>
                  <div className="cart-item-meta">
                    {session.startTime && (
                      <div className="cart-item-meta-row">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {session.startTime}
                        {session.endTime ? ` – ${session.endTime}` : ""}
                      </div>
                    )}
                    {session.location && (
                      <div className="cart-item-meta-row">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {session.location}
                      </div>
                    )}
                  </div>
                </div>
                <div className="cart-item-right">
                  <button
                    type="button"
                    className="cart-item-remove"
                    onClick={() => {
                      gaEvent("remove_from_cart", {
                        currency: "USD",
                        value: sessionPrice(session) / 100,
                        items: [{
                          item_id: session.id,
                          item_name: session.name,
                          item_category: session.discipline ?? session.name,
                          price: sessionPrice(session) / 100,
                          quantity: 1,
                        }],
                      });
                      remove(session.id);
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Remove
                  </button>
                  {price > 0 ? (
                    <div className="cart-item-price">{formatCurrency(price)}</div>
                  ) : (
                    <div className="cart-item-price-tbd">Priced at checkout</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add more */}
          <Link href={semesterLink} className="add-more-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Add more sessions
          </Link>

          {/* Order summary */}
          <div className="order-card">
            <div className="order-card-header">Order Summary</div>

            <div className="order-group-label">Classes</div>
            <div className="order-card-body">
              {enrichedSessions.map((session) => {
                const price = sessionPrice(session);
                return (
                  <div key={session.id} className="order-line">
                    <div>
                      <div className="order-line-label">{session.name}</div>
                      {session.startTime && (
                        <div className="order-line-sub">
                          {session.startTime}
                          {session.endTime ? ` – ${session.endTime}` : ""}
                          {session.location ? ` · ${session.location}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="order-line-amount">
                      {price > 0 ? formatCurrency(price) : "—"}
                    </div>
                  </div>
                );
              })}
              {subtotal > 0 && (
                <div className="order-line order-line-subtotal">
                  <div className="order-line-label">Subtotal</div>
                  <div className="order-line-amount">{formatCurrency(subtotal)}</div>
                </div>
              )}
            </div>

            <div className="order-fees-group">
              <div className="order-group-label" style={{ borderTop: "1px solid var(--pub-border)", paddingTop: 12 }}>
                Fees &amp; Add-ons
              </div>
              <div className="order-line">
                <div>
                  <div className="order-line-label">Registration fee</div>
                  <div className="order-line-sub">Per dancer enrolled</div>
                </div>
                <div className="order-line-amount pending">Applied at payment</div>
              </div>
              <div className="order-line">
                <div>
                  <div className="order-line-label">Family &amp; multi-class discounts</div>
                  <div className="order-line-sub">Automatically applied when eligible</div>
                </div>
                <div className="order-line-amount pending">Applied at payment</div>
              </div>
              <div className="order-line order-line-last">
                <div>
                  <div className="order-line-label">Coupon code</div>
                  <div className="order-line-sub">Enter at the payment step</div>
                </div>
                <div className="order-line-amount pending">Applied at payment</div>
              </div>
            </div>

            <div className="order-total-row">
              <div>
                <div className="order-total-label">Estimated Total</div>
                <div className="order-total-sub">Final amount confirmed at payment</div>
              </div>
              <div className="order-total-amount">
                {subtotal > 0 ? formatCurrency(subtotal) : "—"}
              </div>
            </div>
          </div>

          {/* Installment note */}
          <div className="installment-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            An installment payment plan is available at checkout. You can choose
            to pay in full or spread payments across the semester.
          </div>

          {/* CTAs */}
          <div className="cart-cta-row">
            <Link href={semesterLink} className="btn-back">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Add more sessions
            </Link>
            <Link href={continueLink} className="btn-continue">
              Continue to Dancer Info
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
