# AYDT — Full Architectural Diagnostic
### Date: February 24, 2026
### Analyst: Systems-Level Audit

---

> **How to import into Google Docs:**
> Open Google Docs → Create new document → paste this file's contents → when the "Detected Markdown" bar appears at the top, click **"Turn on"**. All headings, tables, bold text, and lists will render correctly. If the bar doesn't appear, go to **Format → Paragraph styles** and apply headings manually.

---

# Executive Summary

AYDT is a moderately complex, production-grade registration portal built on Next.js 16 App Router and Supabase. The overall architecture is coherent and shows thoughtful design decisions: server actions as the mutation layer, context providers for state distribution, edge functions for async heavy lifting, and a strong TypeScript type system throughout.

However, the system is mid-development and several critical subsystems have structural gaps that will cause correctness failures in production. These are not cosmetic issues. They are load-bearing correctness problems.

## Strengths

- **Strong typing.** Zod + TypeScript throughout. `types/index.ts` is the single source of truth for all domain types.
- **Clean mutation pattern.** All data writes go through server actions — no REST API sprawl, no client-side SQL.
- **Email snapshot design.** Recipients are snapshotted before broadcast sends, preventing mid-send list drift.
- **Multi-step editor.** Clean `useReducer` pattern with dirty guard and per-step persistence.
- **Waitlist automation.** Solid edge function with expiry handling, rollback on failure, and one-at-a-time invite rule.
- **Async workload offloading.** Edge functions correctly handle email broadcasting and scheduled sending outside the request lifecycle.

## Critical Risks (Summary)

| Severity | Risk |
|----------|------|
| CRITICAL | Email status is marked "sent" before dispatch — silent send failure is possible |
| HIGH | Broadcast emails always resolve student_name, semester_name, session_name as empty strings |
| MEDIUM | Non-atomic waitlist invite — a crash between DB write and email send leaves the entry stuck |
| MEDIUM | Race condition (TOCTOU) on waitlist capacity check |
| MEDIUM | Cart holds live session references, not price or attribute snapshots |
| MEDIUM | Discount computation location unconfirmed — potential client-side manipulation vector |
| MEDIUM | Payment confirmation mechanism unconfirmed — registration finalization safety unknown |
| MEDIUM | No optimistic locking on multi-admin semester editing |
| LOW | DB trigger bug — RETURN NEW instead of RETURN OLD on DELETE for published semesters |
| LOW | Three divergent token-replacement implementations across the codebase |
| LOW | Confirmation email JSONB has no version history |

---

# Part 1 — Domain Map

## 1.1 Core Entities and Ownership

| Entity | Owner | Mutable After Publish? | Stateful? |
|--------|-------|------------------------|-----------|
| Semester | Admin | No (when locked) | Yes — status state machine |
| Session | Admin → Semester | No (when locked) | No |
| Session Group | Admin → Semester | No (when locked) | No |
| Payment Plan | Admin → Semester | No (when locked) | No |
| Discount (global template) | Admin | Yes — shared across semesters | No |
| Semester Discount (link) | Admin → Semester | No (when locked) | No (snapshot link) |
| Registration Form | Admin → Semester | No (when locked) | No |
| Confirmation Email | Admin → Semester | **YES — JSONB, no lock enforced** | No |
| Waitlist Settings | Admin → Semester | **YES — JSONB, no lock enforced** | No |
| Dancer | User / Family | Yes | No |
| Family | User | Yes | No |
| Registration | System | Partially (status only) | Yes — status state machine |
| Waitlist Entry | System | Yes (status transitions) | Yes — status state machine |
| Cart | User (client) | Yes (ephemeral) | Yes — stored in localStorage |
| Registration State | User (client) | Yes (ephemeral) | Yes — stored in sessionStorage |
| Email (broadcast) | Admin | Partially (status only) | Yes — status state machine |
| Email Recipient | System | No (snapshot at schedule time) | No |
| Email Delivery | System | Yes (tracking fields) | Yes |
| Media File | Admin | Yes | No |
| Audit Log | System | No (append-only) | No |

**Critical observation:** `confirmation_email` and `waitlist_settings` are JSONB fields on the `semesters` row. They are NOT covered by the database lock trigger on published semesters. An admin can silently update the confirmation email template after registrations already exist. Future sends will use the new template. There is no version history. Historical and future confirmation emails will differ with no audit trail.

