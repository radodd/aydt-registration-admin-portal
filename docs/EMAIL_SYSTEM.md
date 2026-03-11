# Email System — Architecture & Template Variable Reference

## Overview

The AYDT admin portal email system is a broadcast email wizard backed by Resend for delivery. Administrators compose emails through a multi-step wizard, select recipients through a hierarchical class selector, review a deduplicated recipient list, then send or schedule. Every sent email is snapshotted to the database for historical auditing.

---

## Wizard Flow

```
1. Setup          → Subject, sender name/email, reply-to, signature toggle
2. Recipients     → Hierarchical class selector + recipient review panel
3. Design         → TipTap rich text editor (supports template variables)
4. Preview & Send → Final review, send now or schedule for future time
```

Each step auto-persists on navigation. The draft is stored in the `emails` table. Recipient selections are stored in `email_recipient_selections`. At send/schedule time, a resolved snapshot is written to `email_recipients`.

---

## Recipient Selection Model

Recipients are selected at multiple levels of granularity:

| Selection Type      | Scope                                             |
|---------------------|---------------------------------------------------|
| `semester`          | All families with any registration in a semester  |
| `class`             | All families enrolled in any session of a class   |
| `session`           | All families enrolled in one specific day/time    |
| `subscribed_list`   | All subscribed portal users + external subscribers|
| `manual`            | Individual users or external email addresses      |

**Key behavior:**
- **One email per family.** The primary parent (`is_primary_parent = true`) is the canonical recipient regardless of how many dancers a family has enrolled.
- **Deduplication** happens at the family level. A family appearing in multiple selections receives exactly one email.
- **Instructor inclusion** can be toggled per class/session selection. Instructors are matched best-effort against portal accounts by `first_name + last_name`.
- **Family exclusions** can be applied in the recipient review panel before sending. Removals are stored as `is_excluded = true` rows in `email_recipient_selections`.
- **Unsubscribed users** are automatically filtered out at resolution time (checked via `email_subscriptions.is_subscribed`).

---

## Send Flow

### Inline path (≤ 500 recipients)
1. `resolveRecipients()` — builds the deduplicated family list from DB
2. Snapshot written to `email_recipients` (with `family_id` + `dancer_context`)
3. `emails.status` → `'sending'`
4. Emails sent in batches of 100 via Resend API
5. Each delivery logged to `email_deliveries` (tracks Resend message ID)
6. `emails.status` → `'sent'` (or `'failed'` if all recipients failed)

### Edge function path (> 500 recipients)
1. Same resolution + snapshot steps
2. Supabase Edge Function `send-email-broadcast` is invoked asynchronously
3. Edge function handles the send loop and stamps final status

### Scheduled send
- Same resolution + snapshot at schedule time
- `emails.status` → `'scheduled'` + `scheduled_at` timestamp
- Actual send is triggered by a pg_cron job

---

## Delivery Tracking

All delivery events are recorded in `email_deliveries`:

| Status      | When set                                    |
|-------------|---------------------------------------------|
| `pending`   | Row inserted (before Resend response)       |
| `sent`      | Resend API accepted the message             |
| `delivered` | Resend webhook: delivery confirmed          |
| `bounced`   | Resend webhook: hard/soft bounce            |
| `complained`| Resend webhook: spam complaint              |

