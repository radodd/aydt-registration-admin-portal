"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/app/providers/CartProvider";
import { CartDrawer } from "@/app/components/public/CartDrawer";

/**
 * Owns the cart drawer's open state for the preview landing page.
 *
 * Mirrors the live SemesterShell behavior (app/(user-facing)/semester/[id]/
 * SemesterPageContent.tsx): auto-open when an item is added, auto-close when the
 * cart empties. The preview landing page is a server component that previously
 * rendered a bare <CartDrawer />, whose isOpen defaulted to false — so adding
 * items to the cart never revealed the drawer.
 */
export function PreviewCartDrawer() {
  const { itemCount } = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    if (itemCount > prevCount.current) setDrawerOpen(true);
    if (itemCount === 0) setDrawerOpen(false);
    prevCount.current = itemCount;
  }, [itemCount]);

  return <CartDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />;
}
