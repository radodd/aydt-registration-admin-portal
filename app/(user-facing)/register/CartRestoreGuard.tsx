"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CartProvider } from "@/app/providers/CartProvider";
import type { CartState } from "@/types/public";

const STORAGE_KEY_PREFIX = "aydt_cart_";

interface CartRestoreGuardProps {
  semesterId: string;
  children: React.ReactNode;
}

/**
 * Verifies that there is a valid (non-expired) cart for the given semester
 * before rendering the registration flow. If there is no cart, redirects
 * the user back to the semester page.
 */
export function CartRestoreGuard({ semesterId, children }: CartRestoreGuardProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasCart, setHasCart] = useState(false);

  useEffect(() => {
    const key = `${STORAGE_KEY_PREFIX}${semesterId}`;
    console.log("[CartRestoreGuard] Checking localStorage for key:", key);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cart: CartState = JSON.parse(raw);
        const expired = new Date(cart.expiresAt).getTime() <= Date.now();
        const hasItems = (cart.items?.length ?? 0) > 0;
        console.log("[CartRestoreGuard] Cart found:", {
          semesterId: cart.semesterId,
          itemCount: cart.items?.length ?? 0,
          expired,
          expiresAt: cart.expiresAt,
        });
        if (hasItems && !expired) {
          console.log("[CartRestoreGuard] Cart is valid — allowing registration flow.");
          setHasCart(true);
          setReady(true);
          return;
        }
        console.warn("[CartRestoreGuard] Cart invalid. hasItems:", hasItems, "expired:", expired);
      } else {
        console.warn("[CartRestoreGuard] No cart found in localStorage for key:", key);
      }
    } catch (e) {
      console.error("[CartRestoreGuard] Failed to parse cart:", e);
    }
    // No valid cart — redirect
    console.log("[CartRestoreGuard] Redirecting to /semester/" + semesterId);
    router.replace(`/semester/${semesterId}`);
  }, [semesterId, router]);

  if (!ready) return null;

  if (!hasCart) return null;

  return (
    <CartProvider semesterId={semesterId}>
      {children}
    </CartProvider>
  );
}
