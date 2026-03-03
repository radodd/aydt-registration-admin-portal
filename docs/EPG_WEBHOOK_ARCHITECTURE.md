# EPG Webhook — Architectural Analysis

Analysis of the `/api/webhooks/epg` handler, the role of the webhook in the payment lifecycle,
and the design rationale behind every architectural decision.

---

## 1. Why a Webhook Is Necessary

This system uses EPG's **Hosted Payment Page (HPP)** model. The browser leaves your application,
visits EPG's domain, and returns via a redirect after the payment completes. That redirect —
the `returnUrl` — is the user-facing path only. It is not a reliable signal of payment success.

**The redirect cannot be trusted to confirm payment for three reasons:**

**a. The redirect can be spoofed.** Anyone who knows the `returnUrl` pattern
(`/register/confirmation?semester=...&batch=...`) can navigate to it directly without ever paying.
If the confirmation page called `markBatchConfirmed()` on load, an attacker could confirm their own
registration for free. The implementation correctly avoids this: the confirmation page does not call
any write action. It only reads state and clears localStorage. The webhook is the sole writer.

**b. The redirect can fail.** If the user's browser crashes, loses network, or they close the tab on
the EPG page before the redirect lands, the server never receives the success signal via the redirect.
The user paid but sits in `pending_payment` forever, no confirmation email is sent, and their hold
expires. Without the webhook, this is an irrecoverable failure requiring manual admin intervention
for every such case.

**c. The redirect carries no authoritative data.** EPG appends query parameters to `returnUrl`, but
these are client-controlled strings. They should never be trusted as proof of payment. The webhook
correctly ignores the redirect entirely for confirmation logic and instead uses a server-to-server
fetch (`fetchEpgTransaction(resource)`) authenticated with the API key.

The webhook is a direct server-to-server call from EPG's infrastructure to yours, authenticated via
HTTP Basic credentials configured in the merchant portal. It is the only delivery channel that is
both trustworthy and reliable.

---

## 2. Architectural Implications

The redirect and the webhook are **two separate confirmation channels** with different properties:

| Channel | Who initiates | Trustworthy | Guaranteed delivery | Speed |
|---|---|---|---|---|
| Redirect (`returnUrl`) | User's browser | No | No | Immediate (if it arrives) |
| Webhook (`/api/webhooks/epg`) | EPG's servers | Yes | Yes (with retries) | ~1–10 seconds after event |

This dual-channel architecture creates a **deliberate timing gap**: the user lands on
`/register/confirmation` before the webhook has processed. The confirmation page therefore cannot
assume the batch is already `confirmed` when it renders. It must handle the `pending_payment` state
gracefully — `BatchConfirmationGuard` polls `GET /api/register/batch-status` every 2 seconds for up
to 30 seconds, waiting for the webhook to write.

This is correct. The confirmation page is a presentation layer. It should not be a transaction
processor.

The webhook handler at `app/api/webhooks/epg/route.ts` owns the full confirmation lifecycle:
`payments` → `registration_batches` → `registrations` → email. These are the four side effects that
must happen exactly once. By concentrating them in a single endpoint with idempotency guards, they
cannot be triggered by any other path.

---

## 3. Risks Without a Webhook

If the webhook is not implemented or not registered in the merchant portal:

- **Registrations are never confirmed.** All batches remain `pending_payment`. No seat is secured.
- **Emails are never sent.** Parents receive no receipt or confirmation.
- **Holds expire.** After 30 minutes the seats are released — even though the family paid.
- **Payment is permanently orphaned.** Money was collected but no corresponding confirmed enrollment
  exists. Refunds or reconciliation become a manual process.
- **No installment is marked paid.** The payment dashboard shows installment 1 as `scheduled`
  indefinitely. Overdue logic would eventually flag it incorrectly.

The redirect alone cannot recover any of these. Even if confirmation were attempted on redirect
arrival, it is too unreliable and insecure to use as the sole mechanism.

---

## 4. Production Payment Lifecycle