---

## 1.2 Status State Machines

### Semester Lifecycle

- draft → scheduled → published → archived
- published can be unpublished back to scheduled

### Registration Lifecycle

- pending (30-minute seat hold) → confirmed → cancelled
- pending → declined

### Waitlist Entry Lifecycle

- waiting → invited (default: 48-hour expiry) → expired
- When user visits the accept link: registration created with status pending
- Then: accepted

### Email (Broadcast) Lifecycle

- draft → scheduled → sent → per-recipient delivery tracking
- draft or scheduled → cancelled

---

## 1.3 Mutability Matrix

| What | When it should lock | Current behavior |
|------|--------------------|--------------------|
| Sessions, groups, payment plan | Published + registrations exist | Enforced by DB trigger |
| Registration form JSONB | Published + registrations exist | Enforced by DB trigger |
| Confirmation email JSONB | Published + registrations exist | NEVER locked — gap |
| Waitlist settings JSONB | Published + active waitlist exists | NEVER locked — gap |
| Global discount rules | Linked to published semester | Freely editable — gap |
| Email recipient snapshot | After scheduleEmail() | Immutable after snapshot |
| Waitlist invite token | After invitation issued | Immutable |

---

# Part 2 — Data Flow Maps

## 2.1 User-Facing Registration Flow

**Step 1 — Semester Discovery**

1. User visits /semester/[id]
2. Server component calls getSemesterForDisplay(id, "live")
3. Supabase join fetches: semesters + sessions + session_groups + payment_plan
4. Data passed into SemesterDataProvider and CartProvider context
5. SessionGrid renders SessionCard components with capacity, price, and open/full/waitlist status

**Step 2 — Cart Interaction**

1. User clicks "Add to Cart"
2. CartProvider.addItem(sessionId, selectedDays) runs
3. Cart state written to localStorage with a 2-hour TTL
4. **No server-side capacity hold is created at this point**
5. Two users can have the same session in their carts simultaneously — whoever checks out first gets the spot

**Step 3 — Checkout Entry**

1. User clicks "Checkout" from CartDrawer
2. Navigates to /register
3. RegistrationProvider initializes state from sessionStorage

**Step 4 — Registration Steps**

- Step "email": user enters email, Supabase auth lookup or magic link
- Step "participants": user selects or creates dancers, assigns each to session(s) from cart
- Step "form": dynamic form rendered from semester's registration_form JSONB; Zod schema built at runtime; session-specific fields filtered by sessionIds array
- Step "payment": payment plan displayed; **discount computation location unknown; payment capture mechanism unknown (custom processor); registration row creation timing unknown**
- Step "success": confirmation email triggered, cart cleared, registration state cleared

**Known unknowns in this flow** — see Part 7: Clarifying Questions.

---

## 2.2 Admin Semester Creation Flow

**Creating a semester:**

1. Admin visits /admin/semesters/new
2. createSemesterDraft() server action runs
3. INSERT into semesters (status: "draft", name: "Untitled")
4. Redirect to /admin/semesters/{id}/edit?step=details

**Editing a semester:**

1. EditSemesterClient server component fetches full semester record
2. Computes isLocked = (status === "published" AND registrationCount > 0)
3. Passes hydrated state to SemesterForm client component
4. SemesterForm uses useReducer(semesterReducer, hydratedState)
5. On every step navigation: persistSemesterDraft(state) runs a full upsert:
   - UPDATE semesters (all top-level fields)
   - syncSemesterSessions: DELETE removed sessions, UPSERT existing
   - syncSemesterGroups: with session ID remapping
   - syncSemesterPayments: upsert payment_plan + installments
   - syncSemesterDiscounts: upsert semester_discounts

**9 editor steps:**

1. details
2. sessions
3. sessionGroups
4. payment
5. discounts
6. registrationForm
7. confirmationEmail
8. waitlist
9. review (publish / schedule / save draft)

---

## 2.3 Email Broadcast Flow

**Creating and sending a broadcast email:**

1. Admin visits /admin/emails/new
2. createEmailDraft() inserts email record with status "draft"
3. Steps: Setup (subject, sender) → Recipients (targeting) → Design (TipTap editor) → Preview/Schedule

**On scheduleEmail(id, scheduledAt):**
- resolveRecipients() snapshots all eligible recipients into email_recipients table
- UPDATE emails SET status = "scheduled"

