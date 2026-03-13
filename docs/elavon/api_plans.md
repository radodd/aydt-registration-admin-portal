# Elavon API — Plans Resource

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference#tag/Plans

**When to reference:** When implementing gateway-managed recurring billing schedules. A Plan defines the billing amount and frequency; a [Subscription](./api_subscriptions.md) attaches a stored card to it.

> **AYDT note:** AYDT uses DIY cron-based installment charging rather than EPG Plans. Reference this doc if gateway-managed billing is ever needed in the future.

---

## Overview

A **Plan** defines a recurring billing schedule — an amount and interval that EPG charges automatically. Plans are applied to Shoppers via [Subscriptions](./api_subscriptions.md).

---

## Endpoints

| Operation | Method | Path | Status |
|---|---|---|---|
| Create | POST | `/plans` | 201 Created |
| Retrieve | GET | `/plans/{id}` | 200 OK |
| Update | POST | `/plans/{id}` | 200 OK |
| List | GET | `/plans` | 200 OK |
| Delete | DELETE | `/plans/{id}` | 204 No Content |

---

## Fields

### Read-only

| Field | Type | Description |
|---|---|---|
| `href` | URL | Plan resource URL (self link) |
| `id` | string | Resource ID assigned by EPG |
| `createdAt` | datetime | RFC3339 |
| `modifiedAt` | datetime | RFC3339 |
| `merchant` | URL | Merchant resource URL |
| `processorAccount` | URL | Processor account URL |

### Required on Create

| Field | Type | Description |
|---|---|---|
| `name` | string | Plan identifier/label |
| `billingInterval` | object | See below |
| `total` | object | See below |

### `billingInterval` Object

| Field | Type | Description |
|---|---|---|
| `timeUnit` | enum | `day`, `week`, `month`, `year` |
| `count` | integer (≥1) | Number of time units between bills |

### `total` Object

| Field | Type | Description |
|---|---|---|
| `amount` | string | Billing amount (e.g., `"150.00"`) |
| `currencyCode` | string | ISO 4217 (e.g., `"USD"`) |

### Optional

| Field | Type | Max | Description |
|---|---|---|---|
| `billCount` | integer | — | Total billing cycles; omit for indefinite |
| `initialTotal` | object | — | Discounted introductory amount |
| `initialTotalBillCount` | integer | — | How many cycles intro rate applies |
| `isSubscribable` | boolean | — | Allow new subscriptions (default: `true`) |
| `customReference` | string | 255 | Merchant-defined reference |
| `customFields` | object | 64/1024 | Arbitrary key-value pairs |
| `account` | URL | — | Account resource URL |

---

## Example: Create Plan

```json
POST /plans
{
  "name": "AYDT 3-Installment Plan",
  "billingInterval": { "timeUnit": "month", "count": 1 },
  "total": { "amount": "150.00", "currencyCode": "USD" },
  "billCount": 3
}
```

**Response (201):**
```json
{
  "id": "ry2t4kh4gkrk3h7vq9wx36794gvp",
  "href": "https://uat.api.converge.eu.elavonaws.com/plans/ry2t4kh4gkrk3h7vq9wx36794gvp",
  "name": "AYDT 3-Installment Plan",
  "billingInterval": { "timeUnit": "month", "count": 1 },
  "total": { "amount": "150.00", "currencyCode": "USD" },
  "billCount": 3
}
```

---

## Filtering

```
GET /plans?filter=customReference_eq_<value>
```

Supports operators: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `like`, `in`, `contains`, `is`, `isnot`.

---

## Notes

- Deleting a plan does not cancel active subscriptions already created from it
- Plans with `isSubscribable: false` reject new subscriptions but honor existing ones
- All amounts use string format with decimal separator (e.g., `"99.95"` not `9995`)
