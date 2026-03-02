# EPG Payment Integration — Development Reference

Elavon Payment Gateway (EPG) REST API integration for AYDT registration platform.
This document is updated as each phase completes.

---

## Status

| Step | File / Action                                                              | Status         |
| ---- | -------------------------------------------------------------------------- | -------------- |
| 1    | `docs/EPG_PAYMENT_INTEGRATION.md` — this file                              | ✅ Done        |
| 2    | `supabase/migrations/20260301_add_epg_payments_table.sql`                  | ✅ Done        |
| 3    | `utils/payment/epg.ts` — EPG REST client                                   | ✅ Done        |
| 4    | `app/actions/createEPGPaymentSession.ts` — server action                   | ✅ Done        |
| 5    | `app/api/webhooks/epg/route.ts` — webhook handler                          | ✅ Done        |
| 6    | `app/api/register/batch-status/route.ts` — polling endpoint                | ✅ Done        |
| 7    | `app/(user-facing)/register/payment/page.tsx` — swap action import         | ✅ Done        |
| 8    | `app/(user-facing)/register/confirmation/page.tsx` — add polling guard     | ✅ Done        |
| 9    | `app/(user-facing)/register/confirmation/BatchConfirmationGuard.tsx` — new | ✅ Done        |
| 10   | `types/index.ts` — add EPG types (PaymentState, Payment)                   | ✅ Done        |
| 11   | Delete `utils/payment/converge.ts`                                         | ✅ Done        |
| 12   | Delete `app/actions/getConvergePaymentUrl.ts`                              | ✅ Done        |
| 13   | Delete `app/api/webhooks/payment/route.ts`                                 | ✅ Done        |
| 14   | Run `supabase/migrations/20260301_add_epg_payments_table.sql` against DB   | ⬜ Pending     |
| 15   | Register webhook URL with Elavon merchant portal                           | ⬜ Manual step |
| 16   | Sandbox test matrix                                                        | ⬜ Pending     |
| 17   | Production credential confirmation (NA/USD with Elavon)                    | ⬜ Pending     |

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

The Hosted Payment Session (`POST /payment-sessions` with `doCreateTransaction: true`) was chosen
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
│    ├─ INSERT registration_batches  [status: pending_payment]    │
│    ├─ INSERT registrations         [status: pending]            │
│    └─ INSERT batch_payment_installments                         │
│                                ↓                                │
│  createEPGPaymentSession() ── Server Action ───────────────────►│
│    ├─ POST /orders           [EPG: creates order resource]      │
│    ├─ POST /payment-sessions [EPG: creates HPP session]         │
│    └─ INSERT payments        [state: pending_authorization]     │
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
│  5. Update payments table │   │     2s up to 30s              │
│  6. Confirm registration  │   │  4. Timeout → show processing │
│  7. Send email            │   │     message                   │
│  8. Return 200            │   │                               │
└───────────────────────────┘   └───────────────────────────────┘
```

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

### New `payments` Table

```sql
CREATE TABLE public.payments (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_batch_id uuid          NOT NULL UNIQUE   -- one payment per batch
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
(`authorized`, `declined`, `voided`, `settled`, `refunded`), the handler returns 200 immediately
with no DB changes.

---

## Confirmation Page Race Condition

**The problem:** EPG fires the webhook and redirects the user to `returnUrl` roughly simultaneously.
The redirect may arrive at the browser before the webhook is processed by our server.

**The solution:** `BatchConfirmationGuard` client component polls
`GET /api/register/batch-status?id={batchId}` every 2 seconds for up to 30 seconds.
The webhook processes asynchronously and updates `registration_batches.status → confirmed`.
The poller detects the change and shows the success UI.

If the webhook never fires within 30 seconds (unlikely in production), the confirmation page
shows a "processing" message. The webhook will still fire eventually, send the confirmation email,
and the user can check their email.

---

## Idempotency Strategy

EPG does not support `Idempotency-Key` headers. We implement idempotency at our layer:

| Layer                     | Mechanism                                                       |
| ------------------------- | --------------------------------------------------------------- |
| createRegistrations()     | Checks if batch already exists before INSERT                    |
| createEPGPaymentSession() | Checks payments table for existing session; returns it if found |
| Webhook handler           | Checks payment.state; skips if already terminal                 |
| Database                  | `payments.custom_reference UNIQUE` prevents duplicate rows      |

---

## Sandbox Test Results

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

Next Steps Before You Can Test
Run the DB migration — apply 20260301_add_epg_payments_table.sql against your Supabase instance
Register webhook with Elavon — provide them https://<ngrok-url>/api/webhooks/epg + the EPG_WEBHOOK_USERNAME/EPG_WEBHOOK_PASSWORD values from .env.local
Verify env vars — confirm EPG_SECRET_KEY, EPG_MERCHANT_ALIAS, EPG_BASE_URL are set
Health check — curl https://uat.api.converge.eu.elavonaws.com/health should return 200
