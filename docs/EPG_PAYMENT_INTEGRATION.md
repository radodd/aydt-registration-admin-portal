# EPG Payment Integration — Development Reference

Elavon Payment Gateway (EPG) REST API integration for AYDT registration platform.
This document reflects the current implementation as of 2026-03-12 (last updated 2026-03-12).

---

## Implementation Status

| Step | File / Action                                                              | Status         |
| ---- | -------------------------------------------------------------------------- | -------------- |
| 1    | `docs/EPG_PAYMENT_INTEGRATION.md` — this file                              | ✅ Done        |
| 2    | `supabase/migrations/20260302000000_baseline.sql` — `payments` table DDL   | ✅ In baseline |
| 2b   | `supabase/migrations/20260302000001_payments_unique_reference.sql`         | ✅ Done        |
| 3    | `utils/payment/epg.ts` — EPG REST client                                   | ✅ Done        |
| 4    | `app/actions/createEPGPaymentSession.ts` — server action                   | ✅ Done        |
| 5    | `app/api/webhooks/epg/route.ts` — webhook handler                          | ✅ Done        |
| 6    | `app/api/register/batch-status/route.ts` — polling endpoint                | ✅ Done        |
| 7    | `app/(user-facing)/register/payment/page.tsx` — uses EPG action            | ✅ Done        |
| 8    | `app/(user-facing)/register/confirmation/page.tsx` — polling guard         | ✅ Done        |
| 9    | `app/(user-facing)/register/confirmation/BatchConfirmationGuard.tsx`       | ✅ Done        |
| 10   | `types/index.ts` — `PaymentState`, `Payment` types                         | ✅ Done        |
| 11   | Legacy `utils/payment/converge.ts` deleted                                  | ✅ Done        |
| 12   | Legacy `app/actions/getConvergePaymentUrl.ts` deleted                       | ✅ Done        |
| 13   | Legacy `app/api/webhooks/payment/route.ts` deleted                          | ✅ Done        |
| —    | **Bug fix:** webhook batch status check (`"pending_payment"` → `"pending"`)| ✅ Fixed       |
| —    | **Bug fix:** debug `console.log` + mislabeled error in server action        | ✅ Fixed       |
| —    | Unit tests — 42 tests across 3 files in `tests/unit/payment/`              | ✅ Done        |
| 14   | Apply migrations against Supabase instance                                  | ⬜ Pending     |
| 15   | Register webhook URL with Elavon merchant portal ⚠️ required before any payment confirms | ⬜ Manual step |
| 16   | Sandbox test matrix                                                         | ⬜ Pending     |
| 17   | Production credential confirmation (NA/USD with Elavon)                     | ⬜ Pending     |

---

## Why This Migration

### From: Legacy Converge form-POST API

- Credentials: `CONVERGE_MERCHANT_ID` / `CONVERGE_USER_ID` / `CONVERGE_PIN`
- Request format: `application/x-www-form-urlencoded`, `ssl_*` key-value parameters
- Webhook: Server-to-server form POST with full transaction data — **no auth verification** (security gap)
- Response format: URL-encoded key-value pairs

### To: Elavon Payment Gateway (EPG) REST API

- Credentials: `EPG_SECRET_KEY` (`sk_...`) / `EPG_PUBLIC_KEY` (`pk_...`) / `EPG_MERCHANT_ALIAS`
- Request format: `application/json`, REST resources
- Webhook: POST with notification metadata only → server must fetch full transaction via authenticated GET
- Response format: JSON with HATEOAS resource links
- Auth: HTTP Basic over TLS 1.2+

### Why Hosted Payment Session (not Direct API or Hybrid)

The Hosted Payment Page (`POST /payment-sessions` with `doCreateTransaction: true`) was chosen
because it achieves **SAQ A PCI scope** — the lowest possible. Card data is entered exclusively
on EPG's hosted page and never touches AYDT's server, network, or client JavaScript.

The three alternatives:

- **Direct API** (`POST /transactions` with raw card fields) → SAQ D, full PCI audit required
- **Hybrid** (client tokenizes via `/hosted-cards`, server charges) → SAQ A-EP, more scope
- **Hosted Payment Session** → SAQ A, minimal scope ✅

---

## Environment Variables

### Required (add to `.env.local` and Vercel)

