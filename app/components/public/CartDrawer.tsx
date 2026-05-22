"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { useCart } from "@/app/providers/CartProvider";
import { useSemesterData } from "@/app/providers/SemesterDataProvider";
import type { CartItem, PublicSession } from "@/types/public";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fallbackSessionPrice(session: PublicSession): number {
  if (session.pricingModel === "per_session") return session.dropInPrice ?? 0;
  const tier = session.priceTiers?.find((t) => t.isDefault) ?? session.priceTiers?.[0];
  return tier?.amount ?? 0;
}

function itemPrice(item: CartItem, sessionMap: Map<string, PublicSession>): number {
  if (item.priceSnapshot != null) return item.priceSnapshot;
  const rep = sessionMap.get(item.sessionId);
  return rep ? fallbackSessionPrice(rep) : 0;
}

type DisciplineKey = "ballet" | "contemp" | "jazz" | "default";

function disciplineKey(discipline?: string | null): DisciplineKey {
  const d = (discipline ?? "").toLowerCase();
  if (d.includes("ballet")) return "ballet";
  if (d.includes("contemp") || d.includes("lyrical") || d.includes("modern")) return "contemp";
  if (d.includes("jazz") || d.includes("hip") || d.includes("tap")) return "jazz";
  return "default";
}

