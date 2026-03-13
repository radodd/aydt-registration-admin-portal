# EPG Implementation Roadmap & Gap Analysis

Last updated: 2026-03-13

This document tracks what is implemented, what is missing, and the phased plan to complete the Elavon Payment Gateway integration for AYDT.

---

## Gap Analysis

| Feature | Status | Notes |
|---|---|---|
| One-time HPP card payment | ✅ Done | `createEpgPaymentSession`, webhook, confirmation guard |
| Webhook handler (Basic auth, idempotent) | ✅ Done | `/api/webhooks/epg` — timing-safe auth, authoritative fetch |
| 42 unit tests | ✅ Done | `tests/unit/payment/` — epg, webhook, session action |
| Elavon reference docs | ✅ Done | `docs/elavon/` — 12 files |
| Cert account credentials | ✅ Done | `.env.local` updated 2026-03-13 |
| Webhook credentials set | ⬜ Pending | `EPG_WEBHOOK_USERNAME` / `EPG_WEBHOOK_PASSWORD` still placeholders in `.env.local` |
| Webhook URL registered in Elavon portal | ⬜ Manual | Required before any payment confirms — register ngrok URL for local testing |
| Shopper resource (create/retrieve) | ⬜ Missing | No functions in `utils/payment/epg.ts`; no DB table |
| Stored Card (card on file) | ⬜ Missing | `doCapture` always `true`; Hosted Card token never captured or persisted |
| Stored ACH Payment | ⬜ Missing | No ACH HPP session or storage flow exists |
| Server-to-server charge (stored card) | ⬜ Missing | No `POST /transactions` with `storedCard` |
| Server-to-server charge (stored ACH) | ⬜ Missing | Same |
| Recurring installment auto-charge | ⬜ Missing | `batch_payment_installments` exist in DB; cron marks overdue but never charges |
| EPG Plans/Subscriptions (gateway-managed) | 🔵 Deferred | DIY cron preferred — see Phase 4 rationale below |

---

## Phase 1 — Credential Swap + Smoke Test ✅

**Completed 2026-03-13.**

- Updated `.env.local` to cert account: `EPG_MERCHANT_ALIAS=mybmf7ybddydqjc8kb6mx4xk82t7`
- `EPG_BASE_URL` unchanged: `https://uat.api.converge.eu.elavonaws.com`