```
[User] → createRegistrations()
           → registration_batches: pending
           → registrations: pending_payment (hold_expires_at = now+30m)
           → batch_payment_installments: scheduled

[User] → createEPGPaymentSession()
           → EPG Order created
           → EPG PaymentSession created
           → payments: pending_authorization
           → browser.location = EPG HPP URL

[EPG HPP] → user enters card → EPG processes charge

[EPG]  → POST /api/webhooks/epg  (saleAuthorized)
           → validate Basic auth
           → GET EPG transaction  (authoritative fetch)
           → payments: state = authorized
           → registration_batches: status = confirmed  ← only if pending_payment (idempotent)
           → registrations: status = confirmed
           → batch_payment_installments[1]: status = paid
           → Resend: confirmation email

[EPG]  → browser redirect to returnUrl
           → ConfirmationCleanup clears localStorage
           → BatchConfirmationGuard polls until confirmed

[EPG]  → POST /api/webhooks/epg  (saleCaptured)        ← later
           → payments: state = captured
           → batch already confirmed → early return (idempotent)

[EPG]  → POST /api/webhooks/epg  (saleSettled)         ← at settlement
           → payments: state = settled
           → batch already confirmed → early return (idempotent)
```

The lifecycle correctly distinguishes between transient events (`authorized`, `captured`, `settled`)
and terminal failure events (`declined`, `voided`). All three success events trigger the same
confirmation path. The idempotency guard on `registration_batches` (`.eq("status", "pending_payment")`)
ensures confirmation happens only once regardless of how many success webhooks arrive.

---

## 5. Alternative Approaches

**a. Confirm on redirect arrival**
Broken (spoofable, unreliable). Categorically inappropriate for any financial transaction.

**b. Polling from the confirmation page**
The client polls the server, which reads `payments`. This works as a UX layer for showing a
processing spinner, but it does not replace the webhook — it only reads state that the webhook must
write. Currently used as a complement via `BatchConfirmationGuard`, not a substitute.

**c. Synchronous payment (client-side card element)**
Approaches like Stripe Elements keep the user on your page and resolve the payment promise
synchronously before redirecting. This eliminates the redirect reliability problem but introduces
PCI scope on your domain. EPG's HPP model specifically achieves SAQ A (minimal PCI scope) by
keeping all card data on Elavon's domain. Switching to a synchronous client-side integration
would require a full PCI SAQ D audit. Not appropriate here.

**d. Server-initiated charge (no HPP)**
You could create a charge server-side via EPG's API, handle the response synchronously, and confirm
immediately. Architecturally cleaner — but again puts cardholder data on your server. Not
appropriate for this context.

**e. Webhooks only, no redirect**
Technically viable: send the user to a polling/waiting page and drive the UX forward entirely via
webhook + Supabase Realtime. This eliminates dual-channel complexity but degrades UX if the webhook
is slow (user waits 1–5 seconds at a spinner). The current hybrid approach is the industry-standard
compromise.

---

## 6. Security Considerations

### HTTP Basic auth (timing-safe comparison)

The handler uses `crypto.timingSafeEqual` for constant-time comparison, which prevents timing oracle
attacks where an attacker could infer prefix matches by measuring response latency. The padding logic
(`padEnd` + `slice`) normalizes length before comparison — required because `timingSafeEqual` throws
on unequal-length buffers.

> **Note:** The handler returns `401` on invalid auth. Verify whether EPG treats `4xx` responses as
> permanent failures (no retry) or transient failures (retry). If EPG silently drops on `4xx`, a
> misconfigured credential will produce zero retries and zero visibility. In that case, returning
> `200` with a warning log and an alert is safer from an operational standpoint — though it obscures
> the attack signal. Check the EPG merchant portal documentation.

### Source IP allowlisting

HTTP Basic auth validates the credential but not the source. If EPG publishes outbound IP ranges
(many processors do), add a middleware check rejecting requests from any IP not on that list.
This is defense-in-depth against credential theft — an attacker with stolen credentials but the
wrong IP is blocked at the perimeter.

### HMAC signature validation

EPG's current notification format does not include an HMAC signature over the body. If EPG adds
this capability in a future API version, adopt it — HMAC validation is strictly stronger than Basic
auth because it also validates body integrity, not just the caller's identity.

### Never trust the notification body

The handler treats the notification body as untrusted metadata. The `resource` URL in the body is
used only to locate what to fetch — the fetch itself is authenticated with the API key. This is the
canonical defense against notification injection attacks where an attacker sends a crafted webhook
body claiming a transaction is `authorized` for a batch they chose.

### Replay protection (double fence)