function DisciplineIcon({ k }: { k: DisciplineKey }) {
  if (k === "contemp") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M12 4 L 19 8 L 19 16 L 12 20 L 5 16 L 5 8 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  if (k === "jazz") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M12 4 L 13.5 10.5 L 20 12 L 13.5 13.5 L 12 20 L 10.5 13.5 L 4 12 L 10.5 10.5 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function fmtCurrency(dollars: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}

function fmtDayDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h! >= 12 ? "PM" : "AM";
  const hour = h! % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
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
  const { items, removeItem, itemCount, isExpired, preview, secondsRemaining } = useCart();
  const { semester } = useSemesterData();

  const touchStartY = useRef<number | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0]!.clientY;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0]!.clientY - touchStartY.current;
    if (delta > 60) onClose();
    touchStartY.current = null;
  }

  const sessionMap = useMemo(() => {
    const map = new Map<string, PublicSession>();
    for (const s of semester.sessions) map.set(s.id, s);
    return map;
  }, [semester.sessions]);

  const scheduleSessionsMap = useMemo(() => {
    const map = new Map<string, PublicSession[]>();
    for (const s of semester.sessions) {
      const key = s.scheduleId ?? s.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""));
    }
    return map;
  }, [semester.sessions]);

  const subtotal = items.reduce((sum, it) => sum + itemPrice(it, sessionMap), 0);

  return (
    <div className={`sem-cart-drawer${isOpen ? "" : " hidden"}`}>
      <div
        className="sem-cd-drag-handle"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="sem-cd-drag-handle-bar" />
      </div>

      <div className="sem-cd-header">
        <div className="sem-cd-title">
          Your Cart
          {itemCount > 0 && <span className="sem-cd-count-pill">{itemCount}</span>}
        </div>
        <button className="sem-cd-close" onClick={onClose} aria-label="Close cart">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      {itemCount > 0 && !isExpired && (
        <div className="sem-cd-ttl">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Cart expires in <span className="sem-cd-ttl-time">{fmtTimer(secondsRemaining)}</span>
        </div>
      )}

      {isExpired && (
        <div className="sem-cd-expired">
          Your cart has expired. Please add items again.
        </div>
      )}

      <div className="sem-cd-items">
        {items.length === 0 && (
          <div className="sem-cd-empty">No items in your cart yet.</div>
        )}

        {items.map((item) => (
          <CartRow
            key={item.id}
            item={item}
            sessionMap={sessionMap}
            scheduleSessionsMap={scheduleSessionsMap}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </div>

      {itemCount > 0 && (
        <div className="sem-cd-foot">
          <div className="sem-cd-totals">
            <div className="sem-cd-tot-row">
              <span className="sem-cd-tot-label">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
              <span className="sem-cd-tot-amt">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="sem-cd-tot-row">
              <span className="sem-cd-tot-label">Fees &amp; add-ons</span>
              <span className="sem-cd-tot-amt"><small>at checkout</small></span>
            </div>
            <div className="sem-cd-tot-row subtotal">
              <span className="sem-cd-tot-label">Subtotal</span>
              <span className="sem-cd-tot-amt">{fmtCurrency(subtotal)}</span>
            </div>
          </div>

          <Link
            href={preview ? `/preview/semester/${semester.id}/cart` : "/cart"}
            onClick={onClose}
            className="sem-cd-cta"
          >
            <span className="sem-cd-cta-left">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <path d="M3 10h18M8 6V4M16 6V4" />
              </svg>
              Review Cart &amp; Continue
            </span>
            <span className="sem-cd-cta-total">{fmtCurrency(subtotal)}</span>
          </Link>

          <button className="sem-cd-browse" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Keep browsing
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CartRow — one row per CartItem                                              */
/* -------------------------------------------------------------------------- */

function CartRow({
  item,
  sessionMap,
  scheduleSessionsMap,
  onRemove,
}: {
  item: CartItem;
  sessionMap: Map<string, PublicSession>;
  scheduleSessionsMap: Map<string, PublicSession[]>;
  onRemove: () => void;
}) {
  const rep = sessionMap.get(item.sessionId);
  const price = itemPrice(item, sessionMap);
  const dKey = disciplineKey(rep?.discipline);

  const isDropIn = item.mode === "drop-in";
  const formatAttr: "tier" | "dropin" = isDropIn ? "dropin" : "tier";

  const pillLabel = isDropIn
    ? "Drop-in"
    : item.mode === "tiered" && item.tierLabel
      ? item.tierLabel
      : null;

  const timeLabel = rep?.startTime
    ? `${fmtTime(rep.startTime)}${rep.endTime ? ` – ${fmtTime(rep.endTime)}` : ""}`
    : null;

  let metaText: string | null = null;
  if (isDropIn) {
    const count = item.selectedDateIds?.length ?? 0;
    metaText = [rep?.location, `${count} session${count !== 1 ? "s" : ""}`]
      .filter(Boolean)
      .join(" · ");
  } else {
    metaText = [rep?.location, timeLabel].filter(Boolean).join(" · ") || null;
  }

  // Drop-in selected dates (flat, always-visible list)
  const dropInSessions = isDropIn
    ? (item.selectedDateIds ?? [])
        .map((id) => sessionMap.get(id))
        .filter((s): s is PublicSession => !!s)
        .sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""))
    : [];

  // Tier/standard: hint range below if not already on meta — keep minimal, mock omits it.
  void scheduleSessionsMap;

  return (
    <div className="sem-cd-row" data-discipline={dKey} data-format={formatAttr}>
      <div className="sem-cd-row-stripe" />
      <div className="sem-cd-row-disc">
        <DisciplineIcon k={dKey} />
      </div>
      <div className="sem-cd-row-body">
        <div className="sem-cd-row-head">
          <div className="sem-cd-row-name">{item.className || rep?.name}</div>
          <div className="sem-cd-row-price">{price > 0 ? fmtCurrency(price) : "—"}</div>
        </div>
        {(pillLabel || metaText) && (
          <div className="sem-cd-row-meta">
            {pillLabel && <span className="sem-cd-row-pill">{pillLabel}</span>}
            {metaText && <span className="sem-cd-row-meta-text">{metaText}</span>}
          </div>
        )}
        {dropInSessions.length > 0 && (
          <div className="sem-cd-dropin-dates">
            {dropInSessions.map((s) => (
              <div key={s.id} className="sem-cd-dropin-row">
                <span className="sem-cd-dropin-date">{fmtDayDate(s.scheduleDate ?? "")}</span>
                {s.startTime && (
                  <span className="sem-cd-dropin-time">
                    {fmtTime(s.startTime)}
                    {s.endTime ? ` – ${fmtTime(s.endTime)}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sem-cd-row-actions">
        <button className="sem-cd-row-remove" onClick={onRemove} aria-label="Remove from cart">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
