# Payment Error Logging — Plan

> **Status:** Living document. We will build on this over multiple work windows.
> **Last updated:** 2026-06-10
> **Scope decided:** All payment errors (gateway + application-internal), in a new dedicated DB table.

---

## 1. Goal & rationale

Capture every payment-related failure in the admin portal as a structured, persistent
record so that:

1. Failures are **never silent** — every error becomes a durable row, not a transient
   server/console log.
2. The admin has a **single tracker** to work from.
3. Each error is **routed to whoever can act on it** — the admin (card/family issues) or
   the developer (integration/application issues).

Driven by mentor guidance: keep a durable, auditable log of payment errors — especially
recurring/installment charge failures, which are async and otherwise invisible — rather
than relying on logs that disappear.

---

## 2. Two foundational dimensions

Every error record is classified on two independent axes. Together these drive the schema,
the UI, and the notifications.

### 2a. Origin — where the error came from

| Origin | Meaning | Note |
| --- | --- | --- |
| **`gateway`** | The error originated from EPG/Elavon (decline, API error, webhook failure). | Elavon's dashboard also mirrors these. Our value is unifying them with everything else + workflow/actions. |
| **`application`** | The error happened **inside our app** and never reached EPG (validation, bad state, DB write failure, logic bug, missing data). | No external mirror exists — **this is logging only we can provide.** Detection systems for these are TBD (see §7). |

### 2b. Owner lane — who can fix it

| Lane | Examples | What happens |
| --- | --- | --- |
| **Admin-actionable** | Card declined, insufficient funds, expired card, stored-card token invalid, AVS/CVV mismatch | Surfaces in the log with action buttons (contact family, update card, retry). No dev involvement. |
| **Dev-actionable** | EPG API 5xx, timeout/network, 3DS/MIT misconfig, idempotency/dup-key, malformed payload, unexpected webhook shape, **any application-origin error** | Surfaces in the log **and** notifies the developer. Admin can't resolve alone. |

> Most `application`-origin errors default to the **dev** lane, since the admin generally
> can't fix an internal bug. A classifier maps each raw error code → (origin, lane,
> category). This mapping is the one piece of real logic worth getting right.

---

## 3. Data model — `payment_error_logs` (new table, migration)

Append-only for capture (one row per failed attempt, so retries are visible as history).
Resolution fields are mutable.

**Identity & timing**
- `id`, `created_at`

**Linkage** — who/what this is about
- `order_id`, `installment_batch_id`, `installment_number` (nullable)
- `family_id`, `dancer_id`
- `epg_transaction_id` / `ssl_txn_id`, `payment_session_id` (nullable — application errors may have none)

**Classification**
- `origin` — `gateway` | `application`
- `source` — `cron` | `webhook` | `manual_admin` | `hpp_checkout` | `app_internal`
- `category` — `decline` | `insufficient_funds` | `card_expired` | `token_expired` | `avs_cvv` | `network` | `api_error` | `3ds_mit` | `idempotency` | `validation` | `bad_state` | `db_error` | `unknown`
- `owner_lane` — `admin` | `dev`
- `severity` — `info` | `warning` | `critical`

**Raw detail** — for debugging dev-lane issues
- `error_code`, `error_message`, `http_status` (nullable)
- `raw_payload` (jsonb — full EPG response, or app error context/stack)

**Retry chain**
- `retry_of` (nullable → `payment_error_logs.id` of the prior attempt)
- `retry_count`
- `is_retryable` (bool — set by classifier: transient vs terminal)

**Resolution workflow**
- `status` — `new` | `acknowledged` | `actioned` | `resolved` | `wont_fix`
- `resolved_by`, `resolved_at`, `resolution_notes`

> Migration follows the append-only **migrations** rule: new file, never edit an existing one.

---

## 4. Capture points

A single shared writer — `logPaymentError(input)` — is the **only** thing that inserts
rows, so classification and shape stay consistent everywhere.