**Application-level:** Terminal-state check (`authorized`, `captured`, `settled`, `declined`,
`voided`, `refunded`) at the top of the handler fast-paths duplicate deliveries without touching
the DB.

**Database-level:** The `registration_batches` update uses `.eq("status", "pending_payment")`.
Even if two simultaneous webhook deliveries both pass the application check (race condition), only
one wins the conditional DB update. The loser receives `null` from `.maybeSingle()` and returns
early. This is the true atomicity guarantee.

### Node runtime (not Edge)

`export const runtime = "nodejs"` is correct. Edge runtimes lack `crypto.timingSafeEqual`, have
reduced environment variable access, and may lack persistent DNS resolution needed for the EPG API
call. Payment webhooks belong on Node runtime.

---

## 7. Operational Considerations

### EPG retry behavior

The handler returns `200 { ok: true }` for all handled cases including early exits. It returns `500`
only when it cannot reach the EPG API to fetch the authoritative transaction. This is correct: EPG
should retry when you cannot verify the transaction, but should not retry when the event was already
processed or is irrelevant.

Document the exact retry schedule EPG uses (typically: 3 retries at 5min, 30min, 2hr intervals) and
ensure the handler can process the same event at any of those intervals without double-confirmation.

### Race condition: simultaneous deliveries

EPG may send the same event twice simultaneously. The DB-level conditional update resolves this
correctly — the first delivery wins, the second sees zero rows updated and returns `200` silently.
No distributed lock is needed.

### Email is the only non-idempotent side effect

Steps 8 and 9a–9c (payments, registration_batches, registrations) are fully idempotent. Step 9d
(email) is not — if the webhook ran twice and both passes got past the idempotency guard, two emails
would be sent. The guard at the `if (!batch)` check prevents this: only the first delivery updates
`registration_batches` from `pending_payment` → `confirmed` and receives a non-null `batch`. The
second delivery sees zero rows updated, `batch` is `null`, and returns early before email is sent.

### Failure modes

| Failure | Outcome | Recovery |
|---|---|---|
| EPG API down (`fetchEpgTransaction` throws) | Returns `500` → EPG retries | Automatic |
| Supabase down during `payments` update | `payments` stale, confirmation still attempted | Partial — retry heals it |
| Supabase down during batch confirmation | `registration_batches` not confirmed | EPG retries → heals automatically |
| Resend API fails | Email not sent; batch is confirmed | Manual re-send or admin notification |
| Webhook credential wrong in portal | `401` returned; EPG may not retry | Fix credential in merchant portal |
| Webhook URL unreachable (DNS, deploy gap) | EPG retries until TTL | Ensure route is deployed before going live |

**Most operationally dangerous failure:** Supabase partial write — `payments` updated to `authorized`
but `registration_batches` still `pending_payment`. The application-level idempotency check would
pass on retry (payment is already terminal), but the batch update would succeed because it is still
`pending_payment`. This means the system **does not self-heal on retry in this case**. Consider
checking both `payments.state` and `registration_batches.status` independently rather than using the
payment terminal-state check as a combined gate.

### Logging

Current logs include `batchId`, `eventType`, and `transaction.id` at key lifecycle points. For
production observability, also log:

- `notification.id` (EPG's event ID) at the start of every webhook — enables correlation with EPG's
  delivery logs
- Structured JSON for all log lines to enable log aggregation queries
- Metrics on `sendConfirmationEmail` latency and failure rate

---

## 8. Pre-Production Checklist

- [ ] Register webhook URL in EPG merchant portal (`https://<domain>/api/webhooks/epg`)
- [ ] Set `EPG_WEBHOOK_USERNAME` and `EPG_WEBHOOK_PASSWORD` in Vercel production env vars — must match portal
- [ ] Confirm the webhook URL is the production domain, not `localhost` or an ngrok tunnel
- [ ] Run sandbox test: trigger `saleAuthorized` → verify `registration_batches.status = confirmed`
- [ ] Run sandbox test: trigger duplicate delivery → verify only one email sent
- [ ] Run sandbox test: trigger `saleDeclined` → verify batch remains `pending_payment`
- [ ] Confirm EPG's retry policy for `500` responses matches your expected downtime envelope
- [ ] Verify EPG outbound IP ranges and consider adding allowlist middleware
- [ ] Confirm EPG notification `id` field is always present (needed for idempotency logging)
