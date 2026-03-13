# Elavon API — Stored Cards Resource

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference#tag/Stored-Cards

**When to reference:** When storing a card on file after HPP checkout, or when charging a previously stored card via a server-to-server transaction. Stored Cards are the persistent, reusable representation of a customer's card.

---

## Overview

A **Stored Card** is a persistent, reusable card record stored in EPG, always as a child of a [Shopper](./api_shoppers.md). It is created by attaching a one-time **Hosted Card** token (returned from a payment session with `doCapture: false`) to a Shopper.

**Key uses:**
- Charge returning customers without re-entering card data
- Required for EPG-managed subscriptions (Plans/Subscriptions)
- Required for DIY recurring billing (server-to-server `POST /transactions`)

---

## Endpoints

| Operation | Method | Path | Status |
|---|---|---|---|
| Create | POST | `/stored-cards` | 201 Created |
| Retrieve | GET | `/stored-cards/{id}` | 200 OK |
| Update | POST | `/stored-cards/{id}` | 200 OK |
| Delete | DELETE | `/stored-cards/{id}` | 204 No Content |

---

## Fields

### Read-only

| Field | Type | Description |
|---|---|---|
| `href` | URL | Stored Card resource URL (self link) |
| `id` | string | Resource ID assigned by EPG |
| `createdAt` | datetime | RFC3339 |
| `modifiedAt` | datetime | RFC3339 |
| `merchant` | URL | Merchant resource URL (suppressed with public key) |
| `card.maskedNumber` | string | e.g., `"XXXX XXXX XXXX 4242"` |
| `card.last4` | string | Last 4 digits |
| `card.bin` | string | Bank identification number |
| `card.scheme` | string | `Visa`, `Mastercard`, `Amex`, etc. |
| `card.brand` | string | Card brand identifier |
| `card.fundingSource` | string | `credit`, `debit`, etc. |

### Required on Create

| Field | Type | Description |
|---|---|---|
| `shopper` | URL | Parent Shopper resource URL |
| `hostedCard` | URL | One-time Hosted Card token from HPP session |

> When creating from an HPP session result, pass the `hostedCard` href instead of raw card details.

### Optional on Create

| Field | Type | Max | Description |
|---|---|---|---|
| `shopperInteraction` | enum | — | `ecommerce`, `moto`, `recurring`, `installment` |
| `credentialOnFileType` | enum | — | `none`, `recurring`, `subscription`, `unscheduled` |
| `customReference` | string | 255 | Merchant-defined reference |
| `customFields` | object | 64/1024 | Arbitrary key-value pairs |

### `credentialOnFileType` Values

| Value | Meaning |
|---|---|
| `none` | Not a stored credential |
| `recurring` | Series of scheduled transactions with variable amounts |
| `subscription` | Fixed-amount recurring payments |
| `unscheduled` | One-time transactions using stored credentials |

---

## Example: Create from Hosted Card Token

```json
POST /stored-cards
{
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "hostedCard": "https://uat.api.converge.eu.elavonaws.com/hosted-cards/<token>",
  "shopperInteraction": "ecommerce",
  "credentialOnFileType": "recurring",
  "customReference": "batch_<registration-batch-id>"
}
```

**Response (201):**
```json
{
  "href": "https://uat.api.converge.eu.elavonaws.com/stored-cards/sp7phA5h2but7UsonlpA52ij",
  "id": "sp7phA5h2but7UsonlpA52ij",
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "card": {
    "maskedNumber": "XXXX XXXX XXXX 4242",
    "last4": "4242",
    "scheme": "Visa",
    "expirationMonth": 12,
    "expirationYear": 2025
  },
  "credentialOnFileType": "recurring"
}
```

---

## How to Get a Hosted Card Token

Set `doCapture: false` in the payment session creation. After the user completes the HPP:
- The session result will contain a `hostedCard` resource URL
- Pass that URL to `POST /stored-cards` along with the shopper href
- The Hosted Card is **single-use** — it becomes a reusable Stored Card after this call

---

## AYDT Usage

- Created in webhook handler after `saleAuthorized` event when `paymentPlanType = 'installments'`
- `customReference` = `registration_batch_id`
- `credentialOnFileType` = `"recurring"` (installment schedule, variable amounts)
- EPG Stored Card ID + href + masked number + scheme persisted to `stored_payment_methods` table
- Functions: `createEpgStoredCard()` in `utils/payment/epg.ts`
- Used later by `chargeStoredPaymentInstallment()` for server-to-server charges
