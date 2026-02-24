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
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cart: CartState = JSON.parse(raw);
        const valid =
          cart.items?.length > 0 &&
          new Date(cart.expiresAt).getTime() > Date.now();
        if (valid) {
          setHasCart(true);
          setReady(true);
          return;
        }
      }
    } catch {
      // ignore
    }
    // No valid cart — redirect
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
