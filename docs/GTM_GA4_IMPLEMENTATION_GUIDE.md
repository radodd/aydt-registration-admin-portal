# GTM + GA4 Implementation Guide
## Reusable playbook for Next.js App Router projects

---

## Prerequisites

Before writing any code you need:
- **GTM Container ID** — format `GTM-XXXXXXX`. Created at tagmanager.google.com.
- **GA4 Measurement ID** — format `G-XXXXXXX`. Found in GA4 → Admin → Data Streams → your web stream.

---

## Step 1 — Analytics utility

Create `utils/analytics.ts`. This is the only file the rest of the app talks to.

```typescript
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
 * - SSR-safe: no-ops on the server
 * - No-ops if GTM is not loaded (env var not set)
 * - All analytics destinations (GA4, Google Ads, Clarity, etc.) are wired
 *   in the GTM console — this file never changes when destinations change
 */
export function gaEvent(
  eventName: string,
  params: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...params });
}
```

**Why this pattern:**
- App only calls `gaEvent()` — never `gtag()` or `window.gtag()` directly
- GTM reads the `dataLayer` and routes to GA4, Google Ads, etc.
- Adding or removing analytics destinations requires zero code changes

---

## Step 2 — GTM snippet in root layout

In `app/layout.tsx`:

```tsx
import Script from "next/script";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* noscript fallback — must be first child of body */}
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}

        {children}

        {/* GTM bootstrap — afterInteractive loads after hydration */}
        {GTM_ID && (
          <Script
            id="gtm"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        )}
      </body>
    </html>
  );
}
```

**Key decisions:**
- `strategy="afterInteractive"` — loads after the page is interactive, does not block render
- Entire snippet is gated on `GTM_ID` — safe to deploy before you have a container ID
- `dangerouslySetInnerHTML` is safe here because `GTM_ID` is a build-time env var, not user input

---

## Step 3 — Environment variable

In `.env.local`:
```
# Google Tag Manager container ID (e.g. GTM-XXXXXXX)
# Leave blank to disable all analytics locally
NEXT_PUBLIC_GTM_ID=
```

In production (Vercel / hosting platform), set `NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX`.

---

## Step 4 — Fire events in components

### Pattern for any client component

```typescript
"use client";
import { useEffect, useRef } from "react";
import { gaEvent } from "@/utils/analytics";

// Always use useRef to prevent double-firing in React Strict Mode
const firedRef = useRef(false);

useEffect(() => {
  if (firedRef.current) return;
  firedRef.current = true;
  gaEvent("event_name", { param: "value" });
}, [dependency]);
```

### Pattern for user-initiated events (button clicks, etc.)

```typescript
function handleClick() {
  gaEvent("event_name", { param: "value" });
  // ... rest of handler
}
```

**Rules:**
- Always declare variables before the `useEffect` that references them (avoids temporal dead zone errors)
- Use `useRef` guard on any `useEffect`-based event to prevent duplicate fires
- For events that fire just before a redirect (e.g. to a payment page), fire the event synchronously in the handler before the redirect — `dataLayer.push()` is synchronous, GTM processes it before the page unloads

---

## Step 5 — GA4 ecommerce events reference

Events fire in funnel order. Push to `dataLayer` — GTM forwards to GA4.

```typescript
// 1. User views a list of products/services
gaEvent("view_item_list", {
  item_list_name: "Summer Classes",
  items: [{ item_id: "s1", item_name: "Ballet Beginner", price: 225, quantity: 1 }]
});

// 2. User adds item to cart
gaEvent("add_to_cart", {
  currency: "USD",
  value: 225.00,
  items: [{ item_id: "s1", item_name: "Ballet Beginner", price: 225, quantity: 1 }]
});

// 3. User views cart
gaEvent("view_cart", {
  currency: "USD",
  value: 450.00,    // total of all items
  items: [/* all cart items */]
});

// 4. User starts checkout
gaEvent("begin_checkout", {
  currency: "USD",
  value: 450.00,
  items: [/* all cart items */]
});

// 5. User submits payment info
gaEvent("add_payment_info", {
  currency: "USD",
  value: 450.00,
  payment_type: "Credit Card",
  items: [/* all cart items */]
});

// 6. Purchase confirmed — THE conversion event
gaEvent("purchase", {
  transaction_id: "ORDER_123",   // unique ID — GA4 uses this for deduplication
  value: 450.00,
  currency: "USD",
  items: [/* all purchased items */]
});
```

