# Elavon Payment Gateway — Hosted Payments Overview

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/hosted-payments-overview

**When to reference:** When working on the HPP checkout flow — creating payment sessions, configuring redirect/cancel URLs, or understanding PCI scope implications of the integration method.

---

## What It Is

Hosted integration methods process payments on Elavon's secure servers, eliminating the need for AYDT's servers to handle raw card data. This is how we achieve **PCI SAQ A** compliance (minimal scope).

## Integration Methods

### 1. Hosted Pages (what AYDT uses)

**Redirect Mode:**
- Shopper is moved from AYDT's server to an Elavon-hosted payment page
- Lowest code complexity
- Full PCI compliance handled by Elavon
- Shopper returns to `returnUrl` or `cancelUrl` after payment

**Lightbox Mode:**
- A modal window opens over AYDT's website
- Shopper stays on AYDT's domain visually
- Still hosted by Elavon — no card data on AYDT's servers
- No PCI Level 1 compliance required

### 2. Payment Links

- Generate a URL that can be emailed or embedded
- Shopper clicks → directed to Elavon hosted payment page
- Good for invoice-based or async payment collection

### 3. Hosted Fields (medium complexity)

- Individual payment input fields hosted by Elavon are embedded into AYDT's custom form
- Full design control over layout while maintaining PCI compliance
- More coding required than redirect/lightbox

## Configuration

Via the **Elavon merchant portal**:
- Customize payment page branding/appearance
- Configure shopper experience settings
- Manage additional data collection fields

## Key Benefits

- No PCI Level 1 compliance required for Hosted Pages or Hosted Fields
- Elavon handles all sensitive card data
- Flexible — low to medium coding complexity options

## How AYDT Uses It

AYDT uses **HPP Redirect** (`hppType: "fullPageRedirect"`). The flow:

1. Server creates an Order → creates a Payment Session
2. User is redirected to Elavon's HPP URL
3. User enters card details on Elavon's page
4. Elavon redirects back to `returnUrl` (success) or `cancelUrl` (abandoned)
5. Elavon sends a webhook to `/api/webhooks/epg` with authoritative transaction data

See [`api_transactions.md`](./api_transactions.md) and [`../EPG_PAYMENT_INTEGRATION.md`](../EPG_PAYMENT_INTEGRATION.md) for implementation details.
