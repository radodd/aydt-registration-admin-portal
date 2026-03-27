-- =============================================================================
-- Migration: Enable RLS on 9 unprotected tables + instructor role support
-- Date: 2026-03-23
-- Resolves: V-2 (CRITICAL) — 9 tables without Row-Level Security
-- =============================================================================

-- ─── Step 1: Add 'instructor' to allowed user roles ─────────────────────────

ALTER TABLE public.users
  DROP CONSTRAINT users_role_check,
  ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'parent'::text, 'instructor'::text]));

-- ─── Step 2: Create is_instructor() helper function ─────────────────────────

CREATE OR REPLACE FUNCTION public.is_instructor() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'instructor'
  );
$$;

-- ─── Step 3: Add instructor_id FK to class_sessions ─────────────────────────
-- Currently instructors are identified by instructor_name (text).
-- Adding instructor_id enables RLS policies scoped to the instructor's user.

ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS instructor_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_instructor_id
  ON public.class_sessions(instructor_id);

-- ─── Step 4: Enable RLS on all 9 tables ─────────────────────────────────────

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_occurrence_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuition_rate_bands ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Step 5: Create policies per table
-- =============================================================================
-- Pattern reference:
--   admin/super_admin → full CRUD via is_admin_or_super()
--   service_role      → full bypass (webhooks, cron, edge functions)
--   parent            → scoped reads via auth.uid() join path
--   instructor        → scoped reads via instructor_id on class_sessions
--   public catalog    → SELECT on published semesters
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Sensitive: contains transaction IDs, amounts, raw EPG responses
-- Parents can read their own payments (via registration_batches.parent_id)
-- No instructor access — payment data is admin-only

CREATE POLICY payments_admin_all ON public.payments
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY payments_parent_read ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.registration_batches rb
      WHERE rb.id = payments.registration_batch_id
        AND rb.parent_id = auth.uid()
    )
  );

CREATE POLICY payments_parent_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.registration_batches rb
      WHERE rb.id = payments.registration_batch_id
        AND rb.parent_id = auth.uid()
    )
  );

CREATE POLICY payments_parent_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.registration_batches rb
      WHERE rb.id = payments.registration_batch_id
        AND rb.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.registration_batches rb
      WHERE rb.id = payments.registration_batch_id
        AND rb.parent_id = auth.uid()
    )
  );

CREATE POLICY payments_service_role ON public.payments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- BATCH_PAYMENT_INSTALLMENTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Parents can read their own installment schedules
-- No instructor access

CREATE POLICY batch_installments_admin_all ON public.batch_payment_installments
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY batch_installments_parent_read ON public.batch_payment_installments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.registration_batches rb
      WHERE rb.id = batch_payment_installments.batch_id
        AND rb.parent_id = auth.uid()
    )
  );

CREATE POLICY batch_installments_service_role ON public.batch_payment_installments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_SESSIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- Public catalog: anyone can read sessions for published semesters
-- Instructors can read sessions they're assigned to

CREATE POLICY class_sessions_admin_all ON public.class_sessions
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_sessions_public_read ON public.class_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = class_sessions.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_sessions_instructor_read ON public.class_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    AND class_sessions.instructor_id = auth.uid()
  );

CREATE POLICY class_sessions_service_role ON public.class_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASSES
-- ─────────────────────────────────────────────────────────────────────────────
-- Public catalog: anyone can read classes for published semesters
-- Instructors can read classes they have sessions assigned to

CREATE POLICY classes_admin_all ON public.classes
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY classes_public_read ON public.classes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = classes.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY classes_instructor_read ON public.classes
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    AND EXISTS (
      SELECT 1 FROM public.class_sessions cs
      WHERE cs.class_id = classes.id
        AND cs.instructor_id = auth.uid()
    )
  );

CREATE POLICY classes_service_role ON public.classes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_REQUIREMENTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Public catalog: parents need to see requirements during registration
-- Instructors can view requirements for their classes

CREATE POLICY class_requirements_admin_all ON public.class_requirements
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_requirements_public_read ON public.class_requirements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.semesters s ON s.id = c.semester_id
      WHERE c.id = class_requirements.class_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_requirements_instructor_read ON public.class_requirements
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    AND EXISTS (
      SELECT 1 FROM public.class_sessions cs
      WHERE cs.class_id = class_requirements.class_id
        AND cs.instructor_id = auth.uid()
    )
  );

CREATE POLICY class_requirements_service_role ON public.class_requirements
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- REQUIREMENT_WAIVERS
-- ─────────────────────────────────────────────────────────────────────────────
-- Admin-only writes (waivers are granted by admins)
-- Parents can read waivers for their own children

CREATE POLICY requirement_waivers_admin_all ON public.requirement_waivers
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY requirement_waivers_parent_read ON public.requirement_waivers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dancers d
      JOIN public.users u ON u.family_id = d.family_id
      WHERE d.id = requirement_waivers.dancer_id
        AND u.id = auth.uid()
    )
  );

CREATE POLICY requirement_waivers_service_role ON public.requirement_waivers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEMESTER_FEE_CONFIG
-- ─────────────────────────────────────────────────────────────────────────────
-- Public read: pricing engine needs this during checkout for published semesters
-- Admin-only writes

CREATE POLICY semester_fee_config_admin_all ON public.semester_fee_config
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY semester_fee_config_public_read ON public.semester_fee_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = semester_fee_config.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY semester_fee_config_service_role ON public.semester_fee_config
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION_OCCURRENCE_DATES
-- ─────────────────────────────────────────────────────────────────────────────
-- Public read: per-day enrollment display needs this
-- Instructors can read dates for their sessions

CREATE POLICY session_occurrence_dates_admin_all ON public.session_occurrence_dates
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY session_occurrence_dates_public_read ON public.session_occurrence_dates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_sessions cs
      JOIN public.semesters s ON s.id = cs.semester_id
      WHERE cs.id = session_occurrence_dates.session_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY session_occurrence_dates_instructor_read ON public.session_occurrence_dates
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    AND EXISTS (
      SELECT 1 FROM public.class_sessions cs
      WHERE cs.id = session_occurrence_dates.session_id
        AND cs.instructor_id = auth.uid()
    )
  );

CREATE POLICY session_occurrence_dates_service_role ON public.session_occurrence_dates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- TUITION_RATE_BANDS
-- ─────────────────────────────────────────────────────────────────────────────
-- Public read: pricing engine needs this during checkout for published semesters
-- Admin-only writes

CREATE POLICY tuition_rate_bands_admin_all ON public.tuition_rate_bands
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY tuition_rate_bands_public_read ON public.tuition_rate_bands
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = tuition_rate_bands.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY tuition_rate_bands_service_role ON public.tuition_rate_bands
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
