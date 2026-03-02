# AYDT Registration Admin Portal

> **Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Resend

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Stack & Environment](#stack--environment)
3. [Domain Map](#part-1--domain-map)
   - [Core Entities & Ownership](#11-core-entities-and-ownership)
   - [Status State Machines](#12-status-state-machines)
   - [Mutability Matrix](#13-mutability-matrix)
4. [Data Flow Maps](#part-2--data-flow-maps)
   - [User-Facing Flow](#21-user-facing-data-flow)
   - [Admin Portal Flow](#22-admin-portal-data-flow)
   - [Email Broadcast Flow](#23-email-broadcast-flow)
5. [Cross-Boundary Interaction Points](#part-3--cross-boundary-interaction-points)
6. [Structural Risks](#part-4--structural-risks)
7. [Design Improvement Plan](#part-5--design-improvement-plan)
8. [Scalability Assessment](#part-6--scalability-assessment)
9. [Clarifying Questions](#part-7--clarifying-questions)
10. [Summary Risk Table](#summary-risk-table)
11. [Key File Reference](#key-file-reference)

---

## Executive Summary

AYDT is a moderately complex, production-grade registration portal built on **Next.js 16 App Router + Supabase**. The overall architecture is coherent and shows thoughtful design decisions — server actions as the mutation layer, context providers for state distribution, edge functions for async heavy lifting, and a strong type system throughout.

However, the system is mid-development and several critical subsystems have structural gaps that will cause correctness failures in production.

### Strengths

| Area | Detail |
|---|---|
| Type safety | Zod + TypeScript throughout; `types/index.ts` as single source of truth |
| Mutation pattern | Server actions only — no REST API sprawl, no client-side SQL |
| Email snapshot design | Recipients snapshotted before send — prevents mid-send list drift |
| Multi-step editor | Clean `useReducer` pattern, dirty guard, per-step persistence |
| Waitlist automation | Solid edge function with expiry, rollback, and one-at-a-time rule |
| Async workloads | Edge functions correctly offload heavy broadcast and cron work |

### Critical Risks

| Severity | Risk |
|---|---|
| 🔴 CRITICAL | Email status marked `sent` before dispatch — silent send failure possible |
| 🔴 HIGH | Broadcast emails always resolve `student_name`, `semester_name`, `session_name` as empty strings |
| 🟠 MEDIUM | Non-atomic waitlist invite — crash between DB write and email send leaves entry stuck |
| 🟠 MEDIUM | TOCTOU race condition on waitlist capacity check |
| 🟠 MEDIUM | Cart holds live session references, not price/attribute snapshots |
| 🟠 MEDIUM | Discount computation location unconfirmed — potential client-side manipulation vector |
| 🟠 MEDIUM | Payment confirmation mechanism unconfirmed — registration finalization safety unknown |
| 🟡 LOW | DB trigger bug: `RETURN NEW` instead of `RETURN OLD` on DELETE for published semesters |
| 🟡 LOW | Three divergent token-replacement implementations — no shared utility |
| 🟡 LOW | `confirmation_email` JSONB has no version history |

---

## Stack & Environment

### Technology Map

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| State | Context API + `useReducer` (no Redux) |
| Validation | Zod schemas + React Hook Form |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (Magic Links, OAuth) |
| File Storage | Supabase Storage |
| Email Delivery | Resend |
| Edge Functions | Deno (Supabase Functions) |
| Task Scheduling | `pg_cron` (PostgreSQL cron jobs) |
| Rich Text | TipTap (ProseMirror-based) |

### Environment Variables

```bash
RESEND_API_KEY=           # Server-side only — never NEXT_PUBLIC_
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SITE_URL=                 # Used in waitlist acceptance links
RESEND_FROM_EMAIL=        # Fallback sender address in edge functions
```

### Project Structure

```
aydt-registration-admin-portal/
├── app/
│   ├── (user-facing)/          # Public registration portal
│   │   ├── cart/               # Cart view
│   │   ├── register/           # Multi-step registration wizard
│   │   ├── semester/[id]/      # Semester detail / session browser
│   │   ├── waitlist/accept/    # Waitlist token acceptance
│   │   └── layout.tsx
│   ├── admin/                  # Admin management portal
│   │   ├── semesters/          # Semester CRUD + 9-step editor
│   │   ├── emails/             # Broadcast email management
│   │   ├── media/              # Media library
│   │   ├── families/           # Family records
│   │   ├── dancers/            # Dancer records
│   │   └── users/              # User management
│   ├── api/
│   │   ├── media/              # Media CRUD endpoints
│   │   ├── upload-image/       # Image upload handler
│   │   └── webhooks/resend/    # Delivery event webhooks
│   ├── auth/                   # Login, reset, confirm flows
│   ├── components/
│   │   ├── semester-flow/      # TipTap, form builders, modals
│   │   ├── public/             # Cart, session grid, day picker
│   │   ├── email/              # iPhone preview frame
│   │   └── media/              # Image picker modal
│   └── providers/              # AuthProvider, CartProvider, RegistrationProvider
├── lib/
│   └── schemas/registration.ts # Zod validation schemas
├── types/
│   ├── index.ts                # All domain types
│   └── public.ts               # Public-safe type subset
├── utils/
│   ├── supabase/               # Server/client Supabase clients + middleware
│   ├── resolveEmailVariables.ts# Canonical token replacement utility
│   └── prepareEmailHtml.ts     # Outlook img attribute normalization
└── supabase/
    └── functions/
        ├── process-waitlist/
        ├── process-scheduled-emails/
        └── send-email-broadcast/
```

---

## Part 1 — Domain Map

### 1.1 Core Entities and Ownership

| Entity | Owner | Mutable After Publish? | Stateful? |
|---|---|---|---|
| `Semester` | Admin | No (when locked) | Yes — status state machine |
| `Session` | Admin → Semester | No (when locked) | No |
| `SessionGroup` | Admin → Semester | No (when locked) | No |
| `PaymentPlan` | Admin → Semester | No (when locked) | No |
| `Discount` | Admin (global) | **Yes — shared across semesters** | No |
| `SemesterDiscount` | Admin → Semester | No (when locked) | No (snapshot link) |
| `RegistrationForm` | Admin → Semester | No (when locked) | No |
| `ConfirmationEmail` | Admin → Semester | **Yes — JSONB, no lock enforced** | No |
| `WaitlistSettings` | Admin → Semester | **Yes — JSONB, no lock enforced** | No |
| `Dancer` | User / Family | Yes | No |
| `Family` | User | Yes | No |
| `Registration` | System | Partially (status only) | Yes — status state machine |
| `WaitlistEntry` | System | Yes (status transitions) | Yes — status state machine |
| `Cart` | User (client) | Yes (ephemeral) | Yes — `localStorage` |
| `RegistrationState` | User (client) | Yes (ephemeral) | Yes — `sessionStorage` |
| `Email` (broadcast) | Admin | Partially (status only) | Yes — status state machine |
| `EmailRecipient` | System | No (snapshot at schedule time) | No |
| `EmailDelivery` | System | Yes (tracking fields) | Yes |
| `MediaFile` | Admin | Yes | No |
| `AuditLog` | System | No (append-only) | No |

> **⚠️ Critical:** `confirmation_email` and `waitlist_settings` are JSONB fields on the `semesters` row. They are **not** covered by the DB lock trigger on published semesters. An admin can silently update the confirmation email template after registrations exist — future sends will use the new template with no version history.

### 1.2 Status State Machines

**Semester lifecycle:**
```
  draft ──► scheduled ──► published ──► archived
              ▲                │
              └──── unpublish ◄┘
```

**Registration lifecycle:**
```
  pending (30-min hold) ──► confirmed ──► cancelled
                        └──► declined
```

**WaitlistEntry lifecycle:**
```
  waiting ──► invited (default: 48h expiry) ──► expired
                │
                ▼ (user visits /waitlist/accept/[token])
              [registration created: status=pending]
                │
                ▼
              accepted
```

**Email (broadcast) lifecycle:**
```
  draft ──► scheduled ──► sent ──► [per-recipient delivery tracking]
    └──────► cancelled
```

### 1.3 Mutability Matrix

| What | When it should lock | Current behavior |
|---|---|---|
| Sessions, groups, payment plan | Published + registrations exist | ✅ DB trigger enforces |
| `registration_form` JSONB | Published + registrations exist | ✅ DB trigger enforces |
| `confirmation_email` JSONB | Published + registrations exist | ❌ Never locked |
| `waitlist_settings` JSONB | Published + active waitlist exists | ❌ Never locked |
| Global discount rules | Linked to published semester | ❌ Freely editable |
| `EmailRecipient` snapshot | After `scheduleEmail()` | ✅ Immutable after snapshot |
| WaitlistEntry `invite_token` | After invitation issued | ✅ Immutable |

---

## Part 2 — Data Flow Maps

### 2.1 User-Facing Data Flow

```
USER VISITS /semester/[id]
    │
    ▼
page.tsx (Server Component)
    └── getSemesterForDisplay(id, "live")
            └── Supabase JOIN: semesters + sessions + session_groups + payment_plan
    │
    ▼
<SemesterDataProvider semester={...} mode="live">
<CartProvider semesterId={...}>
    │
    ▼
SessionGrid → SessionCard
    (displays: capacity, price, open/full/waitlist CTA)
    │
    ├── [User clicks "Add to Cart"]
    │       CartProvider.addItem(sessionId, selectedDays)
    │       ├── Writes to CartState (in-memory + localStorage)
    │       ├── Sets TTL: now + 2 hours
    │       └── ⚠️  No server-side capacity hold created
    │
    └── [User clicks "Join Waitlist"]
            └── Creates waitlist_entries row (server action)
    │
    ▼
CartDrawer → [User clicks "Checkout"]
    │
    ▼
/register  ←  RegistrationProvider (initializes from sessionStorage)
    │
    ├── STEP 1: "email"
    │       User enters email → Supabase auth lookup / magic link
    │
    ├── STEP 2: "participants"
    │       User selects/creates dancers, assigns to sessions
    │
    ├── STEP 3: "form"
    │       Dynamic form from semester.registration_form JSONB
    │       Zod schema built at runtime from form element definitions
    │       Session-specific elements filtered by sessionIds array
    │
    ├── STEP 4: "payment"
    │       Payment plan displayed from semester.payment_plan
    │       ⚠️  Discount computation location: UNKNOWN
    │       ⚠️  Payment capture mechanism: UNKNOWN (custom processor)
    │       ⚠️  Registration row creation timing: UNKNOWN
    │
    └── STEP 5: "success"
            Confirmation email triggered
            Cart cleared (localStorage)
            RegistrationState cleared (sessionStorage)
```

**Known unknowns in this flow** — see [Clarifying Questions](#part-7--clarifying-questions).

### 2.2 Admin Portal Data Flow

```
ADMIN VISITS /admin/semesters/new
    │
    ▼
page.tsx  →  createSemesterDraft() [Server Action]
    ├── INSERT semesters (status: "draft", name: "Untitled")
    └── redirect → /admin/semesters/{id}/edit?step=details
    │
    ▼
EditSemesterClient.tsx (Server Component)
    ├── Fetch full semester (all JSONB, sessions, groups, payment, discounts)
    ├── Compute isLocked = (status === "published" && registrationCount > 0)
    └── Pass to <SemesterForm state={hydrated} isLocked={isLocked}>
    │
    ▼
SemesterForm.tsx ("use client")
    ├── useReducer(semesterReducer, hydratedState)
    ├── Renders current step component
    └── navigateToStep() → persistSemesterDraft(state) → URL update

    ─── STEP NAVIGATION (persistSemesterDraft runs on every step) ───

persistSemesterDraft(state) [Server Action — full upsert]
    ├── UPDATE semesters SET (all top-level fields)
    ├── syncSemesterSessions()   → DELETE removed, UPSERT existing
    ├── syncSemesterGroups()     → session ID remapping applied
    ├── syncSemesterPayments()   → upsert payment_plan + installments
    └── syncSemesterDiscounts()  → upsert semester_discounts

    ─── 9 STEPS: details → sessions → sessionGroups → payment →
                 discounts → registrationForm → confirmationEmail →
                 waitlist → review ───

    ▼
ReviewStep
    ├── publishSemesterNow(id)     → RPC publish_semester() + status = "published"
    ├── scheduleSemester(id, at)   → status = "scheduled", publish_at = timestamp
    └── saveSemesterDraft(id)      → remains draft
```

### 2.3 Email Broadcast Flow

```
ADMIN → /admin/emails/new
    │
    ▼
createEmailDraft() → INSERT emails (status: "draft")

    STEP 1: Setup     → subject, sender_name, sender_email, reply_to_email
    STEP 2: Recipients → semester | session | manual targeting
                         previewRecipientCount() — live count, not yet snapshotted
    STEP 3: Design    → TipTap editor → body_html persisted
    STEP 4: Preview / Schedule
    │
    ├── scheduleEmail(id, scheduledAt)
    │       ├── resolveRecipients() → snapshot into email_recipients table
    │       └── UPDATE emails SET status = "scheduled"
    │
    └── sendEmailNow(id)
            ├── resolveRecipients() → snapshot into email_recipients table
            ├── recipients ≤ 500 → inline send (within server action)
            └── recipients > 500 → invoke send-email-broadcast edge function

    ─── SCHEDULED EMAIL CRON (pg_cron or external) ───

process-scheduled-emails (Edge Function)
    ├── ⚠️  UPDATE emails SET status="sent" WHERE status="scheduled" AND scheduled_at<=now
    │       (marks sent BEFORE dispatch — see Risk 1)
    └── Promise.allSettled → invoke send-email-broadcast per email

send-email-broadcast (Edge Function)
    ├── Fetch email record + admin signature
    ├── Fetch snapshotted email_recipients
    └── For each batch of 100:
            ├── resolveVariables(body_html, { parent_name, student_name="", ... })
            │   ⚠️  student_name, semester_name, session_name always empty strings
            ├── prepareEmailHtml() → normalize img attributes for Outlook
            ├── resend.emails.send(...)
            └── upsert email_deliveries (resend_message_id, status)

    ─── DELIVERY WEBHOOK ───

/api/webhooks/resend
    └── UPDATE email_deliveries SET status, delivered_at, opened_at, etc.
```

### 2.4 Waitlist Automation Flow

```
pg_cron (every 1 minute) → process_waitlist() SQL function
    │
    ▼
process-waitlist (Edge Function)
    │
    ├── STEP 1: Expire seat holds
    │       DELETE FROM registrations
    │       WHERE status="pending" AND hold_expires_at < now
    │
    ├── STEP 2: Expire stale invites
    │       UPDATE waitlist_entries SET status="expired"
    │       WHERE status="invited" AND invitation_expires_at < now
    │
    └── STEP 3: For each session with "waiting" entries:
            processSession(sessionId)
                ├── Check waitlist enabled (semester + session level)
                ├── Check stopDaysBeforeClose window
                ├── Check no active "invited" entry exists (one-at-a-time rule)
                ├── Check capacity: COUNT(active registrations) < session.capacity
                ├── Fetch next waiting entry (ORDER BY position ASC)
                │
                ├── ⚠️  UPDATE waitlist_entries SET status="invited"  ← DB write first
                │
                ├── resend.emails.send(invitation email with tokens)
                │       Tokens: {{participant_name}}, {{parent_name}},
                │               {{session_name}}, {{hold_until_datetime}},
                │               {{accept_link}}, {{timezone}}
                │
                └── On send failure: rollback to status="waiting"
                    ⚠️  Rollback can also fail silently

USER VISITS /waitlist/accept/[token]
    ├── Validate token (not expired, status="invited")
    ├── Create registration (status="pending", hold_expires_at=now+30min)
    └── UPDATE waitlist_entries SET status="accepted"
```

---

## Part 3 — Cross-Boundary Interaction Points

### 3.1 Admin Changes → User Impact

| Admin Action | User Impact | Risk Level |
|---|---|---|
| Edit `registration_form` JSONB | Dynamic form schema changes on next page load | 🟠 User mid-registration may encounter changed form |
| Edit `confirmation_email` JSONB | All future confirmation sends use new template | 🟡 No versioning; historical emails are inconsistent |
| Change session capacity after publish | Affects capacity display and waitlist triggering | 🟡 Blocked by lock unless 0 registrations |
| Unpublish semester | Semester disappears from user listing | 🟠 Active carts become orphaned |
| Delete session (during editing) | `syncSemesterSessions` hard-deletes removed sessions | 🟠 Cart items referencing that `sessionId` become stale |
| Edit global discount rules | Changes pricing on all linked semesters | 🟠 Silently affects active registrations |

### 3.2 User Actions → Admin Impact

| User Action | Admin Impact |
|---|---|
| Registration created | `isLocked` becomes `true` — semester editing restricted |
| Registration confirmed | Reduces available capacity, may trigger waitlist |
| Registration cancelled | Frees capacity, triggers next waitlist invite |
| Family profile update | Downstream in admin family reporting |
| Email unsubscribe | Affects `resolveRecipients()` recipient count |

### 3.3 Discount Coupling

Discounts are defined globally, then linked to semesters via `semester_discounts`. Two structural unknowns:

1. **Are discount amounts snapshotted** into `semester_discounts` at link time, or resolved live from the global `discounts` table at checkout?
   - If resolved live: editing a global discount silently changes pricing for all linked published semesters
2. **Where is discount computation performed?** Server-side (safe) or client-side (manipulation vector)?

Without answers to these, the discount system cannot be assessed for correctness or security.

---

## Part 4 — Structural Risks

### 🔴 Risk 1: Email Status Inversion — Silent Send Failure (CRITICAL)

**File:** [`supabase/functions/process-scheduled-emails/index.ts`](supabase/functions/process-scheduled-emails/index.ts)

```typescript
// Marks as "sent" BEFORE dispatching
const { data: claimed } = await supabase
  .from("emails")
  .update({ status: "sent", sent_at: now })   // ← happens first
  .eq("status", "scheduled")
  .select("id");

// THEN invokes send-email-broadcast — if this fails, status is already "sent"
await Promise.allSettled(
  emailIds.map((emailId) =>
    fetch(`${SUPABASE_URL}/functions/v1/send-email-broadcast`, ...)
  ),
);
```

**Failure scenario:** If the `fetch()` call fails (Deno cold start, network timeout, edge function crash), the email status is permanently `sent` with `sent_at` set — but zero recipients received anything. The admin dashboard shows "Sent". There is no way to detect or recover from this in the current implementation.

**Fix:** Introduce a `sending` intermediate status. Set `sending` when dispatch begins, `sent` only after broadcast confirms completion. Or invert: dispatch first, mark `sent` after.

---

### 🔴 Risk 2: Broadcast Email Variable Resolution — Silent Data Corruption (HIGH)

**File:** [`supabase/functions/send-email-broadcast/index.ts`](supabase/functions/send-email-broadcast/index.ts)

```typescript
const vars: Record<string, string> = {
  parent_name: recipient.first_name,  // ✅ populated
  student_name: "",                   // ❌ always empty string
  semester_name: "",                  // ❌ always empty string
  session_name: "",                   // ❌ always empty string
};
```

Any broadcast email template using `{{student_name}}`, `{{semester_name}}`, or `{{session_name}}` will silently render those tokens as empty strings. Unlike the canonical `resolveEmailVariables.ts` utility (which preserves unknown tokens as `{{key}}`), this implementation explicitly maps them to `""`.

**Emails go out with blank fields. This is a production bug affecting every broadcast email with those tokens.**

> Note: The canonical utility lives at [`utils/resolveEmailVariables.ts`](utils/resolveEmailVariables.ts). The edge function re-implements token resolution with incorrect defaults. Three separate implementations exist — see Risk 8.

**Fix:** Pass semester/session context from the email record or `email_recipient_selections` into the variable map before resolving.

---

### 🟠 Risk 3: Non-Atomic Waitlist Invite Loop (MEDIUM)

**File:** [`supabase/functions/process-waitlist/index.ts`](supabase/functions/process-waitlist/index.ts)

```typescript
// Step 1: Write to DB
await supabase.from("waitlist_entries")
  .update({ status: "invited", invitation_sent_at: now, invitation_expires_at: expiresAt })
  .eq("id", nextEntry.id);

// Step 2: Send email — if function crashes here, DB is already updated
try {
  await resend.emails.send({ ... });
} catch (err) {
  // Rollback attempt — this can also fail silently
  await supabase.from("waitlist_entries")
    .update({ status: "waiting", invitation_sent_at: null, invitation_expires_at: null })
    .eq("id", nextEntry.id);
}
```

**Failure scenario:** If the edge function crashes between the DB write and the email send (OOM, timeout, unhandled exception outside the try/catch), the entry remains in `invited` state with no email sent. The rollback call itself has no error handling. The entry blocks the entire session's waitlist queue for the full expiry window (default 48 hours).

**Fix:** Invert the ordering — attempt the email send first, then update the DB to `invited` on success. The email is harmless without the token; the DB write is the irreversible state change.

---

### 🟠 Risk 4: TOCTOU Race on Waitlist Capacity Check (MEDIUM)

```typescript
// Count check — no lock held
const { count: activeRegistrations } = await supabase
  .from("registrations").select("id", { count: "exact" })
  .eq("session_id", sessionId)
  .not("status", "in", '("declined","cancelled")');

// Gap here — another registration can be created
if (capacity > 0 && (activeRegistrations ?? 0) >= capacity) return;

// Invite is issued based on stale count
await supabase.from("waitlist_entries").update({ status: "invited", ... })
```

Between the count check and the invite being issued, a concurrent waitlist acceptance can fill the remaining capacity. The newly invited person accepts and creates a registration that exceeds capacity.

**Fix:** Wrap capacity check + invite issuance in a PostgreSQL advisory lock or stored procedure with a `SELECT ... FOR UPDATE` on the session row.

---

### 🟠 Risk 5: Cart as Live Reference — No Price or Attribute Snapshot (MEDIUM)

Cart items contain `sessionId` and `selectedDays`. There is no snapshot of price, session title, or any session attribute at the time the item is added.

**Failure scenarios:**
- Admin changes session price between cart-add and checkout → user is charged a different price than shown
- Admin deletes a session → cart item references a ghost session
- Admin unpublishes the semester → cart item has no valid checkout destination

There is no staleness check at checkout entry — the cart silently references whatever state sessions are in at that moment.

**Fix:** Capture `{ sessionId, title, priceAtAddTime, selectedDays }` at cart-add time. Add a server-side validation step at checkout entry that verifies sessions still exist and prices match. Show a "cart updated" warning if a discrepancy is found.

---

### 🟠 Risk 6: DB Trigger Bug — DELETE on Published Semester (KNOWN)

`PREVENT_CHILD_MODIFICATION_IF_SEMESTER_PUBLISHED` returns `RETURN NEW` at the end of the function for DELETE operations instead of `RETURN OLD`. This prevents deletion of child records (sessions, groups) on published semesters even when `registrationCount = 0` — which should be allowed.

**Fix:** Change `RETURN NEW` to `RETURN OLD` in the DELETE branch of the trigger function.

---

### 🟡 Risk 7: No Optimistic Concurrency Control on Multi-Admin Editing (LOW-MEDIUM)

The semester editor has no version stamp or conflict detection. If two admins navigate through `SemesterForm` simultaneously:
1. Admin A loads step 3
2. Admin B loads step 3
3. Admin A saves → `persistSemesterDraft()` writes
4. Admin B saves → `persistSemesterDraft()` **silently overwrites** Admin A's changes

No conflict error, no last-write-wins warning.

**Fix:** Add `updated_at` timestamp check before writes. Return a conflict error if another write has occurred since the current user loaded the form.

---

### 🟡 Risk 8: Three Divergent Token-Replacement Implementations (LOW)

| File | Behavior on unknown token |
|---|---|
| [`utils/resolveEmailVariables.ts`](utils/resolveEmailVariables.ts) | Preserves `{{key}}` — safe, forward-compatible |
| [`supabase/functions/send-email-broadcast/index.ts`](supabase/functions/send-email-broadcast/index.ts) | Replaces with empty string — **data-corrupting** |
| [`supabase/functions/process-waitlist/index.ts`](supabase/functions/process-waitlist/index.ts) | `replaceAll` loop — no fallback |

A future change to the canonical utility will not propagate to edge functions.

**Fix:** Create a shared utility at `supabase/functions/_shared/resolveTokens.ts` importable by all Deno functions, and a copy-deployed or `lib/` version for the Next.js side.

---

### 🟡 Risk 9: Confirmation Email JSONB — No Version History (LOW)

When an admin updates `confirmation_email` on a published semester, the change takes effect immediately for all future sends. There is no record of what template was in effect when previous registrations received their confirmation. This creates a support/audit gap.

**Fix:** Either snapshot the `confirmation_email` value into the `registrations` row at send time (as a `confirmation_email_snapshot` column), or maintain a versioned `semester_email_versions` table.

---

## Part 5 — Design Improvement Plan

### 5.1 Email System Fixes

**Immediate — correctness:**
1. Fix `send-email-broadcast`: populate `semester_name`, `session_name`, `student_name` from the email's recipient selection context
2. Add `sending` intermediate status to `emails` table; invert the status/dispatch ordering
3. Extract shared token-replacement utility to `supabase/functions/_shared/resolveTokens.ts`

**Near-term — reliability:**
4. Add `failed_at`, `failure_reason` to `email_deliveries` for per-recipient failure audit
5. Write `sent_count`, `failed_count` back to the `emails` row after broadcast completes
6. Implement retry: deliveries with status `pending` after broadcast should be re-attempted on next cron cycle
7. Add `send_attempts` counter to prevent infinite retry loops

### 5.2 Waitlist System Fixes

**Immediate — correctness:**
1. Invert invite ordering: attempt email send before writing `status = "invited"` to DB
2. Add error handling on the rollback call in the catch block
3. Add `last_invite_error` text column to `waitlist_entries` for visibility

**Near-term — safety:**
4. Wrap capacity check + invite issuance in a Postgres advisory lock or stored procedure
5. Add audit logging for all waitlist state transitions
6. Parallelize `processSession()` calls with `Promise.allSettled()` (currently sequential `for...of`)

### 5.3 Cart and Registration Fixes

> **Note:** Full recommendations require answers to [Clarifying Questions](#part-7--clarifying-questions).

1. Add price snapshot to cart items: `{ sessionId, title, priceAtAddTime, selectedDays }`
2. Add server-side cart validation at checkout entry point
3. Define explicit registration creation timing in a documented state diagram and enforce server-side
4. Ensure payment confirmation is idempotent (deduplication by payment reference ID)

### 5.4 Discount Architecture Fixes

1. **All discount computation must be server-side**, verified at payment finalization — any client-side display is for UX only
2. Snapshot discount values into `semester_discounts` at link time (amount, threshold, description)
3. Add `discount_applied_amount` column to `registrations` for reporting
4. Define explicit stacking rules: max discount floor, priority order, exclusion flags

### 5.5 Domain Boundary Improvements

The `SemesterForm` conflates two distinct concerns:

| Concern | Locking behavior needed |
|---|---|
| **Semester configuration** (details, sessions, groups, payment) | Lock on publish + registrations |
| **Semester content** (registration form, confirmation email, waitlist) | Independent versioning; lock invite email when active waitlist exists |

These should be separated into distinct editing surfaces.

### 5.6 Concurrency Control

Add `updated_at` timestamp checks before `persistSemesterDraft` writes. Return a `ConflictError` if another write has occurred since the current user's load timestamp. Display a non-destructive conflict dialog in the UI.

### 5.7 Audit Logging Expansion

Current audit logging covers semester actions only. Add to:

| Table | Events to log |
|---|---|
| `registrations` | created, confirmed, cancelled, declined |
| `waitlist_entries` | all status transitions |
| `emails` | scheduled, sent, cancelled, failed |
| `payments` | created, confirmed, failed, refunded |
| `users` | role changes, auth events |

Recommended pattern: PostgreSQL trigger on key tables writing to a generic `audit_log(table_name, row_id, action, actor_id, old_value JSONB, new_value JSONB, created_at)`.

---

## Part 6 — Scalability Assessment

> Assumptions: 10× users, 10× concurrent registrations, 10× semesters, complex discount stacking, multiple admins editing simultaneously.

### What Breaks First

**1. Email broadcast throughput**

`send-email-broadcast` runs 100 concurrent Resend API calls per batch, sequentially by batch. At 10× load (50,000+ recipients), this will hit Resend rate limits (~100 req/sec), causing silent `pending` failures with no automatic retry.

*Mitigation:* Add configurable inter-batch delays; implement retry logic for `pending` deliveries; monitor Resend delivery stats via `/api/webhooks/resend`.

**2. Waitlist cron bottleneck**

`process-waitlist` processes sessions sequentially in a `for...of` loop. At 100+ sessions with active waitlists, a single cron execution could run for minutes and overlap the next scheduled cycle.

*Mitigation:* Replace sequential loop with `Promise.allSettled()` for parallel session processing. Or move to event-driven triggering (fire when a registration is cancelled/declined).

**3. `persistSemesterDraft` — Full sync on every step**

On every step navigation, all sessions, groups, installments, and discounts are synced. For a semester with 20 sessions × 30 available days = 600+ rows written per navigation. Grows linearly with semester complexity.

*Mitigation:* Dirty-check before sync; only write changed sub-entities; debounce persistence on rapid navigation.

### What Becomes Confusing First

**Multi-admin concurrent editing** — No optimistic locking means the last writer silently wins. At even 2 concurrent admins, data loss is possible on any semester with active editing.

### What Becomes Slow First

- `resolveRecipients()` — multi-table join across users, registrations, sessions, subscriptions at 10× user scale needs confirmed indexes
- Registration count query in `EditSemesterClient` — inner join across `registrations → sessions → semesters`; needs index on `sessions.semester_id` and `registrations.session_id`

### What Becomes Unsafe First

**Discount stacking** — As discount rules accumulate, interaction space grows combinatorially. Without an explicit stacking cap or floor, two legitimate discounts could stack to produce a 100%+ discount or negative total. No discount floor is visible in the current implementation.

**Payment deduplication** — At 10× concurrent checkouts, browser double-submit or webhook replay from the custom payment processor could create duplicate `registrations` for the same dancer in the same session. Without an idempotency key on registration creation, this is a correctness failure.

### Scaling Mitigations Summary

| Bottleneck | Mitigation |
|---|---|
| Email rate limits | Per-batch delay + retry queue |
| Waitlist cron | Parallel session processing |
| Draft persistence | Dirty-check + debounce |
| Multi-admin conflicts | Optimistic locking with `updated_at` |
| Discount stacking | Server-side floor enforcement |
| Payment deduplication | Idempotency key on registration creation |
| Query performance | Index on `sessions.semester_id`, `registrations.session_id`, `waitlist_entries.session_id` |

---

## Part 7 — Clarifying Questions

These are architectural unknowns that cannot be safely assessed from code alone. They must be answered before the registration finalization and payment systems can be considered structurally sound.

| # | Question | Why It Matters |
|---|---|---|
| Q1 | **Cart snapshot vs. live reference:** When a user adds a session to cart, is the price captured at that moment or re-fetched at checkout? | Determines whether price changes between add and checkout affect the user |
| Q2 | **Registration creation timing:** At what exact step is a `registrations` row created? Pre-payment (hold), post-intent, or post-confirmation? | Determines whether abandoned checkouts leak capacity |
| Q3 | **Discount computation location:** Is the final discount amount computed in a server action, or on the client and passed to the payment system? | If client-side, a user can manipulate the discount amount in transit |
| Q4 | **Payment confirmation mechanism:** How does the custom payment processor confirm payment? Webhook? Client redirect with token? Admin manual confirm? | Determines whether registration finalization is vulnerable to client-side manipulation |
| Q5 | **Payment idempotency:** If a payment webhook fires twice, does the system create two registrations or deduplicate? | Critical for correctness under real payment provider behavior |
| Q6 | **Zero-registration published semester:** A published semester with 0 registrations is fully editable (`isLocked = false`). Is this intentional? An admin could change prices while users are mid-checkout. | Potential checkout integrity gap |
| Q7 | **Draft versioning:** Are draft semesters versioned? If two admins edit the same draft simultaneously, is there conflict detection? | Concurrent edit safety |
| Q8 | **Admin preview data source:** When using `DataMode="preview"`, is the preview serving live draft data from the DB or an in-memory shadow of the unsaved editor state? | Determines whether admins can preview uncommitted changes |
| Q9 | **Confirmation email trigger:** What triggers the confirmation email send — a server action after payment, a DB trigger on `status='confirmed'`, or manual admin action? | Affects reliability and idempotency |
| Q10 | **Capacity enforcement at DB level:** Is there a DB constraint or trigger preventing `registrations` from exceeding `sessions.capacity`? Or is this application-code-only? | Application-level-only checks are race-condition vulnerable under concurrent load |

---

## Summary Risk Table

| Severity | Risk | File(s) |
|---|---|---|
| 🔴 CRITICAL | Email status marked `sent` before dispatch — silent send failure | `process-scheduled-emails/index.ts` |
| 🔴 HIGH | Broadcast emails send empty `student_name`, `semester_name`, `session_name` | `send-email-broadcast/index.ts` |
| 🟠 MEDIUM | Non-atomic waitlist invite — crash leaves entry stuck as `invited` | `process-waitlist/index.ts` |
| 🟠 MEDIUM | TOCTOU race on waitlist capacity check | `process-waitlist/index.ts` |
| 🟠 MEDIUM | Cart holds live session references — no price snapshot | `CartProvider`, `app/(user-facing)/cart/` |
| 🟠 MEDIUM | Discount computation location unknown — potential manipulation vector | Unknown |
| 🟠 MEDIUM | Payment confirmation mechanism unknown — registration finalization safety unverified | Unknown |
| 🟠 MEDIUM | No optimistic locking on multi-admin semester editing | `SemesterForm.tsx`, `persistSemesterDraft.ts` |
| 🟡 LOW | DB trigger bug: `RETURN NEW` instead of `RETURN OLD` on DELETE | Supabase DB trigger |
| 🟡 LOW | Three divergent token-replacement implementations | `resolveEmailVariables.ts`, both edge functions |
| 🟡 LOW | `confirmation_email` JSONB has no version history | `semesters` table |
| 🟡 LOW | Waitlist cron is sequential — bottleneck at scale | `process-waitlist/index.ts` |

---

## Key File Reference

| File | Purpose |
|---|---|
| [`types/index.ts`](types/index.ts) | All domain types — single source of truth |
| [`types/public.ts`](types/public.ts) | Public-safe type subset |
| [`app/admin/semesters/SemesterForm.tsx`](app/admin/semesters/SemesterForm.tsx) | Multi-step editor orchestrator, `useReducer`, dirty guard |
| [`app/admin/semesters/[id]/EditSemesterClient.tsx`](app/admin/semesters/%5Bid%5D/EditSemesterClient.tsx) | Hydration from DB, `isLocked` computation |
| [`app/admin/semesters/actions/`](app/admin/semesters/actions/) | All semester server actions |
| [`app/admin/emails/actions/`](app/admin/emails/actions/) | All email server actions |
| [`app/components/semester-flow/TipTapEditor.tsx`](app/components/semester-flow/TipTapEditor.tsx) | Rich text editor with email-safe output |
| [`utils/resolveEmailVariables.ts`](utils/resolveEmailVariables.ts) | Canonical token replacement utility |
| [`utils/prepareEmailHtml.ts`](utils/prepareEmailHtml.ts) | Outlook `img` attribute normalization |
| [`supabase/functions/process-waitlist/index.ts`](supabase/functions/process-waitlist/index.ts) | Waitlist cron worker |
| [`supabase/functions/send-email-broadcast/index.ts`](supabase/functions/send-email-broadcast/index.ts) | Batch email sender |
| [`supabase/functions/process-scheduled-emails/index.ts`](supabase/functions/process-scheduled-emails/index.ts) | Scheduled email dispatcher |
| [`lib/schemas/registration.ts`](lib/schemas/registration.ts) | Zod schemas for registration flow |
| [`app/providers/`](app/providers/) | CartProvider, RegistrationProvider, AuthProvider, SemesterDataProvider |
| [`middleware.ts`](middleware.ts) | Auth session middleware |

---

*Diagnostic generated: 2026-02-24*
*Analyst: Claude Sonnet 4.6 (architectural audit)*