**On sendEmailNow(id):**
- resolveRecipients() snapshots recipients
- If 500 or fewer: inline send within server action
- If more than 500: invoke send-email-broadcast edge function

**Scheduled email cron (process-scheduled-emails edge function):**

1. **MARKS all eligible emails as "sent" FIRST** — before any emails are actually dispatched (this is the critical bug — see Risk 1)
2. Invokes send-email-broadcast for each email

**send-email-broadcast edge function:**

1. Fetches email record and admin signature
2. Fetches snapshotted recipients from email_recipients
3. Processes in batches of 100 using Promise.allSettled
4. For each recipient: resolves token variables (NOTE: student_name, semester_name, session_name are ALWAYS empty strings — see Risk 2)
5. Calls resend.emails.send()
6. Upserts email_deliveries record with Resend message ID

**Delivery tracking:**
- Resend webhooks hit /api/webhooks/resend
- UPDATE email_deliveries SET status, delivered_at, opened_at, clicked_at

---

## 2.4 Waitlist Automation Flow

**Trigger:** pg_cron runs every minute → calls process_waitlist() SQL function → invokes process-waitlist edge function

**Step 1 — Expire seat holds:**
- DELETE FROM registrations WHERE status="pending" AND hold_expires_at < now

**Step 2 — Expire stale invites:**
- UPDATE waitlist_entries SET status="expired" WHERE status="invited" AND invitation_expires_at < now

**Step 3 — Send next invites (per session with waiting entries):**

For each session:
1. Check waitlist is enabled at semester level and session level
2. Check stopDaysBeforeClose window has not been reached
3. Check no active "invited" entry exists (one-at-a-time rule)
4. Check available capacity: COUNT(active registrations) < session.capacity
5. Fetch next waiting entry ordered by position ascending
6. **UPDATE waitlist_entries SET status="invited"** ← DB write happens first
7. Send invitation email via Resend with tokens: participant_name, parent_name, session_name, hold_until_datetime, accept_link, timezone
8. On send failure: attempt rollback to status="waiting" (rollback can also fail silently)

**User acceptance:**
1. User visits /waitlist/accept/[token]
2. Token validated (not expired, status="invited")
3. Registration created (status="pending", hold_expires_at = now + 30 minutes)
4. Waitlist entry updated to status="accepted"

---

# Part 3 — Cross-Boundary Interaction Points

## 3.1 Admin Changes → User Impact

| Admin Action | User Impact | Risk |
|-------------|-------------|------|
| Edit registration_form JSONB | Dynamic form schema changes on next page load | User mid-registration may encounter a changed form |
| Edit confirmation_email JSONB | All future confirmation sends use new template | No versioning — historical and future emails differ |
| Change session capacity after publish | Affects capacity display and waitlist triggering | Blocked by lock unless 0 registrations |
| Unpublish semester | Semester disappears from user listing | Active carts become orphaned |
| Delete session during editing | Hard-deletes removed sessions | Cart items referencing that sessionId become stale |
| Edit global discount rules | Changes pricing for all linked semesters | Silently affects active registrations |

## 3.2 User Actions → Admin Impact

| User Action | Admin Impact |
|------------|--------------|
| Registration created | isLocked becomes true — semester editing is restricted |
| Registration confirmed | Reduces available capacity, may trigger waitlist |
| Registration cancelled | Frees capacity, triggers next waitlist invite |
| Family profile update | Downstream change in admin family reporting |
| Email unsubscribe | Affects resolveRecipients() count |

## 3.3 Discount Coupling (Partially Observable)

Two structural unknowns about the discount system:

**Unknown 1:** Are discount amounts snapshotted into semester_discounts at link time, or resolved live from the global discounts table at checkout? If live: editing a global discount template silently changes pricing for all linked published semesters.

**Unknown 2:** Where is discount computation performed? Server-side (safe) or client-side (manipulation vector)? If client-side, a user can modify the discount amount in transit before it reaches the payment processor.

Without answers to these, the discount system cannot be fully assessed for correctness or security.

---

# Part 4 — Structural Risks

## Risk 1 — Email Status Inversion: Silent Send Failure

**Severity: CRITICAL**
**File:** supabase/functions/process-scheduled-emails/index.ts

The process-scheduled-emails function marks emails as "sent" BEFORE dispatching them to the send-email-broadcast function:

