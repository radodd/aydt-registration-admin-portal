# EPG Integration Change Log — Meeting Plan #48

**Feature:** Make the payments **Error Log action-required only** — suppress
self-resolved card declines; keep balance-bearing / integration failures.

## ⚠️ Elavon re-test scope: NONE

**No Elavon API interaction changed.** No new endpoints, request fields, headers,
credentials, or webhook authentication. We did **not** change any charge, order,
session, void, refund, or transaction-fetch call. The webhook still authenticates,
fetches the authoritative transaction, and confirms/declines exactly as before.

What changed is **purely internal**: *whether and when AYDT writes a row to its own
`payment_error_logs` table*, and auto-resolving those rows once a balance is collected.
From Elavon's side the integration is byte-for-byte identical to the #47-era behavior.
**Nothing to re-test on the gateway.**

---

## What changed (internal behavior)

Two mechanisms, per the agreed model:

### 1. Suppress customer-present card declines from the actionable log
A card that declines while the cardholder is **present** (public hosted checkout,
installment-1 at checkout, or the #47 admin new-card retry) is self-serviceable — the
family/admin just retries another card. Those declines must **not** create an actionable
Error Log row (they remain in the `payments` table / transaction history). Only **dev-lane
integration failures** (network / api / 3DS / state) still log.

Implementation: at each customer-present decline-logging site we now classify the EPG
`transaction.state` via `classifyPaymentError` and log **only when `ownerLane === "dev"`**.
A genuine card decline always carries `state: "declined"` → classifies admin-lane →
suppressed. Real transport failures are already caught upstream (the transaction-fetch
failure path logs `api_error`, dev-lane) so they are unaffected.

### 2. Resolve-on-success
When a balance is later collected, any still-open `payment_error_logs` rows for that
order/installment flip to `resolved` (kept in history, dropped from the default `new`
view). Centralized in one helper and wired into the confirmation + stored-card success
paths. Extends the resolve-on-success behavior introduced in #47.

---

## Files touched (#48)

| File | Status | Change |
| --- | --- | --- |
| `utils/payment/resolveOpenPaymentErrors.ts` | **NEW** | Shared, best-effort, never-throws helper: resolve open error rows for an `orderId` or `installmentId`. Consolidates three inline copies from #47. **No Elavon call.** |
| `app/api/webhooks/epg/route.ts` | MODIFIED | Step 8b (public checkout decline) and Step 5b (#47 new-card retry decline): classify the EPG state and log **only dev-lane** failures; suppress admin-lane card declines. **Auth / transaction-fetch / confirm paths untouched.** |
| `utils/payment/installmentConfirmation.ts` | MODIFIED | `confirmBatch`: resolve-on-success for the order. `ensureStoredCardAndChargeInstallment1`: gate the installment-1 decline log to dev-lane only. |
| `app/actions/chargeStoredPaymentInstallment.ts` | MODIFIED | Resolve-on-success for the installment after a successful stored-card charge. |
| `app/admin/payments/actions/reprocessInstallment.ts` | MODIFIED | Simplified to delegate — resolve-on-success now lives in `chargeStoredPaymentInstallment`. |
| `utils/payment/reconcileInstallmentHppCharge.ts` | MODIFIED | Use the shared resolve helper (behavior unchanged). |
| `supabase/functions/process-overdue-payments/index.ts` | MODIFIED | **Deno edge function.** Resolve-on-success in the cron's charge-success block: when a recurring retry collects the balance, clear any open error rows for that installment (mirrors `resolveOpenPaymentErrors` inline, since Deno can't import the Node helper). |
| `tests/unit/payment/webhookHandler.test.ts` | MODIFIED | Added coverage: a card decline does **not** log; a dev-lane failure **does**. |

**No schema change, no migration** — `payment_error_logs` already has the `status`
values, `order_id`/`installment_id` (indexed), and `resolved_*` columns needed.

## ⚠️ Deploy note
The edge-function change above only takes effect after a **separate function deploy**:

```
supabase functions deploy process-overdue-payments
```

Pushing to `main` does NOT deploy it. Until deployed, the cron behaves exactly as before
(no regression) — it just won't yet auto-resolve error rows on a recurring self-success.
Still **no Elavon re-test implication** (internal error-log behavior only).
