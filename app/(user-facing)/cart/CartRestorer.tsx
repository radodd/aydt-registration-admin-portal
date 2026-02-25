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
    console.log("[CartRestorer] Scanning localStorage for active cart. Total keys:", localStorage.length);
    let found: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;
      try {
        const cart: CartState = JSON.parse(localStorage.getItem(key)!);
        const expired = new Date(cart.expiresAt).getTime() <= Date.now();
        const hasItems = (cart.items?.length ?? 0) > 0;
        console.log("[CartRestorer] Found cart key:", key, "| semesterId:", cart.semesterId, "| items:", cart.items?.length ?? 0, "| expired:", expired);
        if (hasItems && !expired) {
          found = cart.semesterId;
          console.log("[CartRestorer] Valid cart found — semesterId:", found);
          break;
        }
      } catch {
        // Corrupt entry — skip
        console.warn("[CartRestorer] Corrupt entry at key:", localStorage.key(i));
      }
    }
    if (!found) {
      console.warn("[CartRestorer] No valid cart found — will show empty state.");
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
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Your cart is empty
        </h1>
        <p className="text-gray-500 mb-8">
          Browse available semesters to add sessions.
        </p>
        <Link
          href="/"
          className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
        >
          Browse Semesters
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
