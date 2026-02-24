"use client";

import { useCart } from "@/app/providers/CartProvider";

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function CartExpiryTimer() {
  const { secondsRemaining, itemCount } = useCart();

  if (itemCount === 0) return null;

  const isUrgent = secondsRemaining < 300; // < 5 min

  return (
    <span
      className={`text-xs font-medium ${
        isUrgent ? "text-red-600" : "text-amber-600"
      }`}
    >
      Cart expires in {fmt(secondsRemaining)}
    </span>
  );
}
