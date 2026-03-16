# EPG Integration — Manual Steps

All items that require human action outside of code. Complete these before going live.

---

## 1. Environment Variables

### Local (`.env.local`)

| Variable | Action |
|---|---|
| `EPG_WEBHOOK_USERNAME` | Set to any strong string (e.g. `aydt_webhook`) — must match what you register in the Elavon portal |
| `EPG_WEBHOOK_PASSWORD` | Set to a strong random password — must match the Elavon portal |

Both are currently placeholder values. The webhook handler will return `401` and EPG will never confirm payments until these are set and registered.

### Vercel (Production)

Set the same variables in the Vercel dashboard under **Settings → Environment Variables** for the production environment:
- `EPG_WEBHOOK_USERNAME`
- `EPG_WEBHOOK_PASSWORD`
- `EPG_MERCHANT_ALIAS` (cert: `mybmf7ybddydqjc8kb6mx4xk82t7`)
- `EPG_SECRET_KEY`
- `EPG_BASE_URL` (`https://uat.api.converge.eu.elavonaws.com` for sandbox)

---

## 2. Register the Webhook URL in the Elavon Portal

**Portal (sandbox):** https://uat.converge.eu.elavonaws.com/login
**Account:** ethanf.flores+cert@gmail.com

Steps:
1. Log in
2. Navigate to webhook/notification settings
3. Register the URL: `https://<your-domain>/api/webhooks/epg`
   - For local dev: `https://<ngrok-id>.ngrok.io/api/webhooks/epg` (start ngrok first: `ngrok http 3000`)
4. Set credentials to match `EPG_WEBHOOK_USERNAME` and `EPG_WEBHOOK_PASSWORD` in your `.env.local`
5. Save

> Without this step, EPG silently drops all payment notifications. Batches stay `pending` forever and no confirmation emails are sent — even though money is collected.

---

## 3. Apply Database Migrations

Two Phase 3/4 migrations need to be pushed to your Supabase instance.

```bash
supabase db push
```

Or apply individually:
```bash
supabase migration up
```

Migrations to apply (in order):
1. `supabase/migrations/20260316000002_epg_stored_payment.sql` — creates `shoppers`, `stored_payment_methods` tables and adds `stored_payment_method_id` to `registration_batches`
2. `supabase/migrations/20260316000003_installment_charge_tracking.sql` — adds `transaction_id`, `charge_attempt_count`, `last_charge_error` to `batch_payment_installments` and adds `failed` status

**Verify in Supabase Studio:**
- `shoppers` table exists with RLS enabled
- `stored_payment_methods` table exists with RLS enabled
- `registration_batches` has `stored_payment_method_id` column
- `batch_payment_installments` has `transaction_id`, `charge_attempt_count`, `last_charge_error` columns
- `batch_payment_installments` status check constraint includes `'failed'`

---

## 4. Sandbox Smoke Tests

Run these before any real installment plan checkouts to verify the Phase 3 card storage flow works end-to-end.

### 4a. Verify `hostedCard` field exists on payment session

With `doCapture: false`, EPG should return a `hostedCard` resource URL in the session result after HPP completion. If this field is missing or named differently, the card storage flow will silently skip.

Steps:
1. Start dev server + ngrok
2. Complete an installment checkout with test card `4000000000000002`
3. Check server logs for: `[epg-webhook] Stored payment method <uuid> linked to batch <batchId>`
4. If you see `Session ... has no hostedCard or hostedAchPayment`, the field name differs from the docs — inspect the raw session JSON returned by `fetchEpgPaymentSession()` and update `EpgPaymentSession.hostedCard` in `utils/payment/epg.ts` accordingly

### 4b. Verify shopper list response envelope

The `fetchEpgShopperByReference()` function expects `{ list: EpgShopper[] }` as the EPG response envelope. If EPG returns a different shape (e.g. a root-level array), the function will return `null` every time and create duplicate shoppers on each checkout.

Steps:
1. Create a shopper via `createEpgShopper({ customReference: "test-user-id" })` in a scratch script
2. Call `fetchEpgShopperByReference("test-user-id")` and log the raw response
3. If it returns `null` despite a shopper existing, the envelope is different — update the parsing in `utils/payment/epg.ts`:
   ```typescript
   // Current:
   const list = Array.isArray(body) ? body : (body as { list?: EpgShopper[] }).list ?? [];
   // If EPG returns { items: [...] }, change to:
   const list = (body as any).items ?? (body as any).list ?? (Array.isArray(body) ? body : []);
   ```

---

## 5. Schedule `process-overdue-payments` to Run Daily

The edge function that marks overdue installments and auto-charges stored payment methods must run on a daily schedule. It is not currently scheduled.

**Option A — Supabase Dashboard (recommended):**
1. Go to Supabase Dashboard → Edge Functions
2. Find `process-overdue-payments`
3. Click **Schedule**
4. Set cron: `0 9 * * *` (9am UTC daily)

**Option B — pg_cron (if `pg_net` extension is enabled):**

Add a migration that calls the function URL with the service role key. Requires `pg_net` and the function's URL — check if `pg_net` is enabled in your Supabase project before using this approach.

---

## 6. Production Checklist (before going live)

- [ ] All env vars set in Vercel production environment
- [ ] Webhook URL registered in Elavon **production** portal (not just sandbox) — production URL: `https://aydt.com/api/webhooks/epg`
- [ ] `EPG_BASE_URL` updated to production endpoint (remove `uat.` prefix) once Elavon provides it
- [ ] Migrations applied to production Supabase instance
- [ ] `process-overdue-payments` scheduled in production
- [ ] Full sandbox E2E test run completed (see `docs/EPG_ROADMAP.md` § Phase 5) before switching to production credentials
- [ ] Source IP allowlist considered: add Elavon's outbound IP ranges to webhook middleware if they publish them (see `docs/EPG_WEBHOOK_ARCHITECTURE.md` § Security)

---

## Summary

| Step | When | Blocking? |
|---|---|---|
| Set `EPG_WEBHOOK_USERNAME` / `EPG_WEBHOOK_PASSWORD` in `.env.local` | Before any local webhook testing | Yes — webhook returns 401 without it |
| Register webhook URL in Elavon sandbox portal | Before any payment testing | Yes — EPG drops all events without it |
| Apply 2 DB migrations | Before any Phase 3/4 code runs | Yes — queries will fail |
| Smoke test `hostedCard` field | After first installment checkout | Yes — card storage silently skips otherwise |
| Smoke test shopper list envelope | After first shopper creation | No — worst case is duplicate shopper rows |
| Schedule `process-overdue-payments` daily | Before go-live | No — auto-charge won't run without it |
| Repeat portal registration + env vars for production | Before go-live | Yes |
