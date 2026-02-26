# AYDT — Class, Session, and Tuition Architecture Design
### Version: 1.0 | Date: February 26, 2026
### Status: Formal Design Document — Pre-Implementation

---

## Table of Contents

1. [Critical Naming Conflict](#0-critical-naming-conflict-resolve-first)
2. [Current Schema Audit](#1-current-schema-audit)
3. [Normalized Database Schema](#2-normalized-database-schema)
4. [Pricing Engine Design](#3-pricing-engine-design)
5. [Validation Architecture](#4-validation-architecture)
6. [Payment Plan Modeling](#5-payment-plan-modeling)
7. [Discount Application Logic](#6-discount-application-logic)
8. [Competition Team Architecture](#7-competition-team-architecture)
9. [Phased Implementation Roadmap](#8-phased-implementation-roadmap)
10. [Structural Risks](#9-structural-risks)

---

## 0. Critical Naming Conflict — Resolve First

Before any schema design is discussed, the terminology mismatch between the current codebase and AYDT's business domain must be resolved. This is not cosmetic — it has caused the pricing model to be built on the wrong entity.

### Current Codebase Meaning vs. AYDT Business Meaning

| Term | Current DB Meaning | AYDT Business Meaning |
|---|---|---|
| `sessions` | **Curriculum entity** (Ballet 1A, Tap 2) | **Time slot** (Ballet 1A, Monday 3:45 PM) |
| `session_available_days` | **Individual occurrence dates** | Not a business term |
| *(no table)* | *(nothing)* | **Class** = curriculum entity |

### Why This Caused the Pricing Bug

Because `sessions` is the curriculum entity in the DB but a time slot in AYDT's domain, the price was put on `sessions`. In AYDT's model, no individual time slot has a price — price is computed from the division and weekly class count. By conflating these two concepts, the pricing model became structurally impossible to implement correctly without a rearchitecture.

### Authoritative Terminology (This Document)

> **Class** — A curriculum entity. Examples: Ballet 1A, Tap 2, Hip Hop 3. Represents a specific instructional level within a discipline. Admin-configured per semester. Belongs to a division.
>
> **Session** — A specific scheduled time slot within a class. Examples: Ballet 1A — Monday 3:45–4:45 PM @ UES. Students enroll in sessions. A class can have multiple sessions.
>
> **Enrollment** — A dancer's confirmed participation in a specific session for a semester.

---

## 1. Current Schema Audit

### 1.1 What Is Structurally Correct

| Table | Assessment |
|---|---|
| `semesters` | Structurally sound. Keep with minor additions. |
| `families`, `users`, `dancers` | Sound. No changes needed. |
| `registration_batches` | Conceptually correct (family-level grouping). Needs column cleanup. |
| `waitlist_entries` | Sound. Will reference sessions (time slots) correctly after rename. |
| `email_*` tables | Sound. No changes needed. |
| `media_images` | Sound. No changes needed. |
| `semester_audit_logs` | Sound. Extend to other tables in Phase 3. |
| `authorized_pickups` | Sound. No changes needed. |

### 1.2 What Must Change

| Table | Problem | Action |
|---|---|---|
| `sessions` | Is the curriculum entity; should be renamed `classes`; missing discipline, division, level, requirement fields | **Rename + add columns** |
| `session_available_days` | Represents individual class dates, not time slots; naming is wrong | **Rename to `session_occurrence_dates`** |
| `registrations` | References `session_id` which is currently a class, not a time slot; will reference new `class_sessions.id` | **Update FK reference** |
| `semester_payment_plans` | Admin-configured plan per semester; correct concept but disconnected from per-family payment records | **Keep + add per-batch tables** |
| `semester_payment_installments` | Admin schedule config; disconnected from actual family payment tracking | **Keep + add `batch_payment_installments`** |
| `discounts` + `discount_rules` | Complex model with `discountAmount` hardcoded to 0; entire execution engine is missing | **Simplify + build engine** |

### 1.3 What Must Be Removed

| Column | Table | Why |
|---|---|---|
| `price numeric NOT NULL` | `sessions` (→ `classes`) | Pricing is NOT per-class; computed from division × weekly count |
| `registration_fee numeric` | `sessions` (→ `classes`) | Moves to `semester_fee_config` |
| `stripe_amount_cents integer` | `registrations`, `registration_batches` | Premature Stripe coupling; replace with processor-agnostic `amount_cents` |
| `days_of_week ARRAY` | `sessions` (→ `classes`) | Becomes `class_sessions.day_of_week` (one row per day) |
| `start_time`, `end_time` | `sessions` (→ `classes`) | Moves to `class_sessions` |
| `start_date`, `end_date` | `sessions` (→ `classes`) | Moves to `class_sessions` |

### 1.4 Confirmed Stubs (No Implementation Exists)

From code inspection of `app/(user-facing)/register/payment/page.tsx` and `app/providers/CartProvider.tsx`:

```
discountAmount: 0,   // hardcoded — never computed
total: subtotal,     // always full price — no discount applied
```

The payment page calls `createRegistrations()` and immediately clears the cart — there is no payment gateway call. `stripe_amount_cents` in the DB is never set. No `payments` table exists.

**These are not bugs to patch. They are missing subsystems to build.**

---

## 2. Normalized Database Schema

### 2.1 Division Reference

All divisions used across tables. Establish this as an enum or check constraint:

```sql
-- Division values (authoritative)
'early_childhood' | 'junior' | 'senior' | 'competition'

-- Discipline values
'ballet' | 'tap' | 'broadway' | 'hip_hop' | 'contemporary' |
'technique' | 'pointe' | 'jazz' | 'lyrical' | 'acro'
```

---

### 2.2 Classes Table (renamed from `sessions`)

```sql
CREATE TABLE public.classes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id     uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,

  -- Curriculum identity
  name            text NOT NULL,                -- "Ballet 1A", "Tap 2"
  discipline      text NOT NULL,                -- 'ballet', 'tap', 'hip_hop', etc.
  division        text NOT NULL CHECK (division IN (
                    'early_childhood', 'junior', 'senior', 'competition'
                  )),
  level           text,                         -- "1A", "2", "Advanced", "Intermediate"
  description     text,

  -- Eligibility constraints
  min_age         integer,
  max_age         integer,

  -- Flags
  is_active                    boolean NOT NULL DEFAULT true,
  is_competition_track         boolean NOT NULL DEFAULT false,
  requires_teacher_rec         boolean NOT NULL DEFAULT false,

  -- Provenance (for clone tracking)
  cloned_from_class_id  uuid REFERENCES public.classes(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classes_semester_id ON public.classes(semester_id);
CREATE INDEX idx_classes_division ON public.classes(division);
```

---

### 2.3 Class Sessions Table (time slots — renamed from `session_available_days` concept)

> **Note:** This is what AYDT calls a "session." One row = one specific time slot offering within a class.
> A class that meets Monday AND Thursday has **two** rows in this table.
> A student enrolls in one session (time slot). Enrolling in both Monday and Thursday sessions of the
> same class is valid — both would be linked to the same `class_id`.

```sql
CREATE TABLE public.class_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  semester_id     uuid NOT NULL REFERENCES public.semesters(id), -- denormalized for query speed

  -- Schedule
  day_of_week     text NOT NULL CHECK (day_of_week IN (
                    'monday', 'tuesday', 'wednesday', 'thursday',
                    'friday', 'saturday', 'sunday'
                  )),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,

  -- Logistics
  location        text,
  instructor_name text,               -- upgrade to FK if instructors become a first-class entity

  -- Capacity
  capacity        integer,            -- NULL = unlimited
  registration_close_at  timestamptz,

  -- Flags
  is_active       boolean NOT NULL DEFAULT true,

  -- Provenance
  cloned_from_session_id  uuid REFERENCES public.class_sessions(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Prevent time conflicts at DB level (soft — application enforces)
  CONSTRAINT no_duplicate_class_slot UNIQUE (class_id, day_of_week, start_time)
);

CREATE INDEX idx_class_sessions_class_id ON public.class_sessions(class_id);
CREATE INDEX idx_class_sessions_semester_id ON public.class_sessions(semester_id);
```

**Key design rule:** `weekly_class_count` for pricing = `COUNT(DISTINCT class_id)` across all sessions a dancer is enrolled in. A dancer enrolled in Ballet 1A (Mon) AND Ballet 1A (Thu) = **1 class/week** (same `class_id`). A dancer enrolled in Ballet 1A (Mon) AND Tap 2 (Wed) = **2 classes/week** (different `class_id`).

---

### 2.4 Session Occurrence Dates (renamed from `session_available_days`)

Represents the individual calendar dates generated from a class session's schedule. Used for:
- Attendance tracking
- Makeup class tracking
- Holiday cancellations
- Displaying specific dates in the registration flow (the current "day picker" UI)

```sql
CREATE TABLE public.session_occurrence_dates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,

  date            date NOT NULL,
  is_cancelled    boolean NOT NULL DEFAULT false,
  cancellation_reason  text,

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(session_id, date)
);

CREATE INDEX idx_occurrence_dates_session_id ON public.session_occurrence_dates(session_id);
```

---

### 2.5 Class Requirements (Prerequisites + Concurrent Enrollment)

```sql
CREATE TABLE public.class_requirements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,

  requirement_type  text NOT NULL CHECK (requirement_type IN (
    'prerequisite_completed',    -- Must have completed a prior semester class
    'concurrent_enrollment',     -- Must also be enrolled in another class this semester
    'teacher_recommendation',    -- Requires written teacher recommendation
    'skill_qualification',       -- Admin-verified skill level (e.g., Pointe readiness)
    'audition_required'          -- Requires audition (Competition team)
  )),

  -- For class-based requirements:
  -- prerequisite_completed: reference by discipline + level (cross-semester)
  required_discipline   text,     -- e.g., 'ballet'
  required_level        text,     -- minimum level, e.g., '4' (Ballet 4 or higher)

  -- concurrent_enrollment: reference the specific class in THIS semester
  required_class_id     uuid REFERENCES public.classes(id) ON DELETE SET NULL,

  -- Human-readable description for admin UI and user-facing warnings
  description           text NOT NULL,

  -- Enforcement level
  enforcement   text NOT NULL DEFAULT 'hard_block' CHECK (enforcement IN (
    'soft_warn',    -- Show warning, allow continuation
    'hard_block'    -- Prevent registration unless waived
  )),

  -- Admin override available?
  is_waivable   boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_requirements_class_id ON public.class_requirements(class_id);
```

**Examples:**

| Class | Requirement Type | Config |
|---|---|---|
| Ballet 5 | concurrent_enrollment | required_class_id = Technique (same semester) |
| Pointe | prerequisite_completed | discipline='ballet', level='4' |
| Pointe | skill_qualification | description="Must have teacher sign-off for Pointe readiness" |
| Competition Team | audition_required | description="Must have completed Fall audition" |
| Hip Hop 3 | prerequisite_completed | discipline='hip_hop', level='2' |

---

### 2.6 Tuition Rate Bands (Pricing Engine Data)

The Excel tuition chart expressed as a DB table. Authoritative source for all pricing computation.

```sql
CREATE TABLE public.tuition_rate_bands (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id             uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,

  division                text NOT NULL CHECK (division IN (
                            'early_childhood', 'junior', 'senior', 'competition'
                          )),
  weekly_class_count      integer NOT NULL CHECK (weekly_class_count > 0),

  -- Tuition amounts
  base_tuition            numeric(10,2) NOT NULL,   -- full semester tuition
  recital_fee_included    numeric(10,2) NOT NULL DEFAULT 0, -- portion that is recital fee

  -- Optional notes for admin reference
  notes                   text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE(semester_id, division, weekly_class_count)
);

CREATE INDEX idx_rate_bands_semester_division ON public.tuition_rate_bands(semester_id, division);
```

**Example data for Fall 2026:**

| division | weekly_class_count | base_tuition | recital_fee_included |
|---|---|---|---|
| junior | 1 | 950.00 | 75.00 |
| junior | 2 | 1720.00 | 150.00 |
| junior | 3 | 2350.00 | 225.00 |
| senior | 1 | 1050.00 | 75.00 |
| senior | 2 | 1900.00 | 150.00 |
| early_childhood | 1 | 750.00 | 60.00 |

> **Volume discount note:** The 5% per-additional-class discount is **already baked into these numbers** as provided by the Excel chart. Do NOT separately compute a volume discount — it would double-count.

---

### 2.7 Semester Fee Configuration

Per-semester admin-configurable fee constants. Separate from tuition rate bands.

```sql
CREATE TABLE public.semester_fee_config (
  semester_id                   uuid PRIMARY KEY REFERENCES public.semesters(id) ON DELETE CASCADE,

  registration_fee_per_child    numeric(10,2) NOT NULL DEFAULT 40.00,
  family_discount_amount        numeric(10,2) NOT NULL DEFAULT 50.00,
  auto_pay_admin_fee_monthly    numeric(10,2) NOT NULL DEFAULT 5.00,
  auto_pay_installment_count    integer       NOT NULL DEFAULT 5,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
```

---

### 2.8 Enrollments (replaces `registrations` for per-dancer-per-session records)

> **Decision:** Keep `registrations` as the name for backward compatibility with existing FK references in the codebase. Update the `session_id` FK to point at `class_sessions` instead of `sessions` (→ `classes`).

```sql
-- Updated registrations table (backward-compatible rename of session_id reference)
CREATE TABLE public.registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dancer_id       uuid REFERENCES public.dancers(id),
  user_id         uuid REFERENCES public.users(id),

  -- UPDATED: now references class_sessions(id), not classes(id)
  session_id      uuid REFERENCES public.class_sessions(id),

  batch_id        uuid REFERENCES public.registration_batches(id),

  status          text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                    'pending_payment', 'confirmed', 'cancelled', 'waitlisted'
                  )),

  -- Seat hold management
  hold_expires_at timestamptz,

  -- Form responses for this dancer
  form_data       jsonb NOT NULL DEFAULT '{}',

  -- Waiver tracking (for waived requirements)
  waived_requirements  uuid[],  -- array of class_requirement IDs waived by admin

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_dancer_session UNIQUE (dancer_id, session_id)
);

CREATE INDEX idx_registrations_session_id ON public.registrations(session_id);
CREATE INDEX idx_registrations_dancer_id ON public.registrations(dancer_id);
CREATE INDEX idx_registrations_batch_id ON public.registrations(batch_id);
```

**Why remove `stripe_amount_cents` and `payment_intent_id` from `registrations`:** Payment lives at the batch level, not the per-dancer-per-session level. A family pays once for all enrollments in a batch. Individual registration rows should not hold payment state.

---

### 2.9 Registration Batches (updated)

```sql
CREATE TABLE public.registration_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       uuid REFERENCES public.users(id),
  semester_id     uuid NOT NULL REFERENCES public.semesters(id),

  -- Computed totals (set by pricing engine, server-side only)
  tuition_total           numeric(10,2),
  registration_fee_total  numeric(10,2),
  recital_fee_total       numeric(10,2),
  family_discount_amount  numeric(10,2) NOT NULL DEFAULT 0,
  grand_total             numeric(10,2),

  -- Snapshot: what was in the cart at submission time
  cart_snapshot     jsonb NOT NULL DEFAULT '[]',

  -- Payment
  payment_plan_type text CHECK (payment_plan_type IN (
                      'pay_in_full', 'deposit_50pct', 'auto_pay_monthly'
                    )),
  amount_due_now    numeric(10,2),   -- first payment due at checkout

  -- Processor reference (processor-agnostic)
  payment_reference_id  text UNIQUE,  -- replaces stripe_payment_intent_id

  status          text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                    'pending_payment', 'confirmed', 'failed', 'refunded', 'partial'
                  )),

  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz
);
```

---

### 2.10 Batch Payment Installments

Generated immediately upon batch confirmation. Represents the full payment schedule.

```sql
CREATE TABLE public.batch_payment_installments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              uuid NOT NULL REFERENCES public.registration_batches(id) ON DELETE CASCADE,

  installment_number    integer NOT NULL CHECK (installment_number > 0),
  amount_due            numeric(10,2) NOT NULL,
  due_date              date NOT NULL,

  -- Payment tracking
  status                text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                          'scheduled', 'paid', 'overdue', 'waived', 'processing'
                        )),
  paid_at               timestamptz,
  paid_amount           numeric(10,2),
  payment_reference_id  text,         -- processor reference for this installment
  failure_reason        text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(batch_id, installment_number)
);

CREATE INDEX idx_installments_batch_id ON public.batch_payment_installments(batch_id);
CREATE INDEX idx_installments_due_date ON public.batch_payment_installments(due_date)
  WHERE status = 'scheduled';
```

---

### 2.11 Requirement Waivers

Admin-granted overrides for blocked class requirements.

```sql
CREATE TABLE public.requirement_waivers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id       uuid NOT NULL REFERENCES public.registrations(id),
  requirement_id        uuid NOT NULL REFERENCES public.class_requirements(id),

  waived_by_admin_id    uuid NOT NULL REFERENCES public.users(id),
  reason                text NOT NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(registration_id, requirement_id)
);
```

---

### 2.12 Complete Entity-Relationship Summary

```
semesters
  ├── classes (curriculum entities)
  │     ├── class_requirements (prerequisites + concurrent rules)
  │     └── class_sessions (time slots)
  │           └── session_occurrence_dates (individual class dates)
  ├── tuition_rate_bands (division × weekly_count → price)
  ├── semester_fee_config (registration fee, family discount, auto-pay fee)
  ├── semester_payment_plans (admin payment plan config)
  ├── semester_discounts → discounts (additional discount rules)
  └── registration_batches (family checkout groups)
        ├── registrations (dancer → session enrollment)
        │     └── requirement_waivers
        └── batch_payment_installments (payment schedule)

families
  ├── users (parents/guardians)
  └── dancers → registrations
```

---

## 3. Pricing Engine Design

### 3.1 Authoritative Principles

1. **All pricing computation happens server-side.** No client-submitted total is ever trusted.
2. **The client receives a `PricingQuote` object** for display. It is generated by a server action and treated as read-only on the client.
3. **The `grand_total` stored in `registration_batches` is set by the server** at the moment of batch creation and is the amount of record.
4. **The client never sends a price to the server.** It sends `[sessionId, dancerId]` pairs. The server computes everything.

### 3.2 Inputs and Outputs

**Input to pricing engine:**
```typescript
interface PricingInput {
  semesterId: string;
  familyId: string;
  enrollments: Array<{
    dancerId: string;
    sessionIds: string[];  // class_sessions.id[]
  }>;
  paymentPlanType: 'pay_in_full' | 'deposit_50pct' | 'auto_pay_monthly';
}
```

**Output:**
```typescript
interface PricingQuote {
  perDancer: DancerPricingBreakdown[];

  // Family-level totals
  tuitionSubtotal:         number;  // sum of all dancer tuition
  registrationFeeTotal:    number;  // $40 × number of dancers
  recitalFeeTotal:         number;  // itemized from tuition_rate_bands
  familyDiscountAmount:    number;  // $50 flat if >0 dancers
  autoPayAdminFeeTotal:    number;  // $5/month × installments if auto_pay

  grandTotal:              number;  // what the family actually owes
  amountDueNow:            number;  // first payment (based on plan type)

  lineItems:               LineItem[];
  paymentSchedule:         InstallmentPreview[];
}

interface DancerPricingBreakdown {
  dancerId:         string;
  dancerName:       string;
  division:         string;           // derived from classes enrolled
  weeklyClassCount: number;           // COUNT(DISTINCT class_id)
  tuition:          number;           // from rate band lookup
  recitalFee:       number;           // itemized from tuition
  registrationFee:  number;           // $40
  lineItems:        LineItem[];
}

interface LineItem {
  type:         'tuition' | 'recital_fee' | 'registration_fee' |
                'family_discount' | 'auto_pay_admin_fee';
  label:        string;
  amount:       number;               // positive = charge, negative = credit
  description?: string;
}

interface InstallmentPreview {
  installmentNumber: number;
  amountDue:         number;
  dueDate:           string;
}
```

### 3.3 Server-Side Computation Logic

```typescript
// app/actions/computePricingQuote.ts  (server action)
async function computePricingQuote(input: PricingInput): Promise<PricingQuote> {

  // 1. Fetch fee config for this semester
  const feeConfig = await getFeeConfig(input.semesterId);
  // → { registrationFeePerChild, familyDiscountAmount, autoPayAdminFeeMonthly, installmentCount }

  // 2. Check if family already has confirmed registrations this semester
  //    (determines family discount eligibility)
  const existingFamilyRegistrations = await countConfirmedFamilyRegistrations(
    input.familyId, input.semesterId
  );
  const isFirstFamilyRegistration = existingFamilyRegistrations === 0;

  const perDancer: DancerPricingBreakdown[] = [];

  // 3. Per-dancer computation
  for (const { dancerId, sessionIds } of input.enrollments) {

    // 3a. Fetch the classes for these sessions
    const classes = await getClassesForSessions(sessionIds);
    // → { id, division, name }[]

    // 3b. Determine division
    // All classes for one dancer should share a division.
    // If mixed: use the dominant division, flag as warning.
    const divisions = [...new Set(classes.map(c => c.division))];
    const division = resolveDivision(divisions); // throws if irreconcilable

    // 3c. Weekly class count = distinct class_id count
    const weeklyClassCount = new Set(classes.map(c => c.id)).size;

    // 3d. Look up tuition rate band
    const rateBand = await getRateBand(input.semesterId, division, weeklyClassCount);
    if (!rateBand) throw new Error(
      `No tuition rate configured for ${division} / ${weeklyClassCount} classes/week`
    );

    const tuition     = rateBand.baseTuition;
    const recitalFee  = rateBand.recitalFeeIncluded;
    const tuitionBase = tuition - recitalFee;  // net tuition without recital

    perDancer.push({
      dancerId,
      dancerName: await getDancerName(dancerId),
      division,
      weeklyClassCount,
      tuition,
      recitalFee,
      registrationFee: feeConfig.registrationFeePerChild,
      lineItems: [
        { type: 'tuition',          label: `Tuition (${division}, ${weeklyClassCount}x/week)`, amount: tuitionBase },
        { type: 'recital_fee',      label: 'Recital Fee',      amount: recitalFee },
        { type: 'registration_fee', label: 'Registration Fee', amount: feeConfig.registrationFeePerChild },
      ],
    });
  }

  // 4. Aggregate family-level totals
  const tuitionSubtotal      = perDancer.reduce((s, d) => s + d.tuition, 0);
  const registrationFeeTotal = perDancer.reduce((s, d) => s + d.registrationFee, 0);
  const recitalFeeTotal      = perDancer.reduce((s, d) => s + d.recitalFee, 0);

  // 5. Family discount: $50 flat, once per family per semester
  const familyDiscountAmount = isFirstFamilyRegistration
    ? feeConfig.familyDiscountAmount
    : 0;

  // 6. Auto-pay admin fee: $5/month × installment count
  const autoPayAdminFeeTotal = input.paymentPlanType === 'auto_pay_monthly'
    ? feeConfig.autoPayAdminFeeMonthly * feeConfig.installmentCount
    : 0;

  // 7. Grand total
  const grandTotal =
    tuitionSubtotal +
    registrationFeeTotal -
    familyDiscountAmount +
    autoPayAdminFeeTotal;

  // 8. Payment schedule
  const { amountDueNow, schedule } = buildPaymentSchedule(
    input.paymentPlanType, grandTotal, feeConfig
  );

  return {
    perDancer,
    tuitionSubtotal,
    registrationFeeTotal,
    recitalFeeTotal,
    familyDiscountAmount,
    autoPayAdminFeeTotal,
    grandTotal,
    amountDueNow,
    lineItems: buildFamilyLineItems(perDancer, familyDiscountAmount, autoPayAdminFeeTotal),
    paymentSchedule: schedule,
  };
}
```

### 3.4 Division Resolution Rules

When a dancer enrolls across multiple classes, all should share the same division. Resolve as follows:

```
1. If all classes → same division: use that division. ✓
2. If classes span junior + senior: use senior (higher tier). Flag as admin warning.
3. If any class → competition: treat as competition pricing.
4. If classes span early_childhood + any other: ERROR — block enrollment.
5. Competition team + regular classes: use competition pricing for comp class;
   use regular division pricing for regular classes (billed separately).
```

This rule set must be codified server-side and not left to interpretation.

### 3.5 Where computePricingQuote Is Called

| Call Site | Purpose |
|---|---|
| `app/(user-facing)/register/payment/page.tsx` | Display pricing breakdown before payment |
| `app/actions/createRegistrationBatch.ts` | Compute and lock in the total on server |
| `app/admin/semesters/steps/ReviewStep.tsx` | Admin preview of pricing for a given configuration |

**The client calls `computePricingQuote` for display. The server calls it again at batch creation and stores the result. The two must match — if they don't (e.g., price changed during checkout), return a `PRICE_CHANGED` error and force the user to review the updated quote.**

---

## 4. Validation Architecture

### 4.1 Validation Layers

```
Layer 1: Client-side UX (React, before form submit)
  → Show soft warnings
  → Block "Continue" button for hard violations
  → Purpose: fast feedback, not security

Layer 2: Server action at step transition
  → Re-validate all constraints before persisting state
  → Return structured ValidationResult
  → Purpose: correctness enforcement

Layer 3: Database at batch creation (pre-payment)
  → Final authority check
  → Atomic: creates batch + registrations or fails
  → Purpose: prevent race conditions from concurrent registrations

Layer 4: Payment confirmation
  → Re-validate seat availability (hold may have expired)
  → Purpose: last line of defense before money is taken
```

### 4.2 Constraint Types

#### Time Conflict Detection

A dancer cannot be enrolled in two sessions that overlap on the same day.

```typescript
interface ConflictCheckInput {
  dancerId: string;
  proposedSessionIds: string[];  // new sessions being added
  existingSessionIds: string[];  // already in cart or enrolled
}

interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    sessionA: { id: string; classname: string; day: string; time: string };
    sessionB: { id: string; classname: string; day: string; time: string };
  }>;
}
```

**Conflict = same day_of_week AND (start_time < other.end_time AND end_time > other.start_time)**

This check runs:
1. Client-side on every session added to cart (soft block with error message)
2. Server-side in `createRegistrationBatch` (hard block)
3. As a DB trigger on `registrations` insert (safety net)

#### Prerequisite Validation

```typescript
async function validatePrerequisites(
  dancerId: string,
  classId: string,         // class being enrolled
  semesterId: string
): Promise<ValidationResult> {

  const requirements = await getClassRequirements(classId);

  for (const req of requirements) {

    if (req.requirementType === 'prerequisite_completed') {
      // Check if dancer has a confirmed registration in a class matching
      // the required discipline + level in a PRIOR semester
      const hasCompleted = await checkCompletedPrerequisite(
        dancerId, req.requiredDiscipline, req.requiredLevel
      );
      if (!hasCompleted) {
        return {
          valid: false,
          enforcement: req.enforcement,
          message: req.description,
          requirementId: req.id,
          isWaivable: req.isWaivable,
        };
      }
    }

    if (req.requirementType === 'concurrent_enrollment') {
      // Check if dancer is also being enrolled in the required class
      // (in the same cart/batch)
      const isEnrolled = cartContainsClass(req.requiredClassId, currentCartItems);
      if (!isEnrolled) {
        return {
          valid: false,
          enforcement: req.enforcement,
          message: req.description,
          requirementId: req.id,
          isWaivable: req.isWaivable,
        };
      }
    }

    if (req.requirementType === 'teacher_recommendation') {
      const hasRec = await checkTeacherRecommendation(dancerId, classId, semesterId);
      if (!hasRec) {
        return {
          valid: false,
          enforcement: 'hard_block',  // always hard
          message: req.description,
          requirementId: req.id,
          isWaivable: true,  // admin can waive
        };
      }
    }
  }

  return { valid: true };
}
```

### 4.3 Enforcement Rules

| Requirement Type | Default Enforcement | Can Be Waived? | Who Waives? |
|---|---|---|---|
| prerequisite_completed | hard_block | Yes | Admin |
| concurrent_enrollment | soft_warn → hard at submit | Yes | Admin |
| teacher_recommendation | hard_block | Yes | Admin |
| skill_qualification | hard_block | Yes | Admin |
| audition_required | hard_block | No | — |
| time_conflict | hard_block | No | — |
| age_range | soft_warn | Admin can override | Admin |

### 4.4 Frontend Responsibility

The registration participants page (`register/participants/page.tsx`) must:

1. Run conflict detection on every session assignment change
2. Show a warning banner listing conflicts (with class names and times)
3. Run prerequisite checks per dancer per class being enrolled
4. Show soft warnings inline (amber) and hard blocks as error banners (red)
5. Disable the "Continue" button if any `hard_block` violations exist (without admin waiver)

**The frontend NEVER trusts its own validation as final.** All validation re-runs server-side.

### 4.5 Backend Responsibility

`createRegistrationBatch` server action must:

1. Re-run all constraint checks (conflicts, prerequisites, age range)
2. Check all `hard_block` requirements have either waivers or are satisfied
3. Verify all sessions are still active and within registration window
4. Verify capacity (with `SELECT ... FOR UPDATE` to prevent TOCTOU)
5. Compute pricing quote and store as the authoritative total
6. Only then: create batch + registrations atomically

---

## 5. Payment Plan Modeling

### 5.1 Payment Plan Types

| Type | Description | Admin Fee | Installment Count |
|---|---|---|---|
| `pay_in_full` | Full amount due at checkout | None | 1 |
| `deposit_50pct` | 50% due now, 50% due before semester starts | None | 2 |
| `auto_pay_monthly` | Split into 5 monthly payments, charged automatically | $5/month | 5 |

### 5.2 Payment Schedule Generation

Called immediately upon batch confirmation. Must be called server-side, never client-side.

```typescript
function buildPaymentSchedule(
  planType: PaymentPlanType,
  grandTotal: number,
  semesterStartDate: Date,
  feeConfig: SemesterFeeConfig
): PaymentSchedule {

  if (planType === 'pay_in_full') {
    return {
      amountDueNow: grandTotal,
      installments: [{
        installmentNumber: 1,
        amountDue: grandTotal,
        dueDate: today(),
      }],
    };
  }

  if (planType === 'deposit_50pct') {
    const deposit = Math.round(grandTotal * 0.50 * 100) / 100;
    const balance = grandTotal - deposit;
    const balanceDueDate = addDays(semesterStartDate, -7);  // 1 week before semester

    return {
      amountDueNow: deposit,
      installments: [
        { installmentNumber: 1, amountDue: deposit, dueDate: today() },
        { installmentNumber: 2, amountDue: balance, dueDate: balanceDueDate },
      ],
    };
  }

  if (planType === 'auto_pay_monthly') {
    const adminFeeTotal = feeConfig.autoPayAdminFeeMonthly * feeConfig.installmentCount;
    const totalWithFee  = grandTotal + adminFeeTotal;
    const perInstallment = Math.round((totalWithFee / feeConfig.installmentCount) * 100) / 100;

    // Adjust last installment for rounding
    const installments = [];
    let accum = 0;
    for (let i = 1; i <= feeConfig.installmentCount; i++) {
      const isLast = i === feeConfig.installmentCount;
      const amount = isLast ? (totalWithFee - accum) : perInstallment;
      accum += perInstallment;

      installments.push({
        installmentNumber: i,
        amountDue: amount,
        dueDate: addMonths(today(), i - 1),
      });
    }

    return {
      amountDueNow: perInstallment,
      installments,
    };
  }
}
```

### 5.3 Installment Persistence

Installments are written to `batch_payment_installments` immediately when the batch is created/confirmed:

```
createRegistrationBatch()
  → computePricingQuote()          -- compute grand_total
  → INSERT registration_batches    -- store totals
  → INSERT registrations[]         -- per-dancer-per-session rows
  → buildPaymentSchedule()         -- generate installment dates
  → INSERT batch_payment_installments[] -- write all installments
  → [first payment collection]     -- once processor is integrated
```

### 5.4 Status Tracking

A background job (Supabase edge function or pg_cron) must run daily to:

```
1. SELECT installments WHERE status='scheduled' AND due_date < today()
2. UPDATE status='overdue' for unpaid past-due installments
3. Notify admin of overdue accounts
4. Optionally: block dancer attendance if overdue (future feature)
```

**No student may begin classes without meeting payment requirements.** This rule is enforced by an admin-facing dashboard showing payment status per dancer per batch, not by an automated technical block (until auto-pay is wired).

### 5.5 Processor Integration Upgrade Path

The schema is designed to be processor-agnostic:

```
registration_batches.payment_reference_id  -- any processor's transaction ID
batch_payment_installments.payment_reference_id  -- per-installment reference
```

When integrating a payment processor:

1. `createRegistrationBatch` calls `processor.createPaymentIntent(amountDueNow)`
2. Response ID stored in `registration_batches.payment_reference_id`
3. Processor confirms via webhook → `POST /api/webhooks/payment`
4. Webhook handler: UPDATE batch status, UPDATE installment 1 to paid, send confirmation email
5. For auto-pay: schedule recurring charges on the processor; update installment records on each webhook

No database schema changes are required for this integration. Only new server actions and API route handlers.

---

## 6. Discount Application Logic

### 6.1 AYDT Discount Structure (Authoritative)

For the current semester model, the following discounts apply:

| Discount | Type | Amount | Who Gets It | When |
|---|---|---|---|---|
| Family Discount | Flat reduction | $50 per family per semester | Every family with at least one enrolled dancer | Applied once at family level |
| Volume Discount | Already in rate band | N/A (baked in) | Auto-applied by rate band selection | Do NOT compute separately |
| Competition Team | TBD | TBD | Competition enrollees | Depends on architecture decision (Part 7) |

**Critical rule: Discounts do not stack.** If multiple discount rules exist, apply the most favorable one only (or the explicitly configured one). Do not add them together.

### 6.2 Discount Application in the Pricing Engine

```typescript
function applyDiscounts(
  subtotalBeforeDiscounts: number,
  familyId: string,
  semesterId: string,
  existingRegistrationCount: number
): DiscountResult {

  const discounts: AppliedDiscount[] = [];

  // Rule 1: Family discount — $50 if this is the family's first checkout this semester
  if (existingRegistrationCount === 0) {
    discounts.push({
      type: 'family_discount',
      label: 'Family Discount',
      amount: feeConfig.familyDiscountAmount,  // $50
    });
  }

  // Rule 2: Volume discount — already in rate bands, do NOT add here

  // Rule 3: Competition team discount — TBD (see Part 7)

  // Non-stacking enforcement: take highest single discount if multiple apply
  const highestDiscount = discounts.reduce(
    (max, d) => d.amount > max.amount ? d : max,
    { amount: 0, type: 'none', label: 'None' }
  );

  return {
    appliedDiscounts: [highestDiscount],
    totalDiscountAmount: highestDiscount.amount,
  };
}
```

### 6.3 UI Display Requirements

The cart page and payment page must show:

```
Subtotal (tuition × all dancers)      $2,670.00
  ├── [Dancer A] Tap 2 + Ballet 1A (Junior, 2x/week)
  │     Tuition          $1,645.00
  │     Recital Fee        $150.00
  │     Registration Fee    $40.00
  └── [Dancer B] Hip Hop 1 (Junior, 1x/week)
        Tuition            $875.00
        Recital Fee         $75.00
        Registration Fee    $40.00

Family Discount                        −$50.00
─────────────────────────────────────────────
Total                               $2,620.00

Payment Plan: Auto-Pay (5 months)
Auto-Pay Admin Fee (5 × $5)           +$25.00
─────────────────────────────────────────────
Grand Total                         $2,645.00
Due Today (Installment 1 of 5)        $529.00
```

### 6.4 Existing `discounts` Schema Assessment

The current `discounts` + `discount_rules` + `semester_discounts` schema is architecturally sound but over-engineered for AYDT's actual needs. It supports complex threshold-based rules (multi_person, multi_session) that don't map directly to the family_discount + volume_discount model.

**Recommendation:** Keep the `discounts` schema as a future extension point but do not build the execution engine for it in Phase 1. The `computePricingQuote` function handles all actual discounts directly from `semester_fee_config`. If complex custom discounts are needed later (e.g., scholarship discounts), the existing schema can be activated.

---

## 7. Competition Team Architecture

### Option A — Competition Team as a Class with Flags

**Data model:**
```sql
classes.is_competition_track = true
classes.division = 'competition'
```

Pricing uses the 'competition' tuition rate band. Requirements modeled via `class_requirements`. No new tables.

**Pros:** Simplest. Unified model. Admin UI needs no changes.
**Cons:** Competition team often has bundled requirements (must also take technique, must also take performance) that feel forced into the `class_requirements` model. No way to represent "Competition team is a program, not just a class."

---

### Option B — Bundle Model

```sql
CREATE TABLE class_bundles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id   uuid REFERENCES semesters(id),
  name          text NOT NULL,         -- "Competition Team Fall 2026"
  is_competition boolean NOT NULL DEFAULT false
);

CREATE TABLE class_bundle_members (
  bundle_id     uuid NOT NULL REFERENCES class_bundles(id),
  class_id      uuid NOT NULL REFERENCES classes(id),
  is_required   boolean NOT NULL DEFAULT true,  -- true = must enroll, false = optional add-on
  is_primary    boolean NOT NULL DEFAULT false,  -- the "main" class of the bundle
  PRIMARY KEY (bundle_id, class_id)
);
```

**Pricing:** Bundle has its own flat price or uses the competition division rate band for the primary class. Bundled required classes may be included in the competition pricing (no additional tuition per class).
**Validation:** Enrolling in any bundle member requires enrollment in all `is_required` bundle members.
**Pros:** Explicitly models the "program" concept. Clear for admin to configure.
**Cons:** Adds 2 new tables. Enrollment and pricing logic needs a "bundle-aware" path.

---

### Option C — Separate Product Line

Separate `competition_programs` table, entirely outside the class/session hierarchy. Custom checkout flow.

**Pros:** Maximum isolation. No risk of contaminating the regular enrollment model.
**Cons:** Duplicates the entire registration, pricing, and enrollment system. Very high implementation cost. Diverges from the class/session model.

---

### Option D — Hybrid (Recommended)

Competition team is a **class** with `division='competition'` and `is_competition_track=true`. Required co-enrollments (Technique, specific Ballet level) are modeled as `class_requirements` with `requirement_type='concurrent_enrollment'`. The audition requirement is modeled as `requirement_type='audition_required'`.

**Pricing:** The 'competition' tuition rate band is configured by admin with the competition-specific pricing. Competition dancers may also take regular division classes — those are priced at their regular division rate, with the family discount applied once at the family level.

**No new tables required.** Everything fits within the schema proposed in Part 2.

**If** the competition team relationship becomes complex enough to warrant bundled pricing or explicit bundle membership tracking, activate Option B as an extension — the schema can accommodate both patterns simultaneously.

**Recommendation: Start with Option D. Upgrade to Option D + B (hybrid) when competition team structure is fully defined.**

---

## 8. Phased Implementation Roadmap

### Phase 1 — Schema Refactor (Foundation)
**Goal:** Correct the naming conflict and remove the static-price assumption. No user-facing behavior changes yet.

**Tasks:**
1. Create `classes` table (from `sessions` schema + discipline + division + level columns)
2. Create `class_sessions` table (one row per day_of_week offering)
3. Create `session_occurrence_dates` table (from `session_available_days`)
4. Create `tuition_rate_bands` table (admin populates from Excel chart)
5. Create `semester_fee_config` table
6. Create `class_requirements` table
7. Migrate existing data: map `sessions` → `classes`, generate `class_sessions` from `days_of_week` array
8. Update `registrations.session_id` FK → `class_sessions.id`
9. Remove `sessions.price` and `sessions.registration_fee` columns
10. Update `getSemesterForDisplay` server action to query new schema
11. Update `SemesterForm` steps (SessionsStep, etc.) to write to new schema
12. Update `persistSemesterDraft` to sync against new table structure

**Admin UI changes required:** Sessions step now creates `classes` + `class_sessions`. Admin must input division, discipline, level per class. No user-facing changes.

**Risk:** This is the highest-risk phase. The data migration must be run with a full DB snapshot taken first. All existing sessions become classes, and their `days_of_week` arrays are expanded into individual `class_sessions` rows.

---

### Phase 2 — Pricing Engine
**Goal:** Compute pricing from rate bands. Replace hardcoded `discountAmount: 0`.

**Tasks:**
1. Build `computePricingQuote` server action
2. Build `buildPaymentSchedule` utility
3. Admin: Tuition Rate Band editor UI (in semester flow, after sessions step)
4. Admin: `semester_fee_config` editor (registration fee, family discount, auto-pay fee)
5. Update `CartPageContent` to call `computePricingQuote` and display full breakdown
6. Update payment page to show pricing quote (fetched from server, not client-computed)
7. Update `createRegistrationBatch` to call `computePricingQuote` and store totals
8. Validate: client quote === server quote at batch creation (reject if mismatch)

**Admin UI changes:** Tuition rate band configuration step in semester editor.
**User-facing changes:** Cart and payment pages now show accurate pricing breakdown.

---

### Phase 3 — Validation Engine
**Goal:** Enforce prerequisites, concurrent enrollment, and time conflict rules.

**Tasks:**
1. Build `validatePrerequisites` server utility
2. Build `detectConflicts` server utility
3. Update participants page to run conflict detection client-side on assignment change
4. Update participants page to show prerequisite warnings/blocks
5. Build `requirement_waivers` table + admin waiver UI (in family/registration management)
6. Add server-side validation to `createRegistrationBatch`
7. Add DB trigger for conflict detection (safety net)

---

### Phase 4 — Payment Plan Modeling
**Goal:** Generate installment records. Build admin payment tracking UI.

**Tasks:**
1. Create `batch_payment_installments` table
2. Update `createRegistrationBatch` to insert installment records immediately
3. Build admin payment status dashboard (per-family, per-batch, per-installment)
4. Build overdue detection edge function (pg_cron, daily)
5. Build admin overdue notification system
6. Build registration hold TTL enforcement (warn user before hold expires)

---

### Phase 5 — Payment Processor Integration
**Goal:** Accept actual payment. Gate registration confirmation on payment.

**Tasks:**
1. Choose and integrate payment processor (e.g., Stripe)
2. Build `POST /api/webhooks/payment` webhook handler
3. Update `createRegistrationBatch` to create payment intent before inserting batch
4. Gate registration `status=confirmed` on payment webhook receipt
5. Update confirmation email to fire from webhook handler, not from `createRegistrationBatch`
6. Implement idempotency key on batch creation (prevent duplicate registrations on retry)
7. For auto-pay: set up recurring charge schedule with processor

---

### Phase 6 — Competition Team
**Goal:** Model competition team requirements and pricing.

**Tasks:**
1. Admin: mark classes as `is_competition_track=true`
2. Add `class_requirements` entries for competition concurrent enrollment rules
3. Configure competition tuition rate band
4. If needed: build Option B bundle tables + enrollment validation

---

## 9. Structural Risks

### Risk 1 — Data Migration Complexity (CRITICAL — Phase 1)

The migration from `sessions` (curriculum entity) to `classes` + `class_sessions` (time slots) requires:
- Expanding each `sessions.days_of_week` ARRAY into N rows in `class_sessions`
- Migrating `session_available_days` dates to link to the correct new `class_sessions` row
- Updating all FK references in `registrations`, `waitlist_entries`, `discount_rule_sessions`, `email_recipient_selections`, `session_group_sessions`

**A mistake here corrupts live registration data.** Take a full Supabase DB snapshot. Run migration in a staging environment first. Write a verification query that counts rows before and after and confirms all FK integrity.

---

### Risk 2 — Weekly Class Count Ambiguity (MEDIUM)

If a dancer enrolls in two sessions of the SAME class (e.g., Ballet 1A Monday AND Ballet 1A Thursday), `COUNT(DISTINCT class_id)` = 1, so they are priced as "1 class/week." This may or may not be intended — typically, a student picks ONE time slot for a given class, not both.

**Fix:** Add a constraint in `createRegistrationBatch` that rejects enrollment in multiple sessions of the same class unless a `allow_multiple_sessions_per_class` flag is set on the class. Document this rule explicitly in the admin UI.

---

### Risk 3 — Division Mixed Enrollment Edge Cases (MEDIUM)

Some dancers may legitimately cross divisions (e.g., an advanced Junior taking a Senior-level class). The division resolution logic must handle this without silently assigning the wrong pricing tier.

**Fix:** Add an `override_division` flag to `class_requirements` for classes that accept cross-division enrollment. Document expected pricing behavior per case. Admin must explicitly configure this — it must not be implicit.

---

### Risk 4 — Pricing Quote Drift (MEDIUM)

The pricing quote shown to the user during checkout is fetched at step load time. If the admin changes a tuition rate band between when the user sees the quote and when they confirm, the server-side recomputation at batch creation will produce a different total.

**Fix:** Compare client-visible quote total against server-computed total at batch creation. If they differ by more than a rounding tolerance, return a `PRICE_CHANGED` error to the client with the new quote. Show a "Pricing has been updated — please review" screen before allowing confirmation.

---

### Risk 5 — No Registration Fee Deduplication (LOW-MEDIUM)

The $40 registration fee is per-child per-semester. If a family abandons a checkout, their pending registration is deleted after hold expiry. When they retry, a new registration batch is created and the $40 is charged again. This is correct behavior — but if a batch fails after payment is collected (post-processor integration), the family could be charged $40 without a confirmed registration.

**Fix:** At processor integration time, enforce idempotency with a processor idempotency key tied to `(family_id, semester_id, dancer_id)`. Check for prior `confirmed` batch before charging again.

---

### Risk 6 — Auto-Pay Monthly Fee Accumulation (LOW)

If a family changes their payment plan mid-semester (pay_in_full → auto_pay_monthly), the $5/month admin fee is applied to the remaining installments. The current schema has no "plan change" workflow — plan type is set once at batch creation and stored.

**Fix:** Treat plan changes as admin-only operations with explicit confirmation. Add `plan_changed_at` and `plan_change_reason` to `registration_batches`. Recalculate installments when a plan change is approved.

---

### Risk 7 — Session Occurrence Date Generation (LOW)

`session_occurrence_dates` should be auto-generated from the `class_sessions` schedule (day_of_week + start_date + end_date). If this generation is done manually or in the admin UI, dates can be missing or incorrect.

**Fix:** Write a Postgres function `generate_session_dates(session_id)` that auto-populates `session_occurrence_dates` from the session's schedule. Call it automatically via trigger on `class_sessions INSERT`. Admin can then manually add exceptions (holidays, cancellations) after generation.

---

## Appendix A — Complete SQL for New Tables

```sql
-- 1. Classes (curriculum entity)
CREATE TABLE public.classes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id           uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  discipline            text NOT NULL,
  division              text NOT NULL CHECK (division IN ('early_childhood','junior','senior','competition')),
  level                 text,
  description           text,
  min_age               integer,
  max_age               integer,
  is_active             boolean NOT NULL DEFAULT true,
  is_competition_track  boolean NOT NULL DEFAULT false,
  requires_teacher_rec  boolean NOT NULL DEFAULT false,
  cloned_from_class_id  uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 2. Class Sessions (time slots)
CREATE TABLE public.class_sessions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  semester_id             uuid NOT NULL REFERENCES public.semesters(id),
  day_of_week             text NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  start_time              time NOT NULL,
  end_time                time NOT NULL,
  start_date              date NOT NULL,
  end_date                date NOT NULL,
  location                text,
  instructor_name         text,
  capacity                integer,
  registration_close_at   timestamptz,
  is_active               boolean NOT NULL DEFAULT true,
  cloned_from_session_id  uuid REFERENCES public.class_sessions(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, day_of_week, start_time)
);

-- 3. Session Occurrence Dates
CREATE TABLE public.session_occurrence_dates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  date                date NOT NULL,
  is_cancelled        boolean NOT NULL DEFAULT false,
  cancellation_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, date)
);

-- 4. Class Requirements
CREATE TABLE public.class_requirements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  requirement_type    text NOT NULL CHECK (requirement_type IN (
                        'prerequisite_completed','concurrent_enrollment',
                        'teacher_recommendation','skill_qualification','audition_required'
                      )),
  required_discipline text,
  required_level      text,
  required_class_id   uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  description         text NOT NULL,
  enforcement         text NOT NULL DEFAULT 'hard_block' CHECK (enforcement IN ('soft_warn','hard_block')),
  is_waivable         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 5. Tuition Rate Bands
CREATE TABLE public.tuition_rate_bands (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id           uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  division              text NOT NULL CHECK (division IN ('early_childhood','junior','senior','competition')),
  weekly_class_count    integer NOT NULL CHECK (weekly_class_count > 0),
  base_tuition          numeric(10,2) NOT NULL,
  recital_fee_included  numeric(10,2) NOT NULL DEFAULT 0,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(semester_id, division, weekly_class_count)
);

-- 6. Semester Fee Configuration
CREATE TABLE public.semester_fee_config (
  semester_id                 uuid PRIMARY KEY REFERENCES public.semesters(id) ON DELETE CASCADE,
  registration_fee_per_child  numeric(10,2) NOT NULL DEFAULT 40.00,
  family_discount_amount      numeric(10,2) NOT NULL DEFAULT 50.00,
  auto_pay_admin_fee_monthly  numeric(10,2) NOT NULL DEFAULT 5.00,
  auto_pay_installment_count  integer NOT NULL DEFAULT 5,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- 7. Batch Payment Installments
CREATE TABLE public.batch_payment_installments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              uuid NOT NULL REFERENCES public.registration_batches(id) ON DELETE CASCADE,
  installment_number    integer NOT NULL CHECK (installment_number > 0),
  amount_due            numeric(10,2) NOT NULL,
  due_date              date NOT NULL,
  status                text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid','overdue','waived','processing')),
  paid_at               timestamptz,
  paid_amount           numeric(10,2),
  payment_reference_id  text,
  failure_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id, installment_number)
);

-- 8. Requirement Waivers
CREATE TABLE public.requirement_waivers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     uuid NOT NULL REFERENCES public.registrations(id),
  requirement_id      uuid NOT NULL REFERENCES public.class_requirements(id),
  waived_by_admin_id  uuid NOT NULL REFERENCES public.users(id),
  reason              text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(registration_id, requirement_id)
);
```

---

*Design document version 1.0*
*AYDT Registration System — Class/Session/Tuition Refactor*
*Author: Systems Architecture Review | Date: February 26, 2026*
