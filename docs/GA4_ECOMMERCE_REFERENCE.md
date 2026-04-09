# GA4 Ecommerce Reference — AYDT

Source articles:
- [GA4] Ecommerce in Google Analytics — support.google.com/analytics/answer/14430645
- [GA4] Set up ecommerce events — support.google.com/analytics/answer/12200568
- GA4 Ecommerce Measurement (developer guide) — developers.google.com/analytics/devguides/collection/ga4/ecommerce

---

## Key Concepts

### Event-level vs Item-level parameters

Parameters split into two scopes:

- **Event-level** — describes the overall transaction (total value, currency, transaction ID). Goes *outside* the `items` array.
- **Item-level** — describes an individual product/service. Goes *inside* the `items` array.

```javascript
// Illustrative structure
dataLayer.push({
  event: "purchase",
  // --- Event-level ---
  transaction_id: "BATCH_abc123",
  value: 450.00,
  currency: "USD",
  items: [
    {
      // --- Item-level ---
      item_id: "SESSION_456",
      item_name: "Ballet - Beginner (Tues 4pm)",
      price: 225.00,
      quantity: 1,
    }
  ]
});
```

### Why use pre-built GA4 events

Google automatically populates dimensions/metrics and performs calculations for the standard ecommerce events. **Do not create custom events** where a standard one exists — you'll lose automatic reporting in the Ecommerce purchases and Monetization overview reports.

### GTM vs gtag

AYDT uses GTM as the delivery layer. This means:
- Push to `window.dataLayer` — never call `gtag()` directly
- GTM reads the `dataLayer` and forwards to GA4, Google Ads, etc.
- New destinations (Clarity, Meta Pixel) can be added in the GTM console without code changes

---

## Standard GA4 Ecommerce Events (full list)

| Event | When to fire |
|---|---|
| `view_item_list` | User sees a list of products/services |
| `select_item` | User clicks an item in a list |
| `view_item` | User views an item detail page |
| `add_to_cart` | User adds item to cart |
| `view_cart` | User views the cart |
| `remove_from_cart` | User removes item from cart |
| `begin_checkout` | User starts the checkout process |
| `add_shipping_info` | User submits shipping info (n/a for digital) |
| `add_payment_info` | User submits payment method |
| `purchase` | Transaction completed successfully |
| `refund` | Full or partial refund issued |
| `view_promotion` | User sees a promotional banner/offer |
| `select_promotion` | User clicks a promotional banner/offer |

---

## AYDT Event Mapping

AYDT is not a traditional product store — it sells **class registrations**. Map the GA4 schema as follows:

| GA4 Concept | AYDT Equivalent |
|---|---|
| Product / Item | A single class session registration |
| Cart | `registration_batches` row with `status = 'pending'` |
| Purchase | `registration_batches` row with `status = 'confirmed'` |
| `transaction_id` | `registration_batches.id` |
| `value` | `registration_batches.grand_total` |
| `item_id` | Session ID (e.g., `session_registrations.session_id`) |
| `item_name` | Class + session descriptor (e.g., "Ballet - Beginner Tue 4pm") |
| `item_category` | Class discipline (e.g., "Ballet", "Hip Hop") |
| `item_variant` | Age group or level (e.g., "Beginner", "Ages 5-7") |
| `price` | Per-session cost |
| `quantity` | Always `1` (one dancer per session registration) |

---

## Events for Phases 1 & 2

These are the events to implement. Ordered by funnel stage.

### `registration_started`
Custom event (no GA4 standard equivalent). Fires when the user reaches the participant assignment step.

```javascript
dataLayer.push({
  event: "registration_started",
  semester_id: "<semester_id>",
});
```

### `add_to_cart`
Fires when a dancer is assigned to a class session.

