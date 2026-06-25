# EPG Integration Change Log — Meeting Plan #47

**Feature:** Failed/overdue installment row actions on the admin payments dashboard
— **Reprocess** (charge saved card), **Pay Now** (charge a new card via HPP), and a
reworded **Mark Paid (offline)**.

**Why this matters for Elavon:** our EPG integration was previously certified/validated
against Elavon. This document lists every file we touched that affects the payment path,
so Elavon can scope any re-testing. **The charge primitives themselves were not changed** —
we reuse the already-validated `createEpgTransaction` (stored-card MIT/S2S) and
`createEpgOrder` + `createEpgPaymentSession` (HPP) paths. The new code is orchestration,
UI, and webhook reconciliation around those existing primitives.

---

## Part A — Stored-card "Reprocess" + reworded "Mark Paid" (SHIPPED)

### What changed, end to end

An admin viewing a **failed/overdue installment** on the Transactions tab can now press
**Reprocess** to charge the family's **saved encrypted card** for that installment's
`amount_due`. This runs the **exact same idempotent, merchant-initiated stored-card path**
already used by (a) the recurring-charge cron and (b) the Error Log retry — no new or forked
charge path was introduced. **Mark Paid** was relabeled **"Mark Paid (offline)"** with a
confirmation dialog so it is unambiguously a manual cash/check reconciliation that does **not**
touch Elavon.

### EPG-relevant behavior (unchanged primitives)

- Charge is executed by `chargeStoredPaymentInstallment(installmentId)` →
  `createEpgTransaction(...)`.
- **Merchant-initiated flags are still enforced inside `createEpgTransaction`** and were NOT
  modified: `credentialOnFileType: "recurring"` + `shopperInteraction: "merchantInitiated"`
  (required on our 3DS-enforced account; without them the charge declines as a customer-initiated
  ecommerce sale).
- **Idempotency unchanged:** `customReference = installmentId`.
- No new endpoint, header, credential, or request-body field was added for Part A.

### Files touched (Part A)

| File | Status | Change |
| --- | --- | --- |
| `app/admin/payments/actions/reprocessInstallment.ts` | **NEW** | Thin server action. Calls the existing `chargeStoredPaymentInstallment(installmentId)`; on success, resolves any open `payment_error_logs` row for that installment. **No direct Elavon call** — delegates to the validated charge action. Super-admin gate inherited. |
| `app/admin/payments/page.tsx` | MODIFIED | UI only + one query field. Added `stored_payment_method_id` and a nested `stored_payment_methods(type, card_last4, card_scheme)` to the existing `registration_orders` select so the row can show **Reprocess** vs (Part B) **Pay Now**. Added `Reprocess` button (shown only when a saved card is on file), a `reprocessingId` loading state, and a `handleReprocess` handler. Relabeled **Mark Paid → "Mark Paid (offline)"** and added a `window.confirm` clarifying it does not charge a card. |

### Files reused but NOT modified (the validated EPG core)

These carry the actual Elavon interaction and were **left untouched** in Part A:

- `app/actions/chargeStoredPaymentInstallment.ts` — stored-card S2S charge + installment update.
- `utils/payment/epg.ts` — `createEpgTransaction` (MIT flags live here).

### Re-test scope suggested to Elavon (Part A)

- Stored-card **merchant-initiated** charge of a single overdue installment (same call shape as
  the recurring cron, just admin-triggered). Expect identical behavior to the already-certified
  recurring charge.
- Decline handling: the existing path increments `charge_attempt_count` / sets
  `last_charge_error`; the UI surfaces the gateway error message via toast. No change to how
  declines are interpreted (`txn.isAuthorized`, not HTTP status).

---

## Part B — New-card "Pay Now" via HPP redirect (SHIPPED)

### What changed, end to end

When the family's saved card can't be used (expired) or they want a **different** card, the
admin presses **Pay Now** (no saved card) / **New card** (saved card present). This creates a
**one-off EPG Order + hosted Payment Session** for exactly that installment's `amount_due` and
redirects the admin's browser to Elavon's hosted page. Because the new card is
**cardholder-present** and our account is **3DS-enforced**, the charge runs as a normal hosted
sale where **Elavon performs the 3DS challenge** — we do NOT attempt a server-to-server
merchant-initiated charge for a new card (that path is only valid for an already-stored card).

### EPG-relevant behavior

- **Order:** `createEpgOrder({ amountDollars, currencyCode:"USD", description, customReference })`.
- **Session:** `createEpgPaymentSession({ orderHref, returnUrl, cancelUrl, customReference,
  doThreeDSecure:true, doCreateTransaction:true, doCapture:true, billTo })`
  — i.e. a **full hosted sale** (`hppType:"fullPageRedirect"`), 3DS on. `billTo` is pre-filled
  from the parent's address for AVS, same as the existing checkout's tokenize-only session.