```bash
# Elavon-provisioned credentials
EPG_SECRET_KEY=sk_...             # Server-side ONLY — NEVER expose to client
EPG_PUBLIC_KEY=pk_...             # Not used in HPP approach (kept for future)
EPG_MERCHANT_ALIAS=...            # Your merchant identifier

# Sandbox vs Production base URL
EPG_BASE_URL=https://uat.api.converge.eu.elavonaws.com   # sandbox
# EPG_BASE_URL=https://api.eu.convergepay.com            # production (confirm NA URL with Elavon)

# Webhook Basic auth — YOU choose these; register them with Elavon
EPG_WEBHOOK_USERNAME=aydt_webhook
EPG_WEBHOOK_PASSWORD=...          # ≥8 chars, upper+lower+digit+special

# Used by createEPGPaymentSession to build absolute returnUrl / cancelUrl
SITE_URL=https://aydt.com         # production; omit in dev (falls back to host header)

# Used by webhook confirmation email as sender fallback
RESEND_FROM_EMAIL=noreply@aydt.com
```

### Remove (legacy Converge)

```bash
CONVERGE_API_URL
CONVERGE_MERCHANT_ID
CONVERGE_USER_ID
CONVERGE_PIN
```

### ⚠️ EU URL Note

The EPG spec only lists EU server URLs. The sandbox was provisioned with the EU URL.
**Before production**, confirm with Elavon:

1. Whether US/NA merchants use EU endpoints or get a separate NA URL
2. Data residency implications for US cardholder data
3. Whether USD is enabled on the processor account

---

## Full Payment Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REGISTRATION FLOW                            │
│                                                                 │
│  User: selects sessions → assigns dancers → fills form          │
│                                ↓                                │
│  payment/page.tsx: computePricingQuote()                        │
│                    [shows breakdown: tuition, fees, total]      │
│                                ↓                                │
│  User clicks "Confirm & Pay"                                    │
│                                ↓                                │
│  createRegistrations() ── Server Action ──────────────────────► │
│    ├─ validateEnrollment()   [Phase 3 hard blocks]              │
│    ├─ computePricingQuote()  [server-side price verify]         │
│    ├─ INSERT registration_batches  [status: "pending"]          │
│    ├─ INSERT registrations         [status: "pending_payment"]  │
│    └─ INSERT batch_payment_installments [status: "scheduled"]   │
│                                ↓                                │
│  createEPGPaymentSession() ── Server Action ───────────────────►│
│    ├─ Verify batch.status === "pending"                         │
│    ├─ POST /orders           [EPG: creates order resource]      │
│    ├─ POST /payment-sessions [EPG: HPP session, hppType:        │
│    │                          "fullPageRedirect", doCapture:    │
│    │                          true, doThreeDSecure: true]       │
│    └─ UPSERT payments        [state: "pending_authorization"]   │
│                                ↓                                │
│  window.location.href = paymentSession.url                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  EPG HOSTED PAYMENT PAGE                        │
│                                                                 │
│  User enters card details on Elavon's hosted page               │
│  EPG handles: card validation, 3DS, authorization               │
│                                                                 │
│  On success: EPG fires webhook ──────────────────────────────►  │
│              EPG redirects user → returnUrl                     │
│  On decline: EPG fires webhook                                  │
│              EPG redirects user → cancelUrl                     │
│  On cancel:  EPG redirects user → cancelUrl (no webhook)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (two parallel paths)
┌───────────────────────────┐   ┌───────────────────────────────┐
│  WEBHOOK PATH             │   │  REDIRECT PATH                │
│  /api/webhooks/epg        │   │  /register/confirmation       │
│                           │   │                               │
│  1. Validate Basic auth   │   │  1. BatchConfirmationGuard    │
│  2. Parse notification    │   │     checks batch.status       │
│  3. GET /transactions/{id}│   │  2. If confirmed → show ✅    │
│  4. Verify isAuthorized   │   │  3. If pending → poll every   │
│  5. Update payments table │   │     2s up to 30s (15 polls)   │
│  6. Confirm registration  │   │  4. Timeout → show processing │
│  7. Send email            │   │     message                   │
│  8. Return 200            │   │                               │
└───────────────────────────┘   └───────────────────────────────┘
```

**Key status distinction:**
- `registration_batches.status`: `"pending"` → `"confirmed"` (or `"failed"`)
- `registrations.status`: `"pending_payment"` → `"confirmed"` (or `"cancelled"`)
- `payments.state`: `"pending_authorization"` → `"authorized"` → `"settled"`

---

## Payment State Machine

```
payments.state transitions:

  initiated
    │
    └──(createEPGPaymentSession called)──► pending_authorization
                                                 │
              ┌──────────────────────────────────┼────────────────────────────┐
              │                                  │                            │
       saleDeclined                     saleHeldForReview              saleAuthorized
              │                                  │                            │
           declined                       held_for_review                 authorized
                                                                              │
                                                                  saleCaptured (only if doCapture=false)
                                                                              │
                                                                           captured
                                                                              │
                                                                         saleSettled
                                                                              │
                                                                           settled

  Any state → voided    (voidAuthorized webhook)
  authorized/captured/settled → refunded   (refundAuthorized webhook)