**Still needed (manual):**
1. Set `EPG_WEBHOOK_USERNAME` and `EPG_WEBHOOK_PASSWORD` in `.env.local`
2. Register webhook URL in Elavon merchant portal (UI: https://uat.converge.eu.elavonaws.com/login, account: ethanf.flores+cert@gmail.com)
3. Smoke test: `GET /health` → 200; `POST /orders` → 201

---

## Phase 2 — Elavon Reference Docs ✅

**Completed 2026-03-13.** All 12 files written to `docs/elavon/`.

---

## Phase 3 — Shopper + Stored Card/ACH Infrastructure

**Elavon refs:** [`api_shoppers.md`](./elavon/api_shoppers.md), [`api_stored_cards.md`](./elavon/api_stored_cards.md), [`api_stored_ach.md`](./elavon/api_stored_ach.md)

### 3a. Extend `utils/payment/epg.ts`

Add server-side-only functions (same Basic auth pattern as existing functions):

```typescript
createEpgShopper(params: { customReference: string; fullName?: string; email?: string }) → EpgShopper
fetchEpgShopper(shopperId: string) → EpgShopper
createEpgStoredCard(params: { shopperHref: string; hostedCardHref: string; customReference?: string }) → EpgStoredCard
createEpgStoredAchPayment(params: { shopperHref: string; hostedAchPaymentHref: string; customReference?: string }) → EpgStoredAchPayment
createEpgTransaction(params: {
  storedCardHref?: string;
  storedAchPaymentHref?: string;
  shopperHref: string;
  amount: number;
  currencyCode: string;
  customReference: string;
  description?: string;
}) → EpgTransaction
```

New types to add: `EpgShopper`, `EpgStoredCard`, `EpgStoredAchPayment`.

### 3b. DB Migration — `shoppers` + `stored_payment_methods`

File: `supabase/migrations/YYYYMMDD_epg_stored_payment.sql`

```sql
CREATE TABLE shoppers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  epg_shopper_id text NOT NULL UNIQUE,
  epg_shopper_href text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stored_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id uuid REFERENCES shoppers(id),
  type text NOT NULL CHECK (type IN ('card', 'ach')),
  epg_stored_id text NOT NULL UNIQUE,
  epg_stored_href text NOT NULL,
  masked_number text,
  card_scheme text,
  ach_account_type text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE registration_batches
  ADD COLUMN stored_payment_method_id uuid REFERENCES stored_payment_methods(id);
```

### 3c. Card Storage Flow

**Trigger:** Parent checks out with `payment_plan_type = 'installments'` (installment_count > 1).

1. `createEPGPaymentSession.ts` — pass `doCapture: false` when on installment plan
2. Webhook handler (`saleAuthorized` event) — detect `hostedCard` in session result:
   - `createEpgShopper({ customReference: userId })` (or fetch existing via `customReference_eq`)
   - `createEpgStoredCard({ shopperHref, hostedCardHref, customReference: batchId })`
   - Insert `shoppers` + `stored_payment_methods`
   - Set `registration_batches.stored_payment_method_id`
3. Full-pay checkouts (`installment_count = 1`): keep `doCapture: true`, skip storage.

**Files changed:**
- `utils/payment/epg.ts`
- `app/api/webhooks/epg/route.ts`
- `app/actions/createEPGPaymentSession.ts`

### 3d. ACH Storage Flow

Same pattern as 3c but uses a separate HPP session type and `hostedAchPayment` token.
- Webhook receives `hostedAchPayment` href instead of `hostedCard`
- Call `createEpgStoredAchPayment` instead
- Persisted with `type = 'ach'` in `stored_payment_methods`

---

## Phase 4 — Recurring Installment Auto-Charge

**Elavon refs:** [`api_transactions.md`](./elavon/api_transactions.md)

**Rationale for DIY cron vs EPG Plans/Subscriptions:** AYDT's installment schedule is already computed and stored in `batch_payment_installments` by `buildPaymentSchedule`. Replicating it in EPG Plans would create sync complexity and limit control over retry logic and failure notifications. DIY cron (pg_cron already in place) calling `POST /transactions` with a stored card gives full control.

### 4a. DB Migration — Charge Tracking Columns

File: `supabase/migrations/YYYYMMDD_installment_charge_tracking.sql`

```sql
ALTER TABLE batch_payment_installments
  ADD COLUMN transaction_id text,
  ADD COLUMN charge_attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN last_charge_error text;
```

### 4b. New Server Action: `chargeStoredPaymentInstallment.ts`

File: `app/actions/chargeStoredPaymentInstallment.ts`

```typescript
chargeStoredPaymentInstallment(installmentId: string) → { success: boolean; transactionId?: string; error?: string }
```

Logic:
1. Fetch `batch_payment_installments` row
2. Fetch linked `registration_batch` → `stored_payment_method`
3. Call `createEpgTransaction({ storedCardHref | storedAchHref, shopperHref, amount, customReference: installmentId })`
4. On `isAuthorized = true`: mark installment `paid`, store `transaction_id`
5. On decline: increment `charge_attempt_count`, store `last_charge_error`
6. After 3 failures: mark `failed`, trigger admin notification via Resend

### 4c. Extend `supabase/functions/process-overdue-payments/index.ts`

Current: marks overdue installments, sends admin email.

New behavior: for installments with `status = 'due'` and a stored payment method on the batch:
- Call `chargeStoredPaymentInstallment` for each
- On success: send receipt email to parent
- On 3rd failure: mark `failed`, alert admin

---

## Phase 5 — End-to-End Sandbox Test Run

**Elavon ref:** [`test_cards.md`](./elavon/test_cards.md)

| Test | Card | Expected |
|---|---|---|
| Health check | — | `GET /health` → 200 |
| Full-pay checkout | `4000000000000002` | Batch confirmed, email sent |
| Installment checkout + card stored | `4000000000000002` | Batch confirmed, stored card created |
| Server-to-server installment charge | (stored card) | Installment marked paid |
| ACH checkout + ACH stored | ACH test | Stored ACH created |
| Server-to-server ACH charge | (stored ACH) | Installment marked paid |
| Declined payment | `4000000000000002` at `$X.88` | Batch stays pending |
| Webhook replay | (duplicate delivery) | Only one email sent |
| Invalid webhook auth | (bad credentials) | 401, no side effects |

---

## Credentials Reference

| Key | Account | Notes |
|---|---|---|
| Cert sandbox alias | `mybmf7ybddydqjc8kb6mx4xk82t7` | Active in `.env.local` |
| Cert sandbox public key | `pk_h2rxgtr4vv93qmk2wwdvwv3mrxxr` | |
| Cert sandbox secret key | `sk_fk2jfdq72h3dtw7rkkjh33jdthcy` | Server-side only |
| Elavon portal (cert) | https://uat.converge.eu.elavonaws.com/login | Account: ethanf.flores+cert@gmail.com |
| Sandbox base URL | `https://uat.api.converge.eu.elavonaws.com` | |
