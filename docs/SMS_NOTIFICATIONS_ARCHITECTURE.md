# SMS Notifications Architecture

> Status: **Planned — not yet implemented**
> Last updated: 2026-03-11

This document describes the planned SMS notification system for the AYDT registration portal. Build this after the core email infrastructure is stable.

---

## Provider: Twilio

**Why Twilio:**
- Direct analog to Resend (dedicated communication service, not infra-level)
- Built-in phone verification via Twilio Verify — satisfies TCPA opt-in requirements with minimal custom code
- Delivery status webhooks (parallel to existing Resend webhooks)
- Deno-compatible SDK for Edge Functions
- Affordable at studio scale

**Do not use:**
- AWS SNS — no built-in opt-in management, operational overhead not worth it
- Resend — email only, no SMS

**Required environment variables:**
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER        # purchased Twilio number, e.g. +15551234567
TWILIO_VERIFY_SERVICE_SID # for phone verification flow
```

Add to `.env.local` and Vercel environment variables.

---

## Estimated Cost (US, 2026 pricing)

| Item | Cost |
|------|------|
| Local phone number | ~$1.00/month |
| Outbound SMS | ~$0.0079/message |
| Twilio Verify (phone verification) | ~$0.05/successful verification |

| Scenario | SMS Volume | Est. Monthly Cost |
|----------|-----------|-------------------|
| Normal operations | 100–300 SMS/mo | ~$2–4/mo |
| Active semester | 300–700 SMS/mo | ~$4–7/mo |
| Emergency blast (500 families) | 500 SMS one-time | ~$5 per blast |
| Initial setup (verifications) | 50–100 first month | ~$3–6 one-time |

**Realistic monthly budget: $5–15/month** during active semesters, nearly $0 off-season.

---

## When to Send SMS

SMS is for **time-sensitive operational alerts only** — if the user needs to know within 1–6 hours.

| Event | Priority | Channel |
|-------|----------|---------|
| Class cancelled | HIGH | Email + SMS |
| Waitlist spot opened | HIGH | Email + SMS |
| Payment overdue | HIGH | Email + SMS |
| Emergency studio closure | HIGH | Email + SMS |
| Semester published | MEDIUM | Email only |
| Newsletter / marketing | LOW | Email only |

Keep every SMS under 160 characters. Always prefix `AYDT: ` and end with `aydt.nyc` or a specific deep link.

**Example messages:**
```
AYDT: Pre-Ballet 1 today at 4pm is canceled due to instructor illness. Details: aydt.nyc
AYDT: A spot opened in Jazz Level 2. Accept by [date]: aydt.nyc/waitlist/accept/[token]
AYDT: A payment of $X for Emma is overdue. Update: aydt.nyc/payment
```

---

## Who Receives SMS

| Recipient | Triggers |
|-----------|---------|
| Parents / guardians | Child class cancellation, waitlist opening, payment overdue, emergency announcements |
| Adult students | Own class cancellation, waitlist opening, payment overdue |
| Staff | (future: teacher absence, coverage requests — separate internal flow) |

Opt-in is per-user, not per-dancer. One parent receives SMS for all their children.

---

## DB Schema

### Extend `users` table
```sql
ALTER TABLE users
  ADD COLUMN sms_opt_in   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN sms_verified BOOLEAN NOT NULL DEFAULT FALSE;
-- phone_number already exists as nullable text
```

### New `sms_notifications` table
```sql
CREATE TABLE sms_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  phone_number TEXT NOT NULL,
  event_type   TEXT NOT NULL,  -- 'class_cancelled' | 'waitlist_opening' | 'payment_failed' | 'emergency_blast'
  body         TEXT NOT NULL,
  twilio_sid   TEXT,
  status       TEXT NOT NULL DEFAULT 'queued', -- queued | sent | delivered | failed
  sent_at      TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Opt-In Flow

**Surfaces:** Profile settings page + signup flow for new parents.

1. User enters phone number + checks consent checkbox:
   `☐ Receive SMS notifications for urgent updates (class cancellations, waitlist openings)`
2. Server action calls Twilio Verify → sends 6-digit code to phone
3. User enters code → server action verifies with Twilio
4. On success: `sms_verified = true`, `sms_opt_in = true` written to `users`

**Server actions:**
- `app/actions/sendPhoneVerification.ts` — `client.verify.v2.services(SID).verifications.create({ to, channel: 'sms' })`
- `app/actions/confirmPhoneVerification.ts` — `.verificationChecks.create({ to, code })` → update user row

---

## SMS Sending Utility

Create `utils/sendSms.ts`:

