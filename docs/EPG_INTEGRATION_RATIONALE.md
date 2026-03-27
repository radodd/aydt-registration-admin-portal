# EPG Integration — Why We Built It This Way

Created: 2026-03-25. This document explains the reasoning behind every major architectural
decision in the Elavon EPG integration. The goal is to answer "why" questions that the
implementation docs don't fully address.

---

## 1. Why Elavon EPG (not Stripe, Braintree, etc.)?

Elavon is the contracted payment processor for AYDT. This is a business-level decision —
the merchant account, rates, and relationship are already established with Elavon. The
EPG REST API is Elavon's current-generation gateway (superseding Converge/SSL). The
integration targets EPG rather than Stripe because changing processors would require
re-negotiating merchant terms; the engineering team's job is to integrate with the
contracted processor as effectively as possible.

---

## 2. Why Hosted Payment Page (not Direct API or Hybrid)?

The three integration models EPG supports differ only in where card data is entered and
who is in scope for PCI compliance:

| Model | Card data enters | PCI scope | What this means for AYDT |
|---|---|---|---|
| **Direct API** (`POST /transactions` with raw card fields) | Your server | SAQ D — full audit required | Out of scope: would require dedicated security reviews, network segmentation, quarterly scans |
| **Hybrid** (client tokenizes via `/hosted-cards`, server charges) | EPG's JS frame on your page | SAQ A-EP — intermediate scope | Still in scope: your JavaScript and server are involved in the tokenization flow |
| **Hosted Payment Page** (HPP redirect, `POST /payment-sessions`) | EPG's domain entirely | SAQ A — minimal scope ✅ | Card data never touches AYDT servers, browser, or JavaScript |

HPP was chosen because **SAQ A is the lowest PCI scope achievable**. Card numbers, CVVs,
and expiry dates are entered on Elavon's hosted domain. AYDT's application never sees them.
This eliminates the need for a PCI DSS audit, reduces liability, and keeps operational
overhead low for a small organization.

The tradeoff is that the payment flow involves a full-page redirect away from and back to
AYDT's domain. This is addressed by the confirmation polling model (see section 5).

---

## 3. Why Webhook + Redirect (not redirect-only or polling-only)?

EPG's HPP model gives you two notification channels when payment completes:

1. **Browser redirect** — EPG redirects the user's browser to your `returnUrl`. Fast,
   but initiated by the user's browser. Unreliable (tab can be closed, network can drop)
   and untrustworthy (the URL can be navigated to directly without paying).

2. **Webhook** — EPG POSTs to your server endpoint server-to-server. Slower (1–10 seconds
   after the event), but authenticated with credentials you set and guaranteed with retries.

**The redirect alone cannot be used for confirmation.** If confirmation logic ran on redirect
arrival:
- Any user could navigate to `/register/confirmation?batch=<id>` and spoof a confirmed
  registration without paying
- Network failures between EPG and the user's browser would leave registrations permanently
  unconfirmed even after successful payment

The webhook is the single source of truth for all write operations: payment state, batch
confirmation, installment marking, and confirmation email. It is the only channel that
is both trustworthy and reliable.

The redirect is used exclusively as a UX signal — it tells the user "go check the
confirmation page." `BatchConfirmationGuard` polls `GET /api/register/batch-status` every
2 seconds until the webhook confirms the batch. The redirect drives UX; the webhook
drives data.

---

## 4. Why `doCapture: false` for Installment Plans?

For full-pay registrations, HPP runs with `doCapture: true` — EPG captures the full
amount immediately. Simple.

For installment plans, we need to store the parent's card for future automatic monthly
charges. EPG provides a mechanism for this: if you run HPP with `doCapture: false`, EPG
authorizes the card but does not capture funds, and returns a `hostedCard` one-time token
in the payment session resource. This token can be used exactly once to create a reusable
`StoredCard` resource.

**`doCapture: false` is not a choice — it is the only way to obtain the `hostedCard` token
required for card storage.** You cannot retroactively get a storable card from a session
that was run with `doCapture: true`.

The installment webhook flow converts this token to a `StoredCard`, then immediately
charges installment 1 via a server-to-server `POST /transactions`. This means installment 1
is charged by the server (not by HPP), keeping the mechanism consistent with all future
installments.

