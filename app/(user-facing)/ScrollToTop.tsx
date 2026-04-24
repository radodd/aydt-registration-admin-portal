"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Scrolls the window to the top whenever the route changes.
 * Next.js App Router resets scroll on Link navigation by default, but
 * programmatic router.push() calls and certain layout transitions can
 * leave the page scrolled mid-way. This component catches all cases.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