```
UPDATE emails SET status="sent", sent_at=now   ← happens first
THEN: invoke send-email-broadcast              ← if this fails, emails never go out
```

**Failure scenario:** If the dispatch call fails (edge function cold start, network timeout, Deno crash), the email status is permanently "sent" with sent_at populated — but zero recipients received anything. The admin dashboard shows "Sent." There is no way to detect or recover from this. This will happen silently in production.

**Fix:** Introduce a "sending" intermediate status. Set "sending" when dispatch begins. Set "sent" only after the broadcast function confirms completion. Or invert: dispatch first, mark "sent" after.

---

## Risk 2 — Broadcast Email Variable Resolution: Silent Data Corruption

**Severity: HIGH**
**File:** supabase/functions/send-email-broadcast/index.ts

The broadcast function hardcodes these variable values:

```
parent_name  → recipient.first_name   (correct)
student_name → ""                     (always empty string)
semester_name → ""                    (always empty string)
session_name  → ""                    (always empty string)
```

Any broadcast email template using the tokens {{student_name}}, {{semester_name}}, or {{session_name}} will silently render those tokens as empty strings. Unlike the canonical resolveEmailVariables.ts utility — which preserves unknown tokens as {{key}} — this implementation maps them to empty strings, so there is no fallback. Emails go out with blank fields.

**This is a production bug affecting every broadcast email that uses those tokens.**

**Fix:** Pass semester/session context from the email's recipient selection into the variable map before resolving tokens.

---

## Risk 3 — Non-Atomic Waitlist Invite Loop

**Severity: MEDIUM**
**File:** supabase/functions/process-waitlist/index.ts

The waitlist invite logic writes to the database first, then attempts the email send:

```
1. UPDATE waitlist_entries SET status="invited"   ← DB write
2. resend.emails.send(...)                        ← if crash here, entry stuck
3. On failure: rollback to status="waiting"       ← rollback can also fail silently
```

**Failure scenario:** If the edge function crashes between steps 1 and 2 (out of memory, timeout, unhandled exception outside the try/catch), the entry remains in "invited" state with no email sent. The rollback call has no error handling itself. The entry blocks the entire session's waitlist queue for the full expiry window (default 48 hours).

**Fix:** Invert the ordering — attempt the email send first, then update the DB to "invited" on success. The email is harmless without the token; the DB write is the irreversible state change.

---

## Risk 4 — Race Condition (TOCTOU) on Waitlist Capacity Check

**Severity: MEDIUM**
**File:** supabase/functions/process-waitlist/index.ts

The waitlist function performs a capacity check and then issues an invite in separate, non-atomic steps:

```
1. COUNT active registrations for session
2. [gap — no lock held]
3. Issue invite based on potentially stale count
```

Between steps 1 and 3, another user can accept a concurrent waitlist invite, filling the remaining capacity. The newly invited person then accepts and creates a registration that exceeds capacity.

**Fix:** Wrap the capacity check and invite issuance in a PostgreSQL advisory lock or a stored procedure with SELECT ... FOR UPDATE on the session row.

---

## Risk 5 — Cart as Live Reference: No Price or Attribute Snapshot

**Severity: MEDIUM**
**Files:** CartProvider, app/(user-facing)/cart/

Cart items contain sessionId and selectedDays. There is no snapshot of price, session title, or capacity at the time the item is added.

**Failure scenarios:**
- Admin changes session price between cart-add and checkout → user is charged a different price than shown
- Admin deletes a session → cart item references a non-existent session
- Admin unpublishes the semester → cart item has no valid checkout destination

There is no staleness check at checkout entry.

**Fix:** Capture title and priceAtAddTime at cart-add time. Add a server-side validation step at checkout entry that verifies sessions still exist and prices match. Show a "cart updated" warning if a discrepancy is found.

---

## Risk 6 — DB Trigger Bug: DELETE on Published Semester

**Severity: LOW**
**Location:** Supabase database trigger (PREVENT_CHILD_MODIFICATION_IF_SEMESTER_PUBLISHED)

The trigger function returns RETURN NEW for DELETE operations instead of RETURN OLD. This prevents deletion of child records (sessions, groups) on published semesters even when registrationCount = 0, which should be allowed.

**Fix:** Change RETURN NEW to RETURN OLD in the DELETE branch of the trigger function.

---

