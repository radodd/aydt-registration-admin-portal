declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export interface GaItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity: number;
}

/**
 * Push an event to the GTM dataLayer.
 * SSR-safe — no-ops on the server. No-ops if GTM is not loaded (NEXT_PUBLIC_GTM_ID not set).
 */
export function gaEvent(
  eventName: string,
  params: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...params });
}
