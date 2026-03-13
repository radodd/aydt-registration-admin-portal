# Elavon API — Shoppers Resource

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference#tag/Shoppers

**When to reference:** When creating or managing Shopper records — required before you can attach a Stored Card or Stored ACH Payment. A Shopper represents a customer/cardholder identity in EPG.

---

## Overview

A **Shopper** is a collection of stored customer information in EPG. Shoppers are the parent resource for stored payment methods. You must create a Shopper before you can attach a Stored Card or Stored ACH Payment.

**Key uses:**
- Store customer contact/billing data for pre-populating checkout forms
- Parent resource for `storedCards` and `storedAchPayments`
- Required for subscription-based recurring billing

---

## Endpoints

| Operation | Method | Path | Status |
|---|---|---|---|
| Create | POST | `/shoppers` | 201 Created |
| Retrieve | GET | `/shoppers/{id}` | 200 OK |
| List | GET | `/shoppers` | 200 OK |
| Update | POST | `/shoppers/{id}` | 200 OK |
| Delete | DELETE | `/shoppers/{id}` | 204 No Content |

---

## Fields

### Read-only (server-assigned)

| Field | Type | Description |
|---|---|---|
| `href` | URL | Shopper resource URL (self link) |
| `id` | string | Resource ID assigned by EPG |
| `createdAt` | datetime | RFC3339 creation timestamp |
| `modifiedAt` | datetime | RFC3339 last modification timestamp |
| `merchant` | URL | Associated merchant resource URL |

### Writable

| Field | Type | Max | Description |
|---|---|---|---|
| `fullName` | string | 255 | Shopper's full name |
| `company` | string | 255 | Company name |
| `primaryPhone` | string | — | Primary phone number |
| `alternatePhone` | string | — | Alternate phone number |
| `email` | string | — | Email address |
| `billTo` | Contact | — | Billing address (see Contact object below) |
| `shipTo` | Contact | — | Shipping address |
| `customReference` | string | 255 | Merchant-defined reference (use AYDT `user_id`) |
| `customFields` | object | 64/1024 | Arbitrary key-value pairs |

### Related Resources (read-only links)

| Field | Description |
|---|---|
| `storedCards` | Array of associated Stored Card resources |
| `defaultStoredCard` | Default Stored Card URL |
| `defaultStoredAchPayment` | Default Stored ACH Payment URL |
| `subscriptions` | Associated Subscription resources |

### Contact Object

```json
{
  "fullName": "Jane Smith",
  "street1": "123 Main St",
  "street2": "",
  "city": "Atlanta",
  "region": "GA",
  "postalCode": "30301",
  "countryCode": "USA"
}
```

> `countryCode` is ISO 3166-1 Alpha-3 (3 letters). `postalCode` required for UK merchants.

---

## Filtering

```
GET /shoppers?filter=customReference_eq_<userId>
```

---

## Example: Create Shopper

```json
POST /shoppers
{
  "fullName": "Jane Smith",
  "email": "jane@example.com",
  "customReference": "user_<supabase-user-id>"
}
```

**Response (201):**
```json
{
  "href": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "id": "6xxFwvM8BqmM6T6DcF3DyTB3",
  "createdAt": "2024-01-15T10:30:45.123Z",
  "merchant": "...",
  "fullName": "Jane Smith",
  "email": "jane@example.com",
  "customReference": "user_abc123",
  "storedCards": []
}
```

---

## AYDT Usage

- Created in webhook handler after a successful HPP payment when a payment plan is used
- `customReference` = Supabase `user_id`
- EPG Shopper ID + href persisted to `shoppers` table in AYDT DB
- Functions: `createEpgShopper()`, `fetchEpgShopper()` in `utils/payment/epg.ts`
