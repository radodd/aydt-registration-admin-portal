"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CartProvider } from "@/app/providers/CartProvider";
import { CartPageContent } from "./CartPageContent";
import type { CartState } from "@/types/public";

const STORAGE_KEY_PREFIX = "aydt_cart_";

/**
 * Reads the active (non-expired) cart from localStorage and bootstraps a
 * CartProvider for the cart page. This is needed because the cart page lives
 * outside of any semester's own CartProvider tree.
 */
export function CartRestorer() {
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    console.log(
      "[CartRestorer] Scanning localStorage for active cart. Total keys:",
      localStorage.length,
    );
    let found: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;
      try {
        const cart: CartState = JSON.parse(localStorage.getItem(key)!);
        const expiresAtMs = new Date(cart.expiresAt).getTime();
        const nowMs = Date.now();
        const expired = expiresAtMs <= nowMs;
        const hasItems = (cart.sessionIds?.length ?? 0) > 0;
        console.log(
          `[CartRestorer] key=${key} items=${cart.sessionIds?.length ?? 0} expired=${expired} (expiresAt=${cart.expiresAt} now=${new Date(nowMs).toISOString()})`,
        );
        if (hasItems && !expired) {
          found = cart.semesterId;
          console.log("[CartRestorer] Valid cart found — semesterId:", found);
          break;
        }
      } catch {
        // Corrupt entry — skip
        console.warn(
          "[CartRestorer] Corrupt entry at key:",
          localStorage.key(i),
        );
      }
    }
    if (!found) {
      console.warn(
        "[CartRestorer] No valid cart found — will show empty state.",
      );
    }
    setSemesterId(found);
    setChecked(true);
  }, []);

  if (!checked) {
    // SSR / first paint — nothing yet
    return null;
  }

  if (!semesterId) {
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

  return (
    <CartProvider semesterId={semesterId}>
      <CartPageContent />
    </CartProvider>
  );
}
