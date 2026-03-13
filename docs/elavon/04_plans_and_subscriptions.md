# Elavon Payment Gateway — Plans and Subscriptions

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/create-plans-and-subscriptions

**When to reference:** When implementing or configuring gateway-managed recurring billing. Also relevant for comparing against the DIY cron approach used by AYDT for installment payments.

---

## Overview

EPG can manage recurring billing automatically via **Plans** (billing logic) and **Subscriptions** (attaches a stored card to a plan). EPG then handles execution on the defined schedule.

**Ideal for:** SaaS/SaaP businesses, fixed recurring amounts, multi-installment payments.

> **AYDT approach:** AYDT uses a **DIY cron** (pg_cron → `chargeStoredPaymentInstallment`) rather than EPG Plans/Subscriptions, because AYDT's installment schedule is already computed and stored in `batch_payment_installments`. EPG Plans/Subscriptions would require duplicating that schedule in the gateway. Reference this doc if gateway-managed billing is ever needed.

---

## Step 1 — Create a Plan

**Endpoint:** `POST /plans`

### Required Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Plan identifier |
| `billingInterval.timeUnit` | enum | `day`, `week`, `month`, `year` |
| `billingInterval.count` | integer (≥1) | Number of time units between bills |
| `total.amount` | string | Billing amount (e.g., `"5.00"`) |
| `total.currencyCode` | string | ISO 4217 (e.g., `"USD"`) |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `billCount` | integer | Total billing cycles (including intro); omit for indefinite |
| `initialTotal.amount` | string | Discounted first payment amount |
| `initialTotalBillCount` | integer | How many times intro rate applies |
| `isSubscribable` | boolean | Enable/disable new subscriptions (default: `true`) |

### Example Request

```json
POST /plans
{
  "name": "Monthly Software License",
  "billingInterval": { "timeUnit": "month", "count": 1 },
  "total": { "amount": "5.00", "currencyCode": "USD" },
  "billCount": 12,
  "initialTotal": { "amount": "2.50", "currencyCode": "USD" },
  "initialTotalBillCount": 1
}
```

### Response

```json
{
  "id": "ry2t4kh4gkrk3h7vq9wx36794gvp",
  "href": "https://uat.api.converge.eu.elavonaws.com/plans/ry2t4kh4gkrk3h7vq9wx36794gvp",
  ...
}
```

Save `href` — needed when creating a subscription.

---

## Step 2 — Create a Subscription

**Endpoint:** `POST /subscriptions`

### Required Fields

| Field | Type | Description |
|---|---|---|
| `plan` | URL | Plan resource URL from Step 1 |
| `timeZoneId` | string | IANA timezone (e.g., `"America/New_York"`) |
| `firstBillAt` | date | Initial billing date (e.g., `"2024-04-22"`) |
| `storedCard` OR `storedAchPayment` | URL | Stored payment method resource URL |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `doSendReceipt` | boolean | Email receipt on each charge |
| `billCount` | integer | Override plan's cycle count |
| `surchargeAdvice` | URL | Surcharge resource |

### Example Request

```json
POST /subscriptions
{
  "plan": "https://uat.api.converge.eu.elavonaws.com/plans/ry2t4kh4gkrk3h7vq9wx36794gvp",
  "storedCard": "https://uat.api.converge.eu.elavonaws.com/stored-cards/g9fw9kg2fjfcdm62rb2f38cqmx9m",
  "timeZoneId": "America/New_York",
  "firstBillAt": "2024-04-22",
  "doSendReceipt": true
}
```

### Response Key Fields

| Field | Description |
|---|---|
| `id` | Subscription identifier |
| `href` | Subscription resource URL |
| `state` | `active`, `canceled`, etc. |
| `nextBillAt` | Next scheduled billing date |

---

## Merchant Portal Alternative

Plans and subscriptions can also be created via the Elavon merchant portal:

**Plans:** Recurring → Plans → New Plan
**Subscriptions:** Recurring → Subscriptions → New Subscription (requires stored card to exist first)

---

## Prerequisites

A `storedCard` or `storedAchPayment` resource must exist before creating a subscription.
See [`api_stored_cards.md`](./api_stored_cards.md) and [`api_stored_ach.md`](./api_stored_ach.md).