### Gateway-origin
1. **Recurring/installment cron** — the auto-charge job. *Highest priority.* Async failures
   here are the core "recurrence" case mentors flagged.
2. **EPG webhook handler** — async charge results that come back declined/errored.
3. **Manual admin charge** — the payment card in the register/admin flow.
4. **Hosted checkout (HPP)** — public one-time failures.

### Application-origin
5. **App-internal detection** — validation failures, illegal state transitions, failed DB
   writes, missing pricing/data, unexpected nulls in payment flows. *Detection systems for
   these are not yet designed — see §7.* The schema is ready for them now.

---

## 5. Retry — design & best practices

**Decision:** "Retry charge" reruns the **exact same cron stored-card path** as the original
attempt. This is the correct approach. Rationale + guardrails:

- **One charge path, always.** Retries reuse the same tested, idempotent code as the
  original charge. A parallel retry path is how double-charges and behavioral drift creep in.
- **Idempotency keys.** A retry must not double-charge if the original actually succeeded but
  the response was lost. The shared charge path carries an idempotency key.
- **Transient vs terminal.** The classifier sets `is_retryable`:
  - *Auto-retry (transient):* network, timeout, 5xx, some soft declines (e.g. insufficient
    funds) on a backoff schedule.
  - *Never auto-retry (terminal):* hard declines — stolen/invalid card, revoked token,
    do-not-honor. These go straight to the admin lane for human action.
- **Each attempt is a new row** linked via `retry_of`; the prior attempt is never mutated.
  Preserves the full audit chain.
- **Capped backoff, then escalate.** N auto-retries with backoff; if still failing, stop and
  surface to admin/dev. **Manual "Retry charge" is always available** regardless of the
  auto-retry cap.

> ⚠️ Retry touches EPG charging internals — before building it we **read the actual cron +
> stored-card path and `docs/elavon/`** (via `epg-researcher`) so the retry maps to the real
> idempotent charge code.

---

## 6. Admin UI — "Error Log" on the payments page

- **Entry point:** a tab/section on `app/admin/payments` — reuse existing status-pill +
  table patterns; no new visual language.
- **List:** filterable table — by origin (gateway/application), lane (admin/dev), status,
  category, date, family. Default filter `status: new`, newest first. Pills color-coded by
  lane/severity.
- **Detail right-panel:** full error + linkage + raw payload (collapsible) + retry chain +
  the resolution form.
- **Row actions:**
  - *Admin-lane:* Acknowledge · Retry charge · Mark resolved (with note) · Open family/order.
  - *Dev-lane:* Acknowledge · Notify developer · Mark resolved.
- **Visibility:** likely `super_admin` gate on raw payload / dev-lane detail (exposes
  integration internals).

---

## 7. Application-internal error detection