Open and click events are also tracked via Resend webhooks at `api/webhooks/resend/`.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/admin/emails/EmailForm.tsx` | Wizard orchestrator, `useReducer` state machine |
| `app/admin/emails/steps/RecipientsStep.tsx` | Hierarchical selector + review panel UI |
| `app/admin/emails/steps/DesignStep.tsx` | TipTap editor with variable insertion toolbar |
| `app/admin/emails/actions/resolveRecipients.ts` | Authoritative family-based recipient resolution |
| `app/admin/emails/actions/previewResolvedFamilies.ts` | Live preview of recipients before draft is saved |
| `app/admin/emails/actions/previewRecipientCount.ts` | Fast family count for count badge |
| `app/admin/emails/actions/updateEmailDraft.ts` | Persists draft + recipient selections to DB |
| `app/admin/emails/actions/sendEmailNow.ts` | Resolves, snapshots, and sends inline or via edge function |
| `app/admin/emails/actions/scheduleEmail.ts` | Resolves, snapshots, and schedules |
| `utils/resolveEmailVariables.ts` | `{{token}}` substitution engine |
| `utils/prepareEmailHtml.ts` | Normalizes email HTML for cross-client rendering |

---

## Template Variable Reference

Variables are written in templates as `{{variable_name}}`. Unknown variables are left in place unchanged, so future variables can be added to templates before the engine supports them.

Resolution happens in `utils/resolveEmailVariables.ts` via `resolveEmailVariables(html, context)`.

---

### ✅ Currently Implemented

| Variable | Example Output | Notes |
|----------|---------------|-------|
| `{{parent_name}}` | `Alex Johnson` | Full name of the primary parent (first + last) |
| `{{student_name}}` | `Emma Johnson` | Single dancer name — works in confirmation emails and waitlist; in broadcast emails the edge function handles this, inline path sends empty |
| `{{semester_name}}` | `Spring 2026` | Derived from the first non-manual selection on the email |
| `{{session_name}}` | `Ballet Fundamentals` | Class name from the first non-manual selection |

---

### 🔲 Planned / Not Yet Implemented

These variables are not currently resolved but are recommended for the template editor variable picker. They represent real data available in the DB and should be added to `resolveEmailVariables.ts` and wired into context objects.

#### Parent / Account
| Variable | Example Output | Data Source |
|----------|---------------|-------------|
| `{{parent_first_name}}` | `Alex` | `users.first_name` of primary parent |
| `{{parent_last_name}}` | `Johnson` | `users.last_name` of primary parent |
| `{{parent_email}}` | `alex@example.com` | `users.email` |
| `{{parent_phone}}` | `(555) 867-5309` | `users.phone_number` |

#### Students / Dancers
| Variable | Example Output | Notes |
|----------|---------------|-------|
| `{{student_first_name}}` | `Emma` | First name of a single dancer — not applicable for multi-dancer broadcast emails |
| `{{student_list}}` | `Emma, Rose` | Comma-separated list of all dancer names in the family enrolled in selected classes |
| `{{student_count}}` | `2` | Number of dancers in the family included in the send |
| `{{student_enrollment_summary}}` | `Emma → Ballet Mon 4:30 PM; Rose → Jazz Wed 5:00 PM` | Per-dancer class context (pulled from `dancer_context` JSONB on `email_recipients`) |

#### Class / Session
| Variable | Example Output | Data Source |
|----------|---------------|-------------|
| `{{class_name}}` | `Ballet Fundamentals` | `classes.name` |
| `{{class_day}}` | `Monday` | `class_sessions.day_of_week` (capitalized) |
| `{{class_time}}` | `4:30 PM` | `class_sessions.start_time` formatted |
| `{{class_location}}` | `Studio A` | `class_sessions.location` |
| `{{class_instructor}}` | `Jane Smith` | `class_sessions.instructor_name` |
| `{{class_start_date}}` | `September 8, 2026` | `class_sessions.start_date` formatted |
| `{{class_end_date}}` | `December 15, 2026` | `class_sessions.end_date` formatted |

#### Semester
| Variable | Example Output | Data Source |
|----------|---------------|-------------|
| `{{semester_name}}` | `Fall 2026` | ✅ Already implemented |
| `{{registration_deadline}}` | `August 31, 2026` | `class_sessions.registration_close_at` |

#### Registration / Payment
| Variable | Example Output | Notes |
|----------|---------------|-------|
| `{{registration_status}}` | `Confirmed` | `registrations.status` |
| `{{total_amount}}` | `$450.00` | `registration_batches.grand_total` |
| `{{next_payment_amount}}` | `$150.00` | Next `batch_payment_installments.amount_due` with status `pending` |
| `{{next_payment_due_date}}` | `October 1, 2026` | `batch_payment_installments.due_date` of next pending installment |
| `{{payment_plan}}` | `3-installment auto-pay` | `registration_batches.payment_plan_type` |
| `{{outstanding_balance}}` | `$300.00` | Sum of remaining `batch_payment_installments.amount_due` where status ≠ `paid` |
| `{{registration_id}}` | `REG-A1B2C3` | Short-form registration identifier for support reference |

#### Waitlist
| Variable | Example Output | Notes |
|----------|---------------|-------|
| `{{waitlist_position}}` | `3` | `waitlist_entries.position` |
| `{{invite_expiry}}` | `48 hours` | `semesters.waitlist_settings.inviteExpiryHours` |
| `{{accept_invite_url}}` | `https://…/waitlist/accept/TOKEN` | Full URL for the waitlist acceptance page |

#### Studio / Organization
| Variable | Example Output | Notes |
|----------|---------------|-------|
| `{{studio_name}}` | `AYDT Dance` | Static — hardcoded or from env/config |
| `{{studio_phone}}` | `(555) 123-4567` | Static — from env/config |
| `{{studio_email}}` | `info@aydt.com` | Static — from env/config |
| `{{studio_address}}` | `123 Main St, City, ST 00000` | Static — from env/config |
| `{{current_year}}` | `2026` | Dynamic — resolved from server time |

#### Admin / Sender
| Variable | Example Output | Notes |
|----------|---------------|-------|
| `{{sender_name}}` | `Coach Maria` | `emails.sender_name` — already used in the From header |
| `{{unsubscribe_url}}` | `https://…/unsubscribe?uid=…` | Auto-injected as footer — not a template variable; rendered separately |

---

## Implementation Notes

### Adding a new variable

1. Add a field to `EmailVariableContext` in `utils/resolveEmailVariables.ts`
2. Add a `vars` key in `resolveEmailVariables()` mapping `token_name → value`
3. Update `MOCK_EMAIL_CONTEXT` with a realistic sample value
4. Update `resolveRecipients.ts` / `sendEmailNow.ts` to populate the new context field per-recipient
5. Add the variable to the editor toolbar variable picker (if one exists)

### Multi-dancer broadcast variables

The `{{student_enrollment_summary}}` variable requires the `dancer_context` JSONB field that is now stored on `email_recipients` (added in migration `20260311000001`). The edge function path (`send-email-broadcast`) is the right place to render this per-recipient since inline sends use a simplified context.

### Preview / test sends

`applyMockTokens()` in `resolveEmailVariables.ts` substitutes all implemented variables with sample data. The DesignStep preview iframe and the "Send Test" flow both use this. When new variables are added, update `MOCK_EMAIL_CONTEXT` so previews remain accurate.

---

## Email Statuses

| Status | Meaning |
|--------|---------|
| `draft` | Being composed, not yet sent |
| `scheduled` | Recipients resolved, send time set |
| `sending` | Inline send in progress |
| `sent` | Delivery complete (at least one recipient succeeded) |
| `failed` | All recipients failed to deliver |
| `cancelled` | Admin manually cancelled |
