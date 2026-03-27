"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCart } from "@/app/providers/CartProvider";
import { useSemesterData } from "@/app/providers/SemesterDataProvider";
import type { PublicSession } from "@/types/public";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function sessionPrice(session: PublicSession): number {
  if (session.pricingModel === "per_session") return session.dropInPrice ?? 0;
  const tier = session.priceTiers?.find((t) => t.isDefault) ?? session.priceTiers?.[0];
  return tier?.amount ?? 0;
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

function fmtCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDateShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

interface CartDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function CartDrawer({ isOpen = false, onClose = () => {} }: CartDrawerProps) {
  const { sessionIds, remove, itemCount, isExpired, preview, secondsRemaining } = useCart();
  const { semester } = useSemesterData();

  // Map sessionId → session object
  const sessionMap = useMemo(() => {
    const map = new Map<string, PublicSession>();
    for (const s of semester.sessions) map.set(s.id, s);
    return map;
  }, [semester.sessions]);

  // Build a map: scheduleId → all sessions with that scheduleId
  const scheduleSessionsMap = useMemo(() => {
    const map = new Map<string, PublicSession[]>();
    for (const s of semester.sessions) {
      const key = s.scheduleId ?? s.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    // Sort each group chronologically
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""));
    }
    return map;
  }, [semester.sessions]);

  const cartSessions = sessionIds.map((id) => sessionMap.get(id)).filter(Boolean) as PublicSession[];

  const subtotal = cartSessions.reduce((sum, s) => sum + sessionPrice(s), 0);

  return (
    <div className={`sem-cart-drawer${isOpen ? "" : " hidden"}`}>
      {/* Header */}
      <div className="sem-cd-header">
        <div className="sem-cd-title">Your Cart</div>
        {itemCount > 0 && <div className="sem-cd-count">{itemCount}</div>}
        <button className="sem-cd-close" onClick={onClose} aria-label="Close cart">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Expiry timer */}
      {itemCount > 0 && !isExpired && (
        <div className="sem-cd-ttl">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Cart expires in <span className="sem-cd-ttl-time">{fmtTimer(secondsRemaining)}</span>
        </div>
      )}

      {isExpired && (
        <div style={{ margin: "10px 20px 0", padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: "var(--pub-radius-md)", fontSize: 12, color: "#B91C1C" }}>
          Your cart has expired. Please add items again.
        </div>
      )}

      {/* Items */}
      <div className="sem-cd-items">
        {cartSessions.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--pub-text-faint)", fontSize: 13 }}>
            No items in your cart yet.
          </div>
        )}

        {cartSessions.map((session) => {
          const scheduleKey = session.scheduleId ?? session.id;
          const scheduleGroup = scheduleSessionsMap.get(scheduleKey) ?? [session];
          const firstDate = scheduleGroup[0]?.scheduleDate;
          const lastDate = scheduleGroup[scheduleGroup.length - 1]?.scheduleDate;
          const classCount = scheduleGroup.length;
          const price = sessionPrice(session);
          const abbrev = getDisciplineAbbrev(session);

          const dayLabel = session.daysOfWeek?.length
            ? session.daysOfWeek.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
            : firstDate
              ? new Date(firstDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }) + "s"
              : null;

          const timeLabel = session.startTime
            ? `${fmtTime(session.startTime)}${session.endTime ? ` – ${fmtTime(session.endTime)}` : ""}`
            : null;

          const dateRangeLabel = firstDate
            ? classCount > 1 && lastDate
              ? `${fmtDateShort(firstDate)} – ${fmtDateShort(lastDate)} · ${classCount} classes`
              : `${fmtDateShort(firstDate)} · ${classCount} class`
            : null;

          return (
            <div key={session.id} className="sem-cd-item">
              <div className="sem-cd-item-top">
                <div className="sem-cd-disc">{abbrev}</div>
                <div className="sem-cd-info">
                  <div className="sem-cd-name">{session.name}</div>
                  {session.location && (
                    <div className="sem-cd-location">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {session.location}
                    </div>
                  )}
                </div>
                <div className="sem-cd-right">
                  <div className="sem-cd-price">{price > 0 ? fmtCurrency(price) : "—"}</div>
                  <button className="sem-cd-remove" onClick={() => remove(session.id)}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Remove
                  </button>
                </div>
              </div>

              <div className="sem-cd-item-details">
                {(dayLabel || timeLabel) && (
                  <div className="sem-cd-detail-row">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {[dayLabel, timeLabel].filter(Boolean).join(" · ")}
                  </div>
                )}
                {dateRangeLabel && (
                  <div className="sem-cd-detail-row">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {dateRangeLabel}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {itemCount > 0 && (
        <div className="sem-cd-summary">
          <div className="sem-cd-summary-row">
            <span className="sem-cd-summary-label">{itemCount} session{itemCount !== 1 ? "s" : ""}</span>
            <span className="sem-cd-summary-value">{fmtCurrency(subtotal)}</span>
          </div>
          <div className="sem-cd-summary-row">
            <span className="sem-cd-summary-label">Fees &amp; add-ons</span>
            <span className="sem-cd-summary-value" style={{ color: "var(--pub-text-muted)", fontStyle: "italic", fontWeight: 500 }}>At checkout</span>
          </div>
          <div className="sem-cd-summary-row total">
            <span className="sem-cd-summary-label">Subtotal</span>
            <span className="sem-cd-summary-total">{fmtCurrency(subtotal)}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      {itemCount > 0 && (
        <div className="sem-cd-footer">
          <Link
            href={preview ? `/preview/semester/${semester.id}/cart` : "/cart"}
            onClick={onClose}
            className="sem-cd-cta"
          >
            <div className="sem-cd-cta-left">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Review Cart &amp; Continue
            </div>
            <div className="sem-cd-cta-total">{fmtCurrency(subtotal)}</div>
          </Link>
          <button className="sem-cd-browse" onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Keep browsing
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

function fmtTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h! >= 12 ? "PM" : "AM";
  const hour = h! % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}