- **No new EPG endpoints, headers, or credentials.** Both calls are the already-validated
  primitives used by the existing public checkout (`createEPGPaymentSession`). The only
  difference vs. checkout is the **amount source** (a single installment's `amount_due`) and the
  **reference** (see below).

### Reference + reconciliation design (important for Elavon)

- **`customReference = "installment-retry-{installmentId}"`** on both the Order and the Session.
  It is deliberately **not** the order/batch id, so it never collides with the original
  checkout's `payments` row (`payments.registration_batch_id` and `custom_reference` are UNIQUE
  per order).
- **These sessions intentionally have NO `payments` row.** Reconciliation is therefore keyed off
  the **transaction**, not a stored payment row.
- **The existing EPG webhook is the authoritative reconciler.** When EPG POSTs the
  transaction notification, the webhook (as today) GETs the authoritative transaction
  (`fetchEpgTransaction`) and now, when the resolved reference starts with
  `installment-retry-`, marks **that specific installment** paid (idempotent across EPG's
  replayed `saleAuthorized → saleCaptured → saleSettled` events). A declined attempt is recorded
  in the admin Error Log. **No change was made to how the webhook authenticates or fetches the
  transaction.**
- **The return page does not call Elavon.** It polls our own DB for the installment to flip to
  paid (the webhook does the marking) and shows a "do not re-charge" notice if reconciliation is
  still pending — avoiding double charges.

### Files touched (Part B)

| File | Status | Change |
| --- | --- | --- |
| `app/admin/payments/actions/createInstallmentHppSession.ts` | **NEW** | Super-admin server action. Builds a one-off `createEpgOrder` + `createEpgPaymentSession` (full hosted sale, 3DS on) for one installment's `amount_due`; `customReference = installment-retry-{id}`; returns the hosted-page URL. **No `payments` row, no DB mutation of the installment** (the webhook reconciles). |
| `utils/payment/reconcileInstallmentHppCharge.ts` | **NEW** | Shared, idempotent reconciler. Given the authoritative transaction, marks the installment paid (same field set as the stored-card path) and resolves any open error-log row. Called by both the webhook (service-role client) and the return page (super-admin client). **Does not call Elavon.** |
| `app/api/webhooks/epg/route.ts` | MODIFIED | Added a branch **before** the existing `payments` lookup: if the resolved reference starts with `installment-retry-`, reconcile that installment from the transaction (authorized → mark paid; declined → Error Log) and return 200. **The auth check, transaction fetch, and all existing batch/installment-1 paths are unchanged.** |
| `app/admin/payments/installment-return/page.tsx` | **NEW** | HPP return landing. Polls our DB (no Elavon call) for the installment to flip to paid; shows success / processing-with-warning / missing states. |
| `app/admin/payments/page.tsx` | MODIFIED | Added **Pay Now / New card** button + `handlePayNow` (redirects the browser to the hosted-page URL) + `payNowId` loading state. |

### Files reused but NOT modified (the validated EPG core)

- `utils/payment/epg.ts` — `createEpgOrder`, `createEpgPaymentSession`, `fetchEpgTransaction`
  all unchanged.

### Re-test scope suggested to Elavon (Part B)

- **New-card hosted sale, cardholder-present, 3DS challenge**, for a one-off amount equal to a
  single overdue installment. This is the same hosted-sale mechanism as public checkout
  (`doCreateTransaction:true` + `doCapture:true` + `doThreeDSecure:true`) — please confirm a 3DS
  challenge is presented and a successful sale settles.
- **Webhook reconciliation by `customReference`**: confirm the transaction notification carries
  `customReference` (or `orderReference`) = `installment-retry-{id}` so our webhook can mark the
  correct installment. (Our handler already falls back across `customReference` /
  `orderReference` / notification fields, matching the existing checkout behavior.)
- **AVS:** `billTo` is pre-populated on the session, same as the existing installment checkout —
  no new AVS behavior, but worth a confirming pass on a hosted-sale (vs. tokenize-only) session.
- **Decline path:** a declined new-card attempt should produce a transaction event our webhook
  logs to the Error Log; confirm decline notifications are delivered for hosted sales.

---

## Summary of EPG surface for Elavon

- **No new Elavon API endpoints, request fields, credentials, or webhook auth changes.**
- **Stored-card charges** (Part A) reuse the certified merchant-initiated S2S path verbatim.
- **New-card charges** (Part B) reuse the certified hosted-sale (HPP) path verbatim; only the
  amount and the `customReference` value differ.
- **The one new concept** is the `installment-retry-{installmentId}` `customReference` convention
  and a webhook branch that reconciles a single installment from the transaction. This is
  internal to our system; from Elavon's side it is an ordinary Order → hosted Session → sale
  transaction with a customReference we choose.