## Risk 7 — No Optimistic Concurrency Control on Multi-Admin Editing

**Severity: MEDIUM**
**Files:** SemesterForm.tsx, persistSemesterDraft.ts

If two admins navigate through the semester editor simultaneously:

1. Admin A loads step 3
2. Admin B loads step 3
3. Admin A saves → persistSemesterDraft() writes
4. Admin B saves → persistSemesterDraft() **silently overwrites Admin A's changes**

No conflict error. No last-write-wins warning. No version stamp.

**Fix:** Add an updated_at timestamp check before writes. Return a conflict error if another write has occurred since the current user loaded the form.

---

## Risk 8 — Three Divergent Token-Replacement Implementations

**Severity: LOW**

| File | Behavior on unknown token |
|------|--------------------------|
| utils/resolveEmailVariables.ts | Preserves {{key}} — safe, forward-compatible |
| supabase/functions/send-email-broadcast/index.ts | Replaces with empty string — data-corrupting |
| supabase/functions/process-waitlist/index.ts | replaceAll loop — no fallback behavior |

A future change to the canonical utility will not propagate to edge functions.

**Fix:** Create a shared utility at supabase/functions/_shared/resolveTokens.ts importable by all Deno functions.

---

## Risk 9 — Confirmation Email JSONB Has No Version History

**Severity: LOW**

When an admin updates the confirmation_email field on a published semester, the change takes effect immediately for all future sends. There is no record of what template was in effect when previous registrations received their confirmation email.

**Fix:** Either snapshot the confirmation_email value into the registrations row at send time (as a confirmation_email_snapshot column), or maintain a versioned semester_email_versions table.

---

# Part 5 — Design Improvement Plan

## 5.1 Email System Fixes

**Immediate — correctness:**

1. Fix send-email-broadcast: populate semester_name, session_name, student_name from the email's recipient selection context
2. Add "sending" intermediate status to emails table; invert the status/dispatch ordering so "sent" is only set after broadcast confirms
3. Extract shared token-replacement utility to supabase/functions/_shared/resolveTokens.ts

**Near-term — reliability:**

4. Add failed_at and failure_reason columns to email_deliveries for per-recipient failure audit
5. Write sent_count and failed_count back to the emails row after broadcast completes
6. Implement retry: deliveries with status "pending" after broadcast should be re-attempted on next cron cycle
7. Add send_attempts counter to prevent infinite retry loops

---

## 5.2 Waitlist System Fixes

**Immediate — correctness:**

1. Invert invite ordering: attempt email send before writing status = "invited" to DB
2. Add error handling on the rollback call in the catch block
3. Add last_invite_error text column to waitlist_entries for visibility into failures

**Near-term — safety:**

4. Wrap capacity check + invite issuance in a Postgres advisory lock or stored procedure
5. Add audit logging for all waitlist state transitions
6. Parallelize processSession() calls with Promise.allSettled() instead of sequential for...of loop

---

## 5.3 Cart and Registration Fixes

Note: Full recommendations require answers to Clarifying Questions (Part 7).

1. Add price snapshot to cart items: capture title and priceAtAddTime at add time
2. Add server-side cart validation at the checkout entry point
3. Define explicit registration creation timing in a documented state diagram and enforce server-side
4. Ensure payment confirmation is idempotent (deduplication by payment reference ID)

---

## 5.4 Discount Architecture Fixes

1. All discount computation must be server-side, verified at payment finalization — any client-side display is for UX only
2. Snapshot discount values into semester_discounts at link time (amount, threshold, description) so editing global discount templates doesn't affect active semesters
3. Add discount_applied_amount column to registrations for reporting and audit
4. Define explicit stacking rules: maximum discount floor, priority order, exclusion flags

---

## 5.5 Domain Boundary Improvements

The SemesterForm currently conflates two distinct concerns that should have different locking behaviors:

**Semester configuration** (details, sessions, groups, payment):
- Should lock on publish + registrations existing
- Currently handled correctly

**Semester content** (registration form, confirmation email, waitlist settings):
- Should support independent versioning
- Confirmation email should lock or version when registrations exist
- Waitlist invite email should lock when active waitlist entries exist
- Currently NOT handled — these are freely editable JSONB

These should be separated into distinct editing surfaces with explicit version history.

---

## 5.6 Concurrency Control