**Item object shape:**
```typescript
{
  item_id: string,          // required if item_name absent
  item_name: string,        // required if item_id absent
  price: number,            // in dollars, not cents
  quantity: number,
  item_category?: string,   // e.g. "Ballet", "Electronics"
  item_variant?: string,    // e.g. "Beginner", "Red / Large"
  coupon?: string,
  discount?: number,
}
```

**Price units:** GA4 expects dollars (not cents). If your DB stores prices in cents, divide by 100 before pushing.

---

## Step 6 — GTM console setup

Do this in order: **Variables → Triggers → Tags**

### Variables (User-Defined Variables → New)

| Name | Type | Key |
|---|---|---|
| `DLV - currency` | Data Layer Variable | `currency` |
| `DLV - value` | Data Layer Variable | `value` |
| `DLV - items` | Data Layer Variable | `items` |
| `DLV - transaction_id` | Data Layer Variable | `transaction_id` |

Add more Data Layer Variables for any custom params you push (e.g. `payment_type`, `payment_plan`).

### Triggers (Triggers → New → Custom Event)

One trigger per event name. "Use regex matching" off.

| Trigger name | Event name field |
|---|---|
| `CE - view_cart` | `view_cart` |
| `CE - begin_checkout` | `begin_checkout` |
| `CE - add_payment_info` | `add_payment_info` |
| `CE - purchase` | `purchase` |

### Tags (Tags → New)

**GA4 Configuration tag** — fires on All Pages:
- Type: Google Analytics: GA4 Configuration
- Measurement ID: `G-XXXXXXX` (paste directly, or use a Constant variable)
- Trigger: All Pages

**GA4 Event tags** — one per event:
- Type: Google Analytics: GA4 Event
- Configuration Tag: select your GA4 Configuration tag
- Event Name: matches the `event` key (e.g. `purchase`)
- Event Parameters: map each param to its DLV variable

Example for `purchase`:
| Parameter | Value |
|---|---|
| `transaction_id` | `{{DLV - transaction_id}}` |
| `value` | `{{DLV - value}}` |
| `currency` | `{{DLV - currency}}` |
| `items` | `{{DLV - items}}` |

---

## Step 7 — Test before publishing

1. **GTM Preview mode** — click Preview in GTM, enter your site URL
2. Walk through your conversion funnel
3. In the GTM debug panel, confirm each event fires with correct variable values
4. In **GA4 → Admin → DebugView**, confirm events arrive in real-time with correct parameters
5. **Submit/Publish** the GTM container — nothing goes live until you publish

---

## Third-party tools via GTM (zero code changes)

Once GTM is installed, these can be added entirely from the GTM console:

| Tool | How |
|---|---|
| **Microsoft Clarity** | GTM community template — session recordings + heatmaps |
| **Google Ads conversion tracking** | New GA4 Event tag with conversion action |
| **Meta Pixel** | Custom HTML tag or community template |
| **A/B testing tools** | Tag-level configuration |

---

## Notes on off-site payment redirects (e.g. Stripe, Elavon EPG)

When your checkout redirects users off-site to a hosted payment page, the browser session is interrupted. This affects attribution.

**Mitigation:** Fire the `purchase` event on your confirmation/thank-you page, not inside the payment iframe. Use server-verified order status (poll an API or check DB) so the event only fires when payment is actually confirmed, not just on page load. Pass `transaction_id` — GA4 deduplicates on it, so if the user refreshes, the purchase is counted once.

For highest accuracy, use Enhanced Conversions (Phase 3) to pass hashed email — Google uses it to stitch the conversion back to the original ad click across session breaks.