---

## 5. Why Server-to-Server Charges for Installments (not HPP Each Month)?

Installment payments are automatic monthly charges. There are two ways to implement this:

**Option A — HPP redirect monthly:** Email the parent a "click here to pay" link each
month; they visit EPG's hosted page and re-enter (or select a saved) card.

**Option B — Server-to-server charges (this implementation):** Store the card after the
initial checkout and charge it automatically via `POST /transactions` each month.

Option A was rejected because:
- It requires parent action every month — high abandonment risk
- It creates operational burden (tracking who paid vs. who clicked vs. who ignored)
- It makes installment 2/3/4 indistinguishable from a first-time registration from a
  systems perspective

Option B gives AYDT full control over the billing schedule and enables the admin to see
exactly which installments are paid, overdue, or failed — without requiring any parent
interaction after the initial checkout.

---

## 6. Why DIY Cron (not EPG Plans/Subscriptions)?

EPG provides gateway-managed recurring billing via Plans and Subscriptions — you define
a plan, attach a stored card, and EPG charges automatically on a schedule.

DIY cron was chosen instead because:

1. **AYDT already owns the schedule.** `buildPaymentSchedule()` computes and stores all
   installment due dates in `batch_payment_installments` at checkout time. These are the
   authoritative dates. Replicating them in EPG Plans would mean maintaining two schedules
   in sync — any discrepancy (admin adjustment, waiver, late fee) would require syncing
   both systems.

2. **Full control over retry logic.** EPG's built-in retry behavior is opaque. The DIY
   cron increments `charge_attempt_count`, records `last_charge_error`, moves to `failed`
   after 3 attempts, and triggers an admin Resend alert. This logic is visible, testable,
   and adjustable without touching the gateway configuration.

3. **Simpler admin tooling.** Every installment has a DB row with status, attempt count,
   and error. The admin payments dashboard reads this directly. Gateway-managed subscriptions
   would require EPG API calls to fetch the same information.

4. **No subscription lifecycle complexity.** EPG Plans have their own states (active,
   paused, cancelled). If a registration is refunded or cancelled mid-semester, the Plan
   must also be cancelled in EPG. The DIY approach has no such side effect — just update
   the installment row.

The `process-overdue-payments` Supabase edge function runs daily, finds installments
due but unpaid, and calls `createEpgTransaction` for each with a stored card or ACH.
`chargeStoredPaymentInstallment` is the same logic wrapped as a server action for manual
admin retries from the payments dashboard.

---

## 7. Why Two Idempotency Guards (Application + Database)?

The webhook can be delivered multiple times for the same event. EPG retries on non-2xx
and may fire duplicate deliveries simultaneously.

Two guards are needed because they protect different failure modes:

**Application-level guard** (terminal state check on `payments.state`): fast-paths
duplicate deliveries that arrive sequentially after the first has already succeeded.
One DB query, returns 200 immediately. Handles ~99% of replays.

**Database-level guard** (`.eq("status", "pending")` on the `registration_batches` update):
handles the race condition where two webhook deliveries arrive simultaneously and both
pass the application check before either has finished writing. Only one can win the
conditional `UPDATE WHERE status = 'pending'` — the loser gets zero rows updated and
returns early. No lock is needed.

The application guard is an optimization. The database guard is the correctness guarantee.

---

## 8. Why Node Runtime (not Edge)?

The webhook handler exports `export const runtime = "nodejs"`. Three reasons:

1. **`crypto.timingSafeEqual`** is not available in the Edge runtime. Without it, the
   Basic auth comparison is vulnerable to timing oracle attacks.

2. **`process.env` access** is restricted in Edge runtimes — required env vars
   (`EPG_SECRET_KEY`, `EPG_WEBHOOK_USERNAME/PASSWORD`) may not be available.

3. **Outbound fetch to EPG** from the webhook (`fetchEpgTransaction`) requires a full
   DNS-resolved HTTP client. Edge runtimes have reduced networking capabilities and
   geographic routing that could interfere with the EPG API call.

Payment webhook handlers belong on Node runtime. The latency difference vs. Edge is
irrelevant for a server-to-server endpoint that is not in the user request path.
