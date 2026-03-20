"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const CART_KEY_PREFIX = "aydt_cart_";

function getCartCount(): number {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CART_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (new Date(data.expiresAt).getTime() > Date.now()) {
        return data.sessionIds?.length ?? 0;
      }
    }
  } catch {}
  return 0;
}

export function NavCartButton() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(getCartCount());

    const refresh = () => setCount(getCartCount());
    window.addEventListener("storage", refresh);
    window.addEventListener("aydt-cart-change", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("aydt-cart-change", refresh);
    };
  }, []);

  if (count === 0) return null;

  return (
    <Link href="/cart" className="cart-nav-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="9" cy="21" r="1"/>
        <circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      Cart
      <span className="cart-nav-badge">{count}</span>
    </Link>
  );
}
