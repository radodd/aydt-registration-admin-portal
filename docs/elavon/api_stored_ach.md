# Elavon API — Stored ACH Payments Resource

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference#tag/Stored-ACH-Payments

**When to reference:** When implementing ACH (bank transfer/direct debit) payment storage and recurring ACH charges. ACH is a separate resource from Stored Cards but follows the same Shopper-parent pattern.

---

## Overview

A **Stored ACH Payment** is a persistent bank account record (routing + account number) stored in EPG as a child of a [Shopper](./api_shoppers.md). It enables recurring ACH debits without re-entering banking credentials.

**Key uses:**
- Store a customer's bank account for recurring installment payments
- Server-to-server ACH charges via `POST /transactions`
- Gateway-managed recurring billing via Subscriptions

---

## Endpoints

| Operation | Method | Path | Status |
|---|---|---|---|
| Create | POST | `/stored-ach-payments` | 201 Created |
| Retrieve | GET | `/stored-ach-payments/{id}` | 200 OK |
| Update | POST | `/stored-ach-payments/{id}` | 200 OK |
| List | GET | `/stored-ach-payments` | 200 OK |
| Delete | DELETE | `/stored-ach-payments/{id}` | 204 No Content |

---

## Fields

### Read-only

| Field | Type | Description |
|---|---|---|
| `href` | URL | Stored ACH Payment resource URL (self link) |
| `id` | string | Resource ID assigned by EPG |
| `createdAt` | datetime | RFC3339 |
| `modifiedAt` | datetime | RFC3339 |
| `last4` | string | Last 4 digits of account number (masked) |
| `achFingerprint` | string | Unique identifier for the bank account |

### Required on Create

| Field | Type | Description |
|---|---|---|
| `shopper` | URL | Parent Shopper resource URL |
| `hostedAchPayment` | URL | One-time Hosted ACH Payment token from HPP session |

> Similar to Stored Cards — pass the `hostedAchPayment` href from the HPP session result rather than raw bank details.

### Core Fields

| Field | Type | Description |
|---|---|---|
| `bankRoutingNumber` | string | 9-digit ABA routing number (write-only) |
| `bankAccountNumber` | string | 5–16 digit account number (write-only) |
| `achAccountType` | enum | `savingsPersonal`, `checkingPersonal`, `checkingBusiness` |
| `accountName` | string | Display name for the account |
| `customReference` | string (max 255) | Merchant-defined reference |
| `customFields` | object | Arbitrary key-value pairs |

---

## Example: Create from Hosted ACH Payment Token

```json
POST /stored-ach-payments
{
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "hostedAchPayment": "https://uat.api.converge.eu.elavonaws.com/hosted-ach-payments/<token>",
  "customReference": "batch_<registration-batch-id>"
}
```

**Response (201):**
```json
{
  "href": "https://uat.api.converge.eu.elavonaws.com/stored-ach-payments/abc123xyz",
  "id": "abc123xyz",
  "shopper": "https://uat.api.converge.eu.elavonaws.com/shoppers/6xxFwvM8BqmM6T6DcF3DyTB3",
  "last4": "6789",
  "achAccountType": "checkingPersonal",
  "accountName": "Jane Smith"
}
```

---

## How to Get a Hosted ACH Payment Token

The HPP session must be configured to accept ACH. After the user completes ACH entry on the HPP:
- The session result will contain a `hostedAchPayment` resource URL
- Pass that URL to `POST /stored-ach-payments` along with the shopper href
- The Hosted ACH Payment is **single-use** — this call produces the reusable Stored ACH Payment

---

## AYDT Usage

- Created in webhook handler after a successful ACH HPP session when `paymentPlanType = 'installments'`
- `customReference` = `registration_batch_id`
- EPG Stored ACH ID + href + last4 + account type persisted to `stored_payment_methods` table (`type = 'ach'`)
- Functions: `createEpgStoredAchPayment()` in `utils/payment/epg.ts`
- Used by `chargeStoredPaymentInstallment()` for server-to-server ACH debits
