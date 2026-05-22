"use client";

import { useEffect, useState } from "react";
import { CartProvider } from "@/app/providers/CartProvider";
import { CartPageContent, CartSkeleton, EmptyCart } from "./CartPageContent";
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
        const hasItems = (cart.items?.length ?? 0) > 0;
        console.log(
          `[CartRestorer] key=${key} items=${cart.items?.length ?? 0} expired=${expired} (expiresAt=${cart.expiresAt} now=${new Date(nowMs).toISOString()})`,
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
    // SSR / first paint — show the skeleton while we scan localStorage
    return <CartSkeleton />;
  }

  if (!semesterId) {
    return <EmptyCart />;
  }

  return (
    <CartProvider semesterId={semesterId}>
      <CartPageContent />
    </CartProvider>
  );
}