Add updated_at timestamp checks before persistSemesterDraft writes. Return a ConflictError if another write has occurred since the current user's load timestamp. Display a non-destructive conflict dialog in the UI — show what changed and let the admin decide which version to keep.

---

## 5.7 Audit Logging Expansion

Current audit logging covers semester actions only. Extend to:

| Table | Events to log |
|-------|---------------|
| registrations | created, confirmed, cancelled, declined |
| waitlist_entries | all status transitions |
| emails | scheduled, sent, cancelled, failed |
| payments | created, confirmed, failed, refunded |
| users | role changes, authentication events |

**Recommended pattern:** PostgreSQL trigger on key tables writing to a generic audit_log table with columns: table_name, row_id, action, actor_id, old_value (JSONB), new_value (JSONB), created_at.

---

# Part 6 — Scalability Assessment

Assumptions: 10x users, 10x concurrent registrations, 10x semesters, complex discount stacking, multiple admins editing simultaneously.

## What Breaks First

**1. Email broadcast throughput**

send-email-broadcast runs 100 concurrent Resend API calls per batch, sequentially by batch. At 10x load (50,000+ recipients), this will hit Resend rate limits (~100 requests/second), causing silent "pending" failures with no automatic retry mechanism.

Mitigation: Add configurable inter-batch delays. Implement retry logic for pending deliveries. Monitor Resend delivery stats via the /api/webhooks/resend endpoint.

**2. Waitlist cron bottleneck**

process-waitlist processes sessions sequentially in a for...of loop. At 100+ sessions with active waitlists, a single cron execution could run for several minutes and overlap the next scheduled cycle (which fires every minute).

Mitigation: Replace sequential loop with Promise.allSettled() for parallel session processing. Or move to event-driven triggering — fire process-waitlist when a registration is cancelled or declined rather than on a fixed cron schedule.

**3. persistSemesterDraft — full sync on every step**

On every step navigation, all sessions, groups, installments, and discounts are synced. A semester with 20 sessions × 30 available days = 600+ rows written per navigation click. This grows linearly with semester complexity.

Mitigation: Dirty-check before sync — only write changed sub-entities. Debounce persistence on rapid navigation.

---

## What Becomes Confusing First

**Multi-admin concurrent editing.** No optimistic locking means the last writer silently wins. At even 2 concurrent admins on the same semester, data loss is possible. With 5+ admins this becomes a frequent problem.

---

## What Becomes Slow First

- resolveRecipients(): multi-table join across users, registrations, sessions, subscriptions. At 10x user scale, needs confirmed indexes and possible materialized view.
- Registration count query in EditSemesterClient: inner join across registrations → sessions → semesters. Needs index on sessions.semester_id and registrations.session_id.
- SemesterForm initial hydration: full semester fetch including all sessions, groups, days, JSONB fields. Grows with session count. No lazy loading in the editor currently.

---

## What Becomes Unsafe First

**Discount stacking.** As more discount rules are added per semester, the interaction space grows exponentially. Without explicit stacking rules (maximum discount, priority order, exclusion flags), two legitimate discounts could stack to produce a 100%+ discount or a negative total. No discount floor is visible in the current implementation.

**Payment deduplication.** At 10x concurrent checkouts, browser double-submission or payment webhook replay from the custom payment processor could create duplicate registrations for the same dancer in the same session. Without an idempotency key on registration creation, this is a correctness failure.

---

## Scaling Mitigations Summary

| Bottleneck | Mitigation |
|-----------|------------|
| Email rate limits | Per-batch delay + retry queue |
| Waitlist cron | Parallel session processing or event-driven trigger |
| Draft persistence | Dirty-check + debounce |
| Multi-admin conflicts | Optimistic locking with updated_at |
| Discount stacking | Server-side floor enforcement + stacking rules |
| Payment deduplication | Idempotency key on registration creation |
| Query performance | Indexes on sessions.semester_id, registrations.session_id, waitlist_entries.session_id |

---

# Part 7 — Clarifying Questions

These are architectural unknowns that cannot be safely assessed from code alone. They must be answered before the registration finalization and payment systems can be considered structurally sound.

**Q1 — Cart snapshot vs. live reference**
When a user adds a session to the cart, is the price captured at that moment, or is it re-fetched at checkout? What happens if a session's price changes between cart-add and checkout?

