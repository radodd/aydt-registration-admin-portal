# SMS Notifications Architecture

> Status: **Implemented — blocked on Twilio A2P 10DLC compliance for production delivery**
> Last updated: 2026-03-12

---

## What Is Built and Working

All code is complete and tested end-to-end:

| Component | File | Status |
|-----------|------|--------|
| Send utility | `utils/sendSms.ts` | Done — E.164 normalization, best-effort, logs every attempt |
| DB schema | `supabase/migrations/20260313000001_sms_opt_in.sql` | Done — `sms_opt_in`, `sms_verified` on `users`; `sms_notifications` table |
| Phone verification (send code) | `app/actions/sendPhoneVerification.ts` | Done |
| Phone verification (confirm code) | `app/actions/confirmPhoneVerification.ts` | Done |
| SMS opt-out | `app/actions/smsOptOut.ts` | Done |
| User profile opt-in card | `app/(user-facing)/profile/SmsOptInCard.tsx` | Done |
| Class cancellation notify | `app/admin/semesters/actions/cancelClass.ts` | Done — email + SMS per enrolled family |
| Waitlist invite notify | `supabase/functions/process-waitlist/index.ts` | Done |
| Payment overdue notify | `supabase/functions/process-overdue-payments/index.ts` | Done |
| Delivery status webhook | `app/api/webhooks/twilio/route.ts` | Done |

**Twilio reaches the message correctly** — confirmed via Twilio Monitor logs. The message payload, phone number formatting, family lookup, and deduplication all work. The only blocker is carrier compliance (see below).

---

## Twilio Account Setup (Current State)

| Item | Status |
|------|--------|
| Twilio account | Trial — created 2026-03-12 |
| Purchased phone number | Yes — 10DLC long code |
| A2P 10DLC brand registration | Not started |
| A2P 10DLC campaign registration | Not started |
| Personal number verified as caller ID | Needed for trial sending |

**Required env vars** (set in `.env.local` and Vercel):
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX     # the purchased 10DLC number
TWILIO_VERIFY_SERVICE_SID=...        # for opt-in verification flow
```

---

## Why SMS Is Not Delivering (The Blocker)

US carriers (AT&T, Verizon, T-Mobile, etc.) require all business SMS sent from 10-digit long code numbers (10DLC) to be registered under the **A2P 10DLC** program. This is enforced at the carrier level — not something Twilio or the app can bypass.

**Error received:** `30034 — Messages sent from numbers not associated with an approved A2P 10DLC Campaign will not be delivered`

This applies to **all** Twilio accounts (trial and paid) sending to US numbers from a 10DLC number.

---

## What It Costs to Go Live

### One-time registration fees (Twilio charges these, paid to carriers)

| Item | Cost | Notes |
|------|------|-------|
| Upgrade Twilio trial → paid | ~$20 minimum top-up | Required to register A2P |
| A2P Brand registration | $4 one-time | Registers AYDT as a business brand |
| A2P Campaign registration | $15 one-time | Describes use case (appointment/class alerts) |
| **Total one-time** | **~$39** | Paid to Twilio; non-refundable |

### Ongoing monthly costs

| Item | Cost |
|------|------|
| Twilio phone number | ~$1.15/month |
| Outbound SMS | ~$0.0079/message |
| Twilio Verify (opt-in codes) | ~$0.05/successful verification |

| Scenario | Volume | Est. Monthly |
|----------|--------|-------------|
| Normal operations | 100–300 SMS | ~$2–4/mo |
| Active semester | 300–700 SMS | ~$4–7/mo |
| Emergency cancellation blast (100 families) | 100 SMS one-time | ~$1 per blast |

**Realistic ongoing cost: $5–10/month** during active semesters.

### Registration timeline

| Step | Time |
|------|------|
| Upgrade account + top up | Immediate |
| Brand registration approval | 1–2 business days |
| Campaign registration approval | 3–7 business days |
| Total before first SMS delivered | ~1 week |

---

## Steps to Go Live

1. **Upgrade Twilio account** — add a credit card and top up $20 minimum at [console.twilio.com/billing](https://console.twilio.com/billing)

2. **Register A2P Brand** — Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC → Register a Brand
   - Business legal name: AYDT (or full legal entity name)
   - EIN / tax ID
   - Business address
   - Business type: Private for-profit

3. **Register A2P Campaign** — after brand approval (~1–2 days):
   - Use case: `Low Volume Mixed` or `Notifications` ($15 one-time)
   - Sample messages:
     - `AYDT: Ballet 1A on Wednesday is canceled. Reason: instructor illness. Contact us at aydt.nyc`
     - `AYDT: A spot opened in Jazz 2. Accept by [date]: aydt.nyc/waitlist/accept/[token]`
     - `AYDT: A payment of $X for Emma is overdue. Update: aydt.nyc/payment`

4. **Link phone number to campaign** — Console → Phone Numbers → Manage → Active Numbers → select number → Messaging → assign campaign

5. **No code changes needed** — the app is already fully implemented.

---

## Alternative: Toll-Free Number (Faster Approval)

Instead of a 10DLC long code, purchase a **toll-free number** (`+1-8XX-XXX-XXXX`). These use "Toll-Free Verification" instead of A2P 10DLC:
- Simpler form, approval typically 2–3 business days
- Same per-message pricing (~$0.0079)
- Number cost: ~$2/month (slightly more than 10DLC)
- One-time verification fee: free (no carrier fee)

This is a good option if you want to go live sooner and avoid the $15 campaign registration fee.

---

## Provider: Twilio

**Why Twilio:**
- Built-in phone verification via Twilio Verify — satisfies TCPA opt-in requirements
- Delivery status webhooks (mirrored alongside existing Resend email webhooks)
- Reliable at studio scale

**Do not use:**
- AWS SNS — no built-in opt-in management
- Resend — email only, no SMS

---

## When SMS Is Sent

SMS is for **time-sensitive operational alerts only**.

| Event | Channel |
|-------|---------|
| Class cancelled | Email + SMS |
| Waitlist spot opened | Email + SMS |
| Payment overdue | Email + SMS |
| Semester published | Email only |
| Marketing / newsletters | Email only |

All messages are prefixed `AYDT: ` and capped at 160 characters.

---

## Opt-In Flow

1. Parent goes to `/profile` → SMS Notifications card
2. Enters phone number + checks consent checkbox
3. `sendPhoneVerification` server action calls Twilio Verify → 6-digit code sent
4. Parent enters code → `confirmPhoneVerification` verifies with Twilio
5. On success: `sms_opt_in = true`, `sms_verified = true` written to `users` table

SMS is only sent when both `sms_opt_in = true` AND `sms_verified = true`.

---

## Testing Checklist

- [x] Phone number E.164 normalization (`8087285029` → `+18087285029`)
- [x] Family lookup via schedule-level registration query
- [x] Duplicate family deduplication (one SMS per family even with 2+ dancers)
- [x] `sms_notifications` row inserted on every attempt (success or failure)
- [x] Twilio receives message request (confirmed in Twilio Monitor logs)
- [ ] End-to-end delivery to real device (blocked on A2P 10DLC)
- [ ] Delivery webhook updates `sms_notifications.status` to `delivered`
- [ ] Opt-out: `sms_opt_in = false` → no SMS sent on next trigger
