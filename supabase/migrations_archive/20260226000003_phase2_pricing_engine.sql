-- =============================================================================
-- Phase 2 — Pricing Engine Tables
--
-- Creates registration_batches and batch_payment_installments.
-- These are additive changes — no existing data is modified or dropped.
--
-- Run AFTER Phase 1 migrations (000001 and 000002).
-- Take a full Supabase DB snapshot before running.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. registration_batches
--    One row per family checkout. Stores computed pricing totals and
--    payment plan details. Individual registrations link back here via batch_id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registration_batches (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who
  family_id               uuid,         -- references families; no FK constraint (table may vary per project)
  parent_id               uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  semester_id             uuid          NOT NULL REFERENCES public.semesters(id),

  -- Pricing snapshot (computed server-side, never client-submitted)
  tuition_total           numeric(10,2),
  registration_fee_total  numeric(10,2),
  recital_fee_total       numeric(10,2),
  family_discount_amount  numeric(10,2) NOT NULL DEFAULT 0,
  auto_pay_admin_fee_total numeric(10,2) NOT NULL DEFAULT 0,
  grand_total             numeric(10,2),

  -- Payment plan
  payment_plan_type       text
                          CHECK (payment_plan_type IN (
                            'pay_in_full', 'deposit_50pct', 'auto_pay_monthly'
                          )),
  amount_due_now          numeric(10,2),

  -- Cart snapshot at submission time (array of {dancerId, sessionId})
  cart_snapshot           jsonb         NOT NULL DEFAULT '[]',

  -- Processor reference (processor-agnostic, replaces stripe_payment_intent_id)
  payment_reference_id    text          UNIQUE,

  status                  text          NOT NULL DEFAULT 'pending_payment'
                          CHECK (status IN (
                            'pending_payment', 'confirmed', 'failed',
                            'refunded', 'partial'
                          )),

  created_at              timestamptz   NOT NULL DEFAULT now(),
  confirmed_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_batches_family_id    ON public.registration_batches(family_id);
CREATE INDEX IF NOT EXISTS idx_batches_semester_id  ON public.registration_batches(semester_id);
CREATE INDEX IF NOT EXISTS idx_batches_status       ON public.registration_batches(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. batch_payment_installments
--    Generated immediately upon batch creation. Represents the full payment
--    schedule. One row per installment.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batch_payment_installments (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                uuid          NOT NULL REFERENCES public.registration_batches(id) ON DELETE CASCADE,

  installment_number      integer       NOT NULL CHECK (installment_number > 0),
  amount_due              numeric(10,2) NOT NULL,
  due_date                date          NOT NULL,

  -- Payment tracking
  status                  text          NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN (
                            'scheduled', 'paid', 'overdue', 'waived', 'processing'
                          )),
  paid_at                 timestamptz,
  paid_amount             numeric(10,2),
  payment_reference_id    text,
  failure_reason          text,

  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  UNIQUE(batch_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_installments_batch_id ON public.batch_payment_installments(batch_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON public.batch_payment_installments(due_date)
  WHERE status = 'scheduled';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add family_id column to registrations (if not present)
--    and a nullable registration_batch_id FK for new-style registrations.
--
--    NOTE: The existing `batch_id` UUID column on registrations is kept as-is
--    for backward compatibility. New code sets registration_batch_id (FK).
--    Both columns may coexist during the transition period.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS registration_batch_id uuid
    REFERENCES public.registration_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_batch_fk
  ON public.registrations(registration_batch_id)
  WHERE registration_batch_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query (run manually to confirm tables were created):
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN (
--       'registration_batches', 'batch_payment_installments'
--     );
--
-- Expected: 2 rows returned.
-- ─────────────────────────────────────────────────────────────────────────────