```typescript
import twilio from "twilio";
import { createClient } from "@/utils/supabase/server";

export async function sendSms(
  to: string,
  body: string,
  eventType: string,
  userId?: string
): Promise<string | null> {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  try {
    const msg = await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER!,
      to,
      body,
    });
    const supabase = await createClient();
    await supabase.from("sms_notifications").insert({
      user_id: userId ?? null,
      phone_number: to,
      event_type: eventType,
      body,
      twilio_sid: msg.sid,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    return msg.sid;
  } catch (err) {
    // log failure, never throw — SMS is best-effort alongside email
    await createClient().then(s => s.from("sms_notifications").insert({
      user_id: userId ?? null,
      phone_number: to,
      event_type: eventType,
      body,
      status: "failed",
    }));
    return null;
  }
}
```

**Rule:** SMS is always best-effort. Never throw or block the primary flow if SMS fails.

---

## Integration Points

### A. Waitlist Opening
**File:** `supabase/functions/process-waitlist/index.ts`

After the existing Resend email send, add:
```typescript
// Fetch sms_opt_in, sms_verified alongside existing parent query
if (parent.sms_opt_in && parent.sms_verified && parent.phone_number) {
  await sendSms(
    parent.phone_number,
    `AYDT: A spot opened in ${sessionName}. Accept by ${holdUntil}: aydt.nyc/waitlist/accept/${token}`,
    "waitlist_opening",
    parent.id
  );
}
```

### B. Payment Overdue
**File:** `supabase/functions/process-overdue-payments/index.ts`

After marking installment overdue:
```typescript
if (parent.sms_opt_in && parent.sms_verified && parent.phone_number) {
  await sendSms(
    parent.phone_number,
    `AYDT: A payment of $${amount} for ${dancerName} is overdue. Update: aydt.nyc/payment`,
    "payment_failed",
    parent.id
  );
}
```

### C. Class Cancellation (NEW)
**File:** `app/admin/semesters/actions/cancelClass.ts`

New server action triggered from session management UI:
1. Mark session cancelled in DB
2. Fetch all registered families for that session
3. For each family: send Resend email + SMS (if opted in)

```
AYDT: [Class name] on [day] at [time] is canceled. Details sent to your email. aydt.nyc
```

### D. Emergency SMS Blast (NEW)
**File:** `app/admin/notifications/actions/sendSmsBlast.ts`

New admin dashboard panel (mirrors existing email broadcast UI):
- Select audience: all opted-in parents / parents of active session / by division
- Type message (UI enforces 140-char limit to leave room for `AYDT: ` prefix)
- Confirm + send
- Log all sends to `sms_notifications`

---

## Delivery Status Webhook

**File:** `app/api/webhooks/twilio/route.ts`

Mirrors existing `app/api/webhooks/resend/route.ts`:
```typescript
import { validateRequest } from "twilio";

export async function POST(req: Request) {
  // verify Twilio signature
  const valid = validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    req.headers.get("x-twilio-signature") ?? "",
    webhookUrl,
    body
  );
  if (!valid) return new Response("Unauthorized", { status: 401 });

  // update sms_notifications.status + delivered_at by twilio_sid
}
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_sms_fields.sql` | Add `sms_opt_in`, `sms_verified` to `users`; create `sms_notifications` table |
| `utils/sendSms.ts` | Twilio send wrapper + DB log |
| `app/actions/sendPhoneVerification.ts` | Twilio Verify initiation |
| `app/actions/confirmPhoneVerification.ts` | Twilio Verify check + update user |
| `supabase/functions/process-waitlist/index.ts` | Add SMS alongside Resend email |
| `supabase/functions/process-overdue-payments/index.ts` | Add SMS for overdue installments |
| `app/admin/semesters/actions/cancelClass.ts` | New: cancel session + notify email + SMS |
| `app/admin/notifications/actions/sendSmsBlast.ts` | New: emergency broadcast |
| `app/api/webhooks/twilio/route.ts` | New: delivery status webhook |
| `types/index.ts` | Add `SmsNotification` type; extend user fields |

---

## Testing Checklist

- [ ] Opt-in flow: enter phone → verify code → `sms_opt_in = true` in Supabase
- [ ] Waitlist SMS: manually invoke `process-waitlist` with test entry → SMS received + `sms_notifications` row inserted
- [ ] Payment overdue SMS: test overdue installment → SMS sent
- [ ] Class cancellation: trigger `cancelClass` from admin UI → both email and SMS sent
- [ ] Delivery webhook: Twilio dashboard confirms delivery → `sms_notifications.status = 'delivered'`
- [ ] Opt-out: set `sms_opt_in = false` → next trigger sends no SMS
- [ ] SMS too long: add 160-char guard in `sendSms.ts`, log warning
