# Elavon API — Transactions (CreateTransaction)

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference#tag/Transactions/operation/CreateTransaction

**When to reference:** When making a **server-to-server charge** against a stored card or stored ACH payment — specifically for charging installment payments without redirecting the user to HPP. Also reference when implementing void or refund logic.

---

## Overview

`POST /transactions` creates a payment transaction directly from the server — no user redirect needed. Used by AYDT to charge installment payments against stored cards/ACH after the initial checkout.

**Transaction types:**
- **Sale** — Authorizes and captures payment
- **Void** — Reverses an unsettled transaction
- **Refund** — Returns funds for a settled transaction

> **Important:** EPG returns HTTP `201` even if the transaction is **declined**. Always check the `state` field — `201` only means the request was processed, not that it was approved.

---

## Endpoint

```
POST /transactions
```

**Auth:** HTTP Basic — `base64(merchantAlias:secretKey)` (secret key required — never public key)

---

## Request Fields

### Payment Method (one of)

| Field | Type | Description |
|---|---|---|
| `storedCard` | URL | Stored Card resource URL — use for card-on-file charges |
| `storedAchPayment` | URL | Stored ACH Payment resource URL — use for ACH charges |
| `hostedCard` | URL | One-time hosted card token from HPP session |
| `card` | object | Raw card data (increases PCI scope — avoid) |

### Amount

| Field | Type | Required | Description |
|---|---|---|---|
| `total.amount` | string | Yes | e.g., `"150.00"` |
| `total.currencyCode` | string | Yes | ISO 4217 e.g., `"USD"` |

### Other Fields

| Field | Type | Description |
|---|---|---|
| `shopper` | URL | Shopper resource URL (recommended when using stored card) |
| `customReference` | string (max 255) | Merchant-defined idempotency key — use installment ID |
| `description` | string | Transaction description |
| `doCapture` | boolean | `true` = sale (default); `false` = auth only |
| `account` | URL | Account resource URL (optional) |
| `customFields` | object | Arbitrary key-value pairs |

---

## Example: Charge Stored Card

```json
POST /transactions
{
  "storedCard": "https://uat.api.converge.eu.elavonaws.com/stored-cards/sp7phA5h2but7UsonlpA52ij",
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "total": { "amount": "150.00", "currencyCode": "USD" },
  "customReference": "installment_<batch_payment_installment_id>",
  "description": "AYDT Tuition — Installment 2 of 3"
}
```

## Example: Charge Stored ACH

```json
POST /transactions
{
  "storedAchPayment": "https://uat.api.converge.eu.elavonaws.com/stored-ach-payments/abc123xyz",
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "total": { "amount": "150.00", "currencyCode": "USD" },
  "customReference": "installment_<batch_payment_installment_id>"
}
```

---

## Response Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Transaction ID — store in `batch_payment_installments.transaction_id` |
| `href` | URL | Transaction resource URL |
| `state` | string | `authorized`, `declined`, `authorizationPending` — **always check this** |
| `isAuthorized` | boolean | `true` only if fully approved |
| `failures` | array | Decline reason(s) if `state = "declined"` |
| `total.amount` | string | Processed amount |
| `card.maskedNumber` | string | Masked card number |
| `card.last4` | string | Last 4 digits |
| `card.scheme` | string | Card brand |
| `authorizationCode` | string | Issuer authorization code |
| `createdAt` | datetime | RFC3339 |

### `failures` Object

```json
{
  "code": "doNotHonor",
  "description": "Transaction declined by issuer"
}
```

---

## State Values

| State | Meaning |
|---|---|
| `authorized` | Approved — mark installment as `paid` |
| `captured` | Captured (if auth-only flow) |
| `settled` | Settled in batch |
| `declined` | Declined — increment `charge_attempt_count`, log error |
| `authorizationPending` | Processing — poll for result |

---

## AYDT Usage

- Called by `chargeStoredPaymentInstallment()` server action
- `customReference` = `batch_payment_installments.id` (idempotency)
- On success: `batch_payment_installments.status = 'paid'`, store `transaction_id`
- On decline: increment `charge_attempt_count`, store `last_charge_error`
- After 3 failures: mark `status = 'failed'`, trigger admin notification
- Function: `createEpgTransaction()` in `utils/payment/epg.ts`