The application-origin half has no external mirror (Elavon can't see it). Detection is
wired at **one-shot** failure sites via `logPaymentError({ origin: "application" })`.

**Implemented (Phase 6):**
- **Pricing computation failure on order creation** — `createRegistrations` (public) and
  `createAdminRegistration` (admin). Previously a silent `console.warn` that let the order
  proceed at **zero total** (a real money bug). Now logged `bad_state` / dev lane.
- **Confirmation/receipt email failure** — `alertAdminEmailFailure` in
  `installmentConfirmation.ts`. Payment succeeded but the email didn't send; logged
  `unknown` at `warning` severity (no money impact), unifying with the existing admin alert.

**⚠️ Design rule — never instrument a POLLED path.** The installment finalize route
(`/api/register/finalize-installment`) is polled by the confirmation page, and the helper's
`{ status: "error" }` returns (e.g. "card not entered / abandoned") are expected transient
states during polling. Logging there would spam one row per poll. Capture points must be
**one-shot** (fire once per user action / per real attempt). The Phase 5 installment-decline
log is safe because it sits in the real-charge branch, naturally bounded by the 3-attempt cap.

**Still open (future):** failed dual-table enrollment writes, null linkage on confirm, and
other internal invariants — each must clear the one-shot bar above before being wired.

---

## 8. Notifications  ✅ (Phase 7)

Implemented in `utils/payment/notifyPaymentError.ts`, called by `logPaymentError` after every
insert (so all Node capture points get it; the Deno cron keeps its own 3-attempt admin alert).
Both triggers are **throttled** so a gateway outage can't cause an email storm:

- **Critical dev-lane error** → emails the developer immediately, but only while fewer than
  `MAX_CRITICAL_NOTIFS` (3) such errors were logged in the last `CRITICAL_WINDOW_MIN` (10) min.
- **Threshold escalation** → when one entity (installment → order → family) reaches
  `ENTITY_THRESHOLD` (3) failures within `ENTITY_WINDOW_MIN` (60), one escalation fires on the
  crossing (count === threshold), not on every subsequent failure.

Recipient: `DEVELOPER_NOTIFICATION_EMAIL` → `ADMIN_NOTIFICATION_EMAIL` fallback.

Still open (future): NotificationBell in-app surfacing; a daily digest of new admin-lane errors.

---

## 9. Retention

- **3-year prod retention policy does NOT apply to this log.** Retention here is **TBD /
  keep indefinitely for now.** Revisit before prod if volume becomes a concern. No archival
  job planned at this stage.

---

## 10. Relationship to existing logging

- **Elavon dashboard** already records gateway-touching transactions — this log intentionally
  *duplicates* a subset of that, but adds: a unified view across origins, workflow/status,
  admin actions, and the application-origin errors Elavon never sees.
- **Existing `[EPG WEBHOOK]`-style debug logs** — before building, confirm we're not adding a
  parallel system; ideally those call sites become `logPaymentError` capture points.

---

## 11. Phasing (build order)

1. ✅ **Migration + `logPaymentError` helper + classifier** (origin/lane/category, `is_retryable`). DONE — migration `20260612000000`, `utils/payment/{logPaymentError,classifyPaymentError}.ts`, types, unit tests.
2. ✅ **Wire the recurring cron capture point** — `supabase/functions/process-overdue-payments` now logs every failed attempt (chained via `retry_of`) + cron-level crashes (application origin).
3. ✅ **Admin Error Log UI** (read-only list + detail) — `app/admin/payments/PaymentErrorLog.tsx`, surfaced as an "Error Log" tab.
4. ✅ **Resolution actions** (acknowledge / resolve / won't-fix / notify developer / single-charge-path retry) + super-admin gate on raw payload. Actions in `app/admin/payments/actions/`.
5. ✅ **Remaining gateway capture points.** Webhook `saleDeclined` (source `hpp_checkout`) + webhook EPG-fetch failure (dev) in `app/api/webhooks/epg/route.ts`; HPP installment-1 decline logged per-attempt inside `ensureStoredCardAndChargeInstallment1` (single capture point — avoids finalize-route poll duplication). Manual-admin charge was already covered in Phase 4 (the only caller of `chargeStoredPaymentInstallment` is the error-log retry, which logs).
6. ✅ **Application-internal detection** (§7). Pricing-computation failure on public + admin order creation; confirmation-email send failure. One-shot sites only (polled paths deliberately not instrumented).
7. ✅ **Notifications + threshold escalation.** `notifyPaymentError` fired from `logPaymentError`: throttled critical-dev alert + per-entity threshold escalation.

**All seven phases complete.** Remaining nice-to-haves are listed inline (§8 in-app bell + digest).

---

## 12. Open questions / next steps

- [ ] Enumerate concrete application-internal error types (§7).
- [ ] Read actual cron + stored-card path + `docs/elavon/` before building retry (§5).
- [ ] Confirm we fold existing `[EPG WEBHOOK]` debug logs into `logPaymentError` rather than
      running a parallel system (§10).
- [ ] Decide `super_admin` gating granularity for raw payloads (§6).