**Q2 — Registration creation timing**
At what exact step is a registrations row created?
- Option A: At start of checkout (pending hold, before payment)
- Option B: After payment intent is created (holds capacity until payment confirms)
- Option C: Only after payment is fully confirmed

This determines whether capacity is reserved during checkout and whether abandoned checkouts leak capacity.

**Q3 — Discount computation location**
Where is the actual discount amount calculated? In a server action that is verified before payment, or computed client-side and passed to the payment system as the final amount? If client-side, a user can modify the discount amount in transit.

**Q4 — Payment confirmation mechanism**
The system uses a custom payment processor (not Stripe). How does confirmation work — webhook from payment provider hitting an API route, client-side redirect with a token, or admin manual confirmation?

**Q5 — Payment idempotency**
If a payment webhook fires twice (common with real payment providers), does the system create two registrations, or is there deduplication logic?

**Q6 — Zero-registration published semester**
The lock logic is: status === "published" AND registrationCount > 0. A published semester with 0 registrations is fully editable. Is this intentional? An admin could change session prices while users are mid-checkout.

**Q7 — Draft versioning**
Are draft semesters versioned? If an admin partially fills out the 9-step form, navigates away, and another admin edits the same draft, is there any conflict detection or history?

**Q8 — Admin preview data source**
When an admin uses preview mode (DataMode="preview"), is the preview serving live draft data from the database, or an in-memory shadow of the unsaved editor state?

**Q9 — Confirmation email trigger**
What triggers the confirmation email send — a server action called after payment confirmation, a DB trigger on registrations.status = 'confirmed', or a manual admin action?

**Q10 — Capacity enforcement at DB level**
Is there a DB-level constraint or trigger preventing registrations from exceeding sessions.capacity? Or is this enforced only in application code? Application-level-only capacity checks are race-condition vulnerable under concurrent load.

---

# Summary Risk Table

| Severity | Risk | Location |
|----------|------|----------|
| CRITICAL | Email status marked "sent" before dispatch | process-scheduled-emails/index.ts |
| HIGH | Broadcast emails send empty student_name, semester_name, session_name | send-email-broadcast/index.ts |
| MEDIUM | Non-atomic waitlist invite — crash leaves entry stuck as "invited" | process-waitlist/index.ts |
| MEDIUM | Race condition on waitlist capacity check | process-waitlist/index.ts |
| MEDIUM | Cart holds live session references — no price snapshot | CartProvider, cart/ pages |
| MEDIUM | Discount computation location unknown | Unknown |
| MEDIUM | Payment confirmation mechanism unknown | Unknown |
| MEDIUM | No optimistic locking on multi-admin semester editing | SemesterForm.tsx |
| LOW | DB trigger bug: RETURN NEW instead of RETURN OLD on DELETE | Supabase DB trigger |
| LOW | Three divergent token-replacement implementations | resolveEmailVariables.ts + edge functions |
| LOW | Confirmation email JSONB has no version history | semesters table |
| LOW | Waitlist cron is sequential — bottleneck at scale | process-waitlist/index.ts |

---

# Key File Reference

| File | Purpose |
|------|---------|
| types/index.ts | All domain types — single source of truth |
| types/public.ts | Public-safe type subset |
| app/admin/semesters/SemesterForm.tsx | Multi-step editor orchestrator, useReducer, dirty guard |
| app/admin/semesters/[id]/EditSemesterClient.tsx | Hydration from DB, isLocked computation |
| app/admin/semesters/actions/ | All semester server actions |
| app/admin/emails/actions/ | All email server actions |
| app/components/semester-flow/TipTapEditor.tsx | Rich text editor with email-safe HTML output |
| utils/resolveEmailVariables.ts | Canonical token replacement utility |
| utils/prepareEmailHtml.ts | Outlook img attribute normalization |
| supabase/functions/process-waitlist/index.ts | Waitlist cron worker |
| supabase/functions/send-email-broadcast/index.ts | Batch email sender |
| supabase/functions/process-scheduled-emails/index.ts | Scheduled email dispatcher |
| lib/schemas/registration.ts | Zod schemas for registration flow |
| app/providers/ | CartProvider, RegistrationProvider, AuthProvider, SemesterDataProvider |
| middleware.ts | Auth session middleware |

---

*Diagnostic date: February 24, 2026*
*System: AYDT Registration Admin Portal*
*Audit type: Full systems-level architectural review*
