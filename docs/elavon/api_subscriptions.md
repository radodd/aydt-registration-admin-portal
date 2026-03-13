# Elavon API — Subscriptions Resource

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference#tag/Subscriptions

**When to reference:** When attaching a stored payment method to a recurring billing plan. A Subscription = Plan + Stored Card/ACH, causing EPG to auto-charge on the plan's schedule.

> **AYDT note:** AYDT uses DIY cron-based installment charging rather than EPG Subscriptions. Reference this doc if gateway-managed recurring billing is ever needed.

---

## Overview

A **Subscription** applies a [Plan](./api_plans.md) to a Shopper's Stored Card (or Stored ACH Payment), triggering automatic recurring charges as defined by the plan's billing interval.

**Prerequisites:**
1. A [Plan](./api_plans.md) must exist
2. A [Shopper](./api_shoppers.md) must exist
3. A [Stored Card](./api_stored_cards.md) or [Stored ACH Payment](./api_stored_ach.md) must exist under that Shopper

---

## Endpoints

| Operation | Method | Path | Status |
|---|---|---|---|
| Create | POST | `/subscriptions` | 201 Created |
| Retrieve | GET | `/subscriptions/{id}` | 200 OK |
| Update | POST | `/subscriptions/{id}` | 200 OK |
| List | GET | `/subscriptions` | 200 OK |

> Subscriptions **cannot be deleted** via the API — cancel by updating the `state`.

---

## Fields

### Read-only

| Field | Type | Description |
|---|---|---|
| `href` | URL | Subscription resource URL (self link) |
| `id` | string | Resource ID assigned by EPG |
| `createdAt` | datetime | RFC3339 |
| `modifiedAt` | datetime | RFC3339 |
| `merchant` | URL | Merchant resource URL |
| `state` | string | `active`, `canceled`, `completed`, etc. |
| `nextBillAt` | date | Next scheduled billing date |
| `surcharge` | object | Surcharge details |

### Required on Create

| Field | Type | Description |
|---|---|---|
| `plan` | URL | Plan resource URL |
| `timeZoneId` | string | IANA timezone (e.g., `"America/New_York"`) |
| `firstBillAt` | date | First billing date (e.g., `"2024-04-22"`) |
| `storedCard` OR `storedAchPayment` | URL | Payment method resource URL |

### Optional

| Field | Type | Max | Description |
|---|---|---|---|
| `shopper` | URL | — | Shopper resource URL |
| `doSendReceipt` | boolean | — | Send email receipt per transaction |
| `billCount` | integer | — | Override plan's cycle count |
| `surchargeAdvice` | URL | — | Surcharge resource for recurring bills |
| `initialSurchargeAdvice` | URL | — | Surcharge resource for first bill only |
| `customReference` | string | 255 | Merchant-defined reference |
| `customFields` | object | 64/1024 | Arbitrary key-value pairs |
| `processorAccount` | URL | — | Processor account resource URL |

---

## Example: Create Subscription

```json
POST /subscriptions
{
  "plan": "https://uat.api.converge.eu.elavonaws.com/plans/ry2t4kh4gkrk3h7vq9wx36794gvp",
  "storedCard": "https://uat.api.converge.eu.elavonaws.com/stored-cards/sp7phA5h2but7UsonlpA52ij",
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "timeZoneId": "America/New_York",
  "firstBillAt": "2024-04-22",
  "doSendReceipt": true
}
```

**Response (201):**
```json
{
  "id": "sub_xyz789",
  "href": "https://uat.api.converge.eu.elavonaws.com/subscriptions/sub_xyz789",
  "state": "active",
  "nextBillAt": "2024-04-22",
  "plan": "https://uat.api.converge.eu.elavonaws.com/plans/ry2t4kh4gkrk3h7vq9wx36794gvp",
  "storedCard": "https://uat.api.converge.eu.elavonaws.com/stored-cards/sp7phA5h2but7UsonlpA52ij"
}
```

---

## Subscription States

| State | Meaning |
|---|---|
| `active` | Billing is running |
| `canceled` | Stopped; no future charges |
| `completed` | All billing cycles finished |
| `suspended` | Paused (payment failure) |

---

## Notes

- EPG generates a transaction per billing cycle and can send a receipt email if `doSendReceipt: true`
- `doSendReceipt` controls receipts for all subscription-generated transactions
- Custom fields support merchant-side tracking without impacting EPG billing logic
- Surcharge fields are relevant for North American merchants with surcharge enabled on their account
