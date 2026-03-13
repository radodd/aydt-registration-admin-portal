# Elavon Payment Gateway — Hosted Payments Redirect SDK (Quickstart)

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/redirect-sdk

**When to reference:** When setting up or debugging the basic HPP redirect flow — creating orders, payment sessions, and handling return/cancel URLs. Good reference for the minimal working integration pattern.

---

## Overview

Node.js quickstart sample code that demonstrates the minimal integration for Elavon's hosted payment redirect. AYDT's integration is already built from this pattern.

## Quick Start Steps

1. Download sample code
2. Configure `server.js` with `merchantAlias`, `secretKey`, `currencyCode` (default: `USD`)
3. `npm install`
4. `npm start`
5. Test at `http://localhost:3000`

## Server Requirements

- **HTTPS** mandatory
- **TLS 1.2** minimum

## Implementation Workflow

### Backend

**Step 1 — Create Order**
```
POST /orders
{
  "total": { "amount": "100.00", "currencyCode": "USD" },
  "customReference": "<your-batch-id>"
}
```
Returns `order.href` — needed for payment session.

**Step 2 — Create Payment Session**
```
POST /payment-sessions
{
  "order": "<order.href>",
  "hppType": "fullPageRedirect",
  "doCreateTransaction": true,
  "returnUrl": "https://yourdomain.com/return",
  "cancelUrl": "https://yourdomain.com/cancel"
}
```
Returns `paymentSession.url` — redirect user here.

**Step 3 — Redirect User**
Send user to `paymentSession.url`.

### Frontend

- **Order summary page** — shows cart, "Pay Now" button
- **Return page** — matches `returnUrl`; shown after successful payment
- **Cancel page** — matches `cancelUrl`; shown after abandoned payment

## Key Parameters

| Parameter | Value | Notes |
|---|---|---|
| `hppType` | `"fullPageRedirect"` | Full page redirect mode |
| `doCreateTransaction` | `true` | EPG handles the sale |
| `doCapture` | `true` (default) | Capture immediately; set `false` to get Hosted Card token for storage |

## Auth Format (Axios example)

```javascript
const auth = Buffer.from(`${merchantAlias}:${secretKey}`).toString('base64');
headers: { Authorization: `Basic ${auth}` }
```

## Sandbox Base URL

```
https://uat.api.converge.eu.elavonaws.com
```

## AYDT Implementation

- Order creation: `utils/payment/epg.ts` → `createEpgOrder()`
- Session creation: `utils/payment/epg.ts` → `createEpgPaymentSession()`
- Entry point: `app/actions/createEPGPaymentSession.ts`