```

**For AYDT** (`doCapture: true` by default):
`initiated → pending_authorization → authorized → settled`

**Registration confirmed** when `payments.state IN ('authorized', 'captured', 'settled')`

---

## Database Schema

### `payments` Table

Defined in `supabase/migrations/20260302000000_baseline.sql`.
UNIQUE constraint on `custom_reference` added in `20260302000001_payments_unique_reference.sql`.

```sql
CREATE TABLE public.payments (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_batch_id uuid          NOT NULL UNIQUE
                                      REFERENCES registration_batches(id) ON DELETE CASCADE,
  order_id              text,         -- EPG Order resource ID (set when Order created)
  payment_session_id    text,         -- EPG PaymentSession resource ID
  transaction_id        text,         -- EPG Transaction resource ID (set on webhook)
  custom_reference      text          NOT NULL UNIQUE,  -- = batchId, idempotency guard
  amount                numeric(10,2) NOT NULL,
  currency              text          NOT NULL DEFAULT 'USD',
  state                 text          NOT NULL DEFAULT 'initiated',
  event_type            text,         -- Last EPG EventType received
  raw_notification      jsonb,        -- Last notification body
  raw_transaction       jsonb,        -- Full transaction from GET /transactions/{id}
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);
```

### Relevant columns on related tables

**`registration_batches`** (written by webhook on confirmation):
- `status` — `"pending"` on creation → `"confirmed"` on payment success
- `confirmed_at timestamptz` — set by webhook
- `payment_reference_id text` — EPG `transaction.id`, set by webhook

**`batch_payment_installments`** (installment 1 marked paid by webhook):
- `status` — `"scheduled"` → `"paid"`
- `paid_at timestamptz` — set by webhook
- `paid_amount numeric(10,2)` — actual charged amount from EPG transaction
- `payment_reference_id text` — EPG `transaction.id`, set by webhook

---

## Webhook Handler Design

### Why we never trust the notification payload

EPG notification POSTs contain only:

```json
{
  "id": "notification_id",
  "eventType": "saleAuthorized",
  "resourceType": "transaction",
  "resource": "https://uat.api.converge.eu.elavonaws.com/transactions/abc123",
  "createdAt": "...",
  "customReference": "..."
}
```

The notification does **not** include the transaction amount, card details, or authorization code.
We call `GET {notification.resource}` with our secret key to fetch the authoritative transaction state.
This ensures we only act on data EPG confirms is real — not on a forged POST body.

### Why HTTP Basic (not HMAC)

EPG does not support HMAC webhook signing. Instead, EPG sends requests to your webhook URL
using HTTP Basic credentials you registered during merchant setup. We validate these using
`crypto.timingSafeEqual` to prevent timing oracle attacks.

### Replay protection

The `payments.custom_reference` column has a UNIQUE constraint (= batchId).
The webhook handler checks `payment.state` before processing — if already in a terminal state
(`authorized`, `captured`, `settled`, `declined`, `voided`, `refunded`), the handler returns 200 immediately
with no DB changes.

---

## Confirmation Page Race Condition

**The problem:** EPG fires the webhook and redirects the user to `returnUrl` roughly simultaneously.
The redirect may arrive at the browser before the webhook is processed by our server.

**The solution:** `BatchConfirmationGuard` client component polls
`GET /api/register/batch-status?id={batchId}` every 2 seconds for up to 30 seconds (15 polls max).
The webhook processes asynchronously and updates `registration_batches.status → confirmed`.
The poller detects the change and shows the success UI.

The polling endpoint (`app/api/register/batch-status/route.ts`) is auth-guarded:
it returns 404 unless the authenticated user's `id` matches `batch.parent_id`.

If the webhook never fires within 30 seconds (unlikely in production), the confirmation page
shows a "processing" message. The webhook will still fire eventually, send the confirmation email,
and the user can check their email.

---

## Idempotency Strategy

EPG does not support `Idempotency-Key` headers. We implement idempotency at our layer:

| Layer                     | Mechanism                                                                  |
| ------------------------- | -------------------------------------------------------------------------- |
| createRegistrations()     | Checks if batch already exists before INSERT; returns existing IDs if so   |
| createEPGPaymentSession() | Checks payments table for existing session; re-fetches URL if still valid  |
| createEPGPaymentSession() | `payments` upsert with `onConflict: "custom_reference"` prevents dup rows  |
| Webhook handler           | Checks `payment.state`; skips if already terminal                          |
| Webhook handler           | Batch update uses `.eq("status", "pending")` — only confirms once          |
| Database                  | `payments.custom_reference UNIQUE` prevents duplicate rows at DB level     |

---

## EPG API Client (`utils/payment/epg.ts`)

### Auth format

```
Authorization: Basic base64(merchantAlias:secretKey)
```

All requests include `Accept-Version: 1` header per EPG spec.

### Exported functions

| Function | EPG Call | Purpose |
|---|---|---|
| `createEpgOrder` | `POST /orders` | Create an order resource for the charge amount |
| `createEpgPaymentSession` | `POST /payment-sessions` | Create HPP session; get redirect URL |
| `fetchEpgPaymentSession` | `GET /payment-sessions/{id}` | Re-fetch existing session for idempotency |
| `fetchEpgTransaction` | `GET {transactionHref}` | Authoritative transaction fetch in webhook |
| `epgEventTypeToPaymentState` | — | Maps EPG event type strings to our `payments.state` values |

### HPP session parameters

```typescript
{
  order: orderHref,           // Full HREF of the Order resource
  hppType: "fullPageRedirect",
  returnUrl: "...",
  cancelUrl: "...",
  doCreateTransaction: true,  // EPG handles the full sale
  doCapture: true,            // Immediate capture (not auth-only)
  doThreeDSecure: true,       // 3DS enabled; requires processor account config
  customReference: batchId,
}
```

---

## Confirmation Email

The webhook sends the confirmation email after all DB writes succeed. It uses the
`semesters.confirmation_email` JSONB field configured in the Semester admin flow.

**Template variables resolved by the webhook:**

| Token | Value |
|---|---|
| `{{parent_first_name}}` | Parent's first name |
| `{{parent_name}}` | Parent's full name |
| `{{semester_name}}` | Semester name |
| `{{dancer_name}}` | Comma-separated dancer names |
| `{{dancer_list}}` | Same as `{{dancer_name}}` |
| `{{class_list}}` | Comma-separated class names |
| `{{session_list}}` | Same as `{{class_list}}` |

Email is sent via Resend. Sender address falls back to `RESEND_FROM_EMAIL` env var, then
`noreply@aydt.com`, if the semester template doesn't specify `fromEmail`.

**Email failure is non-fatal** — if Resend fails, the registration is still confirmed and the
batch is still updated. The failure is logged to console. Consider adding an admin alert here.

---

## Unit Test Coverage

42 automated tests across three files in `tests/unit/payment/`. Run with:

```bash
npx vitest run tests/unit/payment/
```

| File | Tests | Scope |
|---|---|---|
| `epg.test.ts` | 10 | `epgEventTypeToPaymentState` — all 7 event mappings + unknown/empty/case |
| `webhookHandler.test.ts` | 21 | Auth, filtering, EPG fetch errors, replay protection (all 6 terminal states), declined path, happy path, concurrent delivery |
| `createEPGPaymentSession.test.ts` | 11 | Auth guard, batch validation, idempotency (re-use / expired / terminal), happy path, EPG errors, non-fatal upsert failure |

The `webhookHandler.test.ts` suite includes a **regression test** that directly asserts the batch confirmation uses `.eq("status", "pending")`. If this value ever drifts back to `"pending_payment"`, the test fails before the bug reaches production.

---

## Sandbox Test Matrix

> Fill in as tests are run

| Test                         | Date | Result | Notes               |
| ---------------------------- | ---- | ------ | ------------------- |
| Health check                 | -    | -      | `GET /health` → 200 |
| Successful payment           | -    | -      |                     |
| Declined card                | -    | -      |                     |
| User cancels                 | -    | -      |                     |
| Duplicate submit             | -    | -      |                     |
| Webhook replay               | -    | -      |                     |
| Invalid webhook auth         | -    | -      |                     |
| Webhook before redirect race | -    | -      |                     |

---

## Steps Before First Sandbox Test

1. **Apply DB migrations** — run `20260302000000_baseline.sql` and `20260302000001_payments_unique_reference.sql` against your Supabase instance if not already applied
2. **Set env vars** — confirm `EPG_SECRET_KEY`, `EPG_MERCHANT_ALIAS`, `EPG_BASE_URL`, `EPG_WEBHOOK_USERNAME`, `EPG_WEBHOOK_PASSWORD`, `SITE_URL` are set in `.env.local`
3. **⚠️ Register webhook URL in Elavon merchant portal** — this is required for any payment to confirm. Without it, EPG silently drops the `saleAuthorized` notification, the batch stays `"pending"`, and the confirmation page shows "Payment received — your registration is being confirmed" indefinitely.
   - For local/sandbox testing: start an ngrok tunnel (`ngrok http 3000`) and register `https://<id>.ngrok.io/api/webhooks/epg`
   - Set the Basic auth credentials in the portal to match `EPG_WEBHOOK_USERNAME` and `EPG_WEBHOOK_PASSWORD` from your `.env.local`
   - After registering, verify by checking server logs for inbound `POST /api/webhooks/epg` after a test payment
4. **Health check** — `curl https://uat.api.converge.eu.elavonaws.com/health` should return 200
