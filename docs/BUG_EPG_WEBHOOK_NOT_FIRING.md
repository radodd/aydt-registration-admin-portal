# Bug Report: EPG Webhook Not Firing — Batch Status Stuck at `pending`

**Date:** 2026-04-09  
**Reporter:** Ethan Flores  
**Environment:** UAT (sandbox) — `https://uat.api.converge.eu.elavonaws.com`  
**Severity:** Critical — no registration can reach `confirmed` state  
**Status:** ✅ AYDT-side infrastructure fully verified — issue confirmed on Elavon's end

---

## Registered Webhook Endpoints (confirmed with Elavon developer)

| Environment | Registered URL |
|---|---|
| Production | `https://register.aydt.nyc/api/webhooks/epg` |
| QA / Staging | `https://unwilted-coccal-dayton.ngrok-free.dev/api/webhooks/epg` |

Both endpoints were registered in the Elavon merchant portal directly with an Elavon developer (Justin). The QA/staging URL matches `SITE_URL` in `.env.local`.

---

## Observed Behavior

After a user completes payment on the Elavon HPP (Hosted Payment Page), the browser is redirected to the confirmation page. The page polls `GET /api/register/batch-status?id={batchId}` on an interval. Console logs confirm the batch is being read correctly:

```
[batch-status] batch=ef657a73-de2b-496e-bfcc-8d8dfe16bece status=pending
[batch-status] batch=ef657a73-de2b-496e-bfcc-8d8dfe16bece status=pending
[batch-status] batch=ef657a73-de2b-496e-bfcc-8d8dfe16bece status=pending
... (repeats indefinitely)
```

The status never transitions from `pending` → `confirmed`. The `registration_batches.status` column and `payments.state` column remain at `pending` / `pending_authorization` indefinitely. The `[EPG WEBHOOK] received` log line — the very first statement in the webhook handler, before auth or parsing — **never appears**.

---

## Diagnostic Investigation (AYDT-side)

All three originally suspected causes have been ruled out.

### ✅ Ruled out — Webhook URL mismatch

The ngrok tunnel was confirmed active and forwarding correctly during testing:

```
Forwarding   https://unwilted-coccal-dayton.ngrok-free.dev -> http://localhost:3000
Session Status   online
```

The registered QA URL exactly matches `SITE_URL` in `.env.local`. Requests from our own app (registration flow, batch-status polling) pass through the tunnel without issue, confirming it is live and reachable.

### ✅ Ruled out — Basic auth credentials mismatch

Credentials were confirmed identical on both sides via email exchange with Justin:

- `EPG_WEBHOOK_USERNAME` = `aydt_elavon_webhook`
- `EPG_WEBHOOK_PASSWORD` = `wH7$kP2mQ9xL4nR8vT3yJ6bF5cZ1dA0ds`

These match what is configured in the Elavon UAT merchant portal.

### ✅ Ruled out — Endpoint not reachable

A full test payment was completed and the ngrok HTTP request log was captured immediately after. Every request in the registration flow appeared in the ngrok log — but **`POST /api/webhooks/epg` was completely absent**. Elavon never sent a POST to the endpoint.

Sample ngrok HTTP log after completed payment:
```
12:58:24 POST /register/payment    200 OK
12:58:25 POST /register/payment    200 OK
12:59:23 GET  /register/confirmation  200 OK
12:59:24 GET  /api/register/batch-status  200 OK
12:59:26 GET  /api/register/batch-status  200 OK
12:59:28 GET  /api/register/batch-status  200 OK
-- no POST to /api/webhooks/epg --
```

---

## Confirmed Finding

**Elavon's UAT environment is not dispatching the async notification after a completed transaction.** The AYDT webhook handler is correctly implemented, the endpoint is reachable, the tunnel is live, and the credentials match. The notification simply never leaves Elavon's servers.

---

## Questions for Elavon Support (Justin)

1. **Are async notifications fully enabled on the UAT merchant account?** The URL and credentials are registered, but no POST is being dispatched after a completed transaction.

2. **Does the UAT notification system log outbound dispatch attempts?** If so, please share logs for transactions on our merchant account from 2026-04-09 — we expect to see dispatch attempts that should have targeted `https://unwilted-coccal-dayton.ngrok-free.dev/api/webhooks/epg`.

3. **Is there an additional activation step required in UAT** to enable notifications beyond registering the URL and credentials?

4. **Does EPG retry failed notifications (4xx/5xx), and if so, on what schedule?**

---

## Draft Email to Justin

> Hi Justin,
>
> We've completed a full diagnostic on our end and have confirmed that the webhook issue is not with our infrastructure. Here's a summary of what we verified:
>
> - **Webhook URL:** The ngrok tunnel was live and online during testing (`https://unwilted-coccal-dayton.ngrok-free.dev → localhost:3000`). All other requests from our app pass through the tunnel correctly.
> - **Basic auth credentials:** Confirmed identical on both sides — `aydt_elavon_webhook` / the key provided in our earlier email.
> - **Endpoint reachability:** We completed a test payment and captured the full ngrok HTTP request log immediately after. Every request in our registration flow appeared in the log, but there was **no `POST /api/webhooks/epg`** — Elavon never sent the notification.
> - **Server logs:** Our webhook handler logs `[EPG WEBHOOK] received` as its very first line, before any auth or processing. That line never appeared.
>
> Everything checks out on our end. It appears the UAT merchant account is not dispatching async notifications after a completed transaction, even though the endpoint URL and credentials are registered.
>
> Could you check the following on Elavon's side?
> 1. Are async notifications fully activated on our UAT merchant account?
> 2. Does your system log outbound notification dispatch attempts? If so, are there any dispatch attempts recorded for our account on 2026-04-09?
> 3. Is there an additional step required in UAT to enable notifications beyond registering the URL?
>
> Happy to jump on a call if that's easier. Thanks for your help on this.
>
> — Ethan

---

## Affected Files

| File | Relevance |
|---|---|
| [app/api/webhooks/epg/route.ts](../app/api/webhooks/epg/route.ts) | Webhook handler — endpoint EPG should POST to |
| [app/api/register/batch-status/route.ts](../app/api/register/batch-status/route.ts) | Polling endpoint — confirmed stuck at `pending` |
| `.env.local` | `SITE_URL`, `EPG_WEBHOOK_USERNAME`, `EPG_WEBHOOK_PASSWORD` |