```javascript
dataLayer.push({
  event: "add_to_cart",
  currency: "USD",
  value: 225.00,           // price of the session
  items: [{
    item_id: "session_456",
    item_name: "Ballet - Beginner (Tue 4pm)",
    item_category: "Ballet",
    item_variant: "Beginner",
    price: 225.00,
    quantity: 1,
  }]
});
```

### `view_cart`
Fires when the user lands on the cart/checkout review page.

```javascript
dataLayer.push({
  event: "view_cart",
  currency: "USD",
  value: 450.00,           // grand_total of all items
  items: [/* all items in cart */]
});
```

### `begin_checkout`
Fires when the user clicks "Confirm & Pay".

```javascript
dataLayer.push({
  event: "begin_checkout",
  currency: "USD",
  value: 450.00,
  items: [/* all items */]
});
```

### `add_payment_info`
Fires when the user is redirected to the EPG payment page (i.e., just before leaving the site).

```javascript
dataLayer.push({
  event: "add_payment_info",
  currency: "USD",
  value: 450.00,
  payment_type: "Credit Card",   // or "ACH" if stored ACH
  items: [/* all items */]
});
```

### `purchase`
The primary conversion event. Fires on the confirmation page **only when** `registration_batches.status === 'confirmed'` (not on page load — fire inside the batch polling callback).

```javascript
dataLayer.push({
  event: "purchase",
  transaction_id: "batch_abc123",    // REQUIRED — used for deduplication
  value: 450.00,                     // grand_total
  currency: "USD",
  payment_plan: "pay_in_full",       // custom param: payment_plan_type
  items: [
    {
      item_id: "session_456",
      item_name: "Ballet - Beginner (Tue 4pm)",
      item_category: "Ballet",
      item_variant: "Beginner",
      price: 225.00,
      quantity: 1,
    },
    // ...one entry per session registration
  ]
});
```

**Critical:** `transaction_id` is required and must be unique per batch. GA4 uses it to deduplicate — if the confirmation page is visited twice (e.g., user refreshes), the purchase is only counted once.

---

## Item Parameters Reference

| Parameter | Type | Notes |
|---|---|---|
| `item_id` | string | Required if `item_name` absent. Use session ID. |
| `item_name` | string | Required if `item_id` absent. Human-readable class name. |
| `price` | number | Per-unit price |
| `quantity` | number | Always `1` for AYDT |
| `item_category` | string | Dance discipline (Ballet, Hip Hop, etc.) |
| `item_category2–5` | string | Additional hierarchy levels (optional) |
| `item_variant` | string | Level or age group |
| `item_brand` | string | Not applicable for AYDT |
| `coupon` | string | Discount code if applicable |
| `discount` | number | Discount amount in currency |

Up to 200 items supported per event. Each item supports up to 27 custom parameters beyond the standard fields.

---

## Event Parameters Reference

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `transaction_id` | string | Yes (purchase) | Batch ID. Required for deduplication. |
| `value` | number | Recommended | Total value. Set `currency` whenever `value` is set. |
| `currency` | string | Recommended | ISO 4217 (e.g., `"USD"`) |
| `tax` | number | Optional | Not available in AYDT at this time |
| `shipping` | number | Optional | N/A |
| `coupon` | string | Optional | Event-level coupon code |

---

## Verification

Use **DebugView** in GA4 to verify events in real-time before reports populate (reports take 24–48 hours).

1. Enable debug mode in GTM (Preview mode automatically activates it)
2. Navigate to GA4 → Admin → DebugView
3. Complete a test registration flow
4. Confirm each funnel event appears with correct parameters

---

## Deduplication Note

From the Google docs: GA4 uses `transaction_id` to minimize duplicate `purchase` events. Always pass `registration_batches.id` as `transaction_id`. If a user refreshes the confirmation page after the batch is confirmed, the purchase event fires again — but GA4 will deduplicate based on the ID.

This is especially important for AYDT because the confirmation page polls for status asynchronously — the event fires inside the polling callback, not on page load, so accidental double-fires are already unlikely. But `transaction_id` is still required.
