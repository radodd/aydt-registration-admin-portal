-- =============================================================================
-- Migration: class_session_instructors junction table
-- Date: 2026-04-16
-- Purpose: Replace single instructor_id on class_sessions with a proper
--          many-to-many relationship so sessions can have a lead instructor
--          plus one or more assistants.
--          Also broadens existing instructor RLS policies so instructors can
--          browse all classes (not just their own) and read all enrolled
--          students' info.
-- =============================================================================

-- ─── 1. Junction table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.class_session_instructors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES public.class_sessions(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  is_lead     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS class_session_instructors_session_id_idx
  ON public.class_session_instructors(session_id);

CREATE INDEX IF NOT EXISTS class_session_instructors_user_id_idx
  ON public.class_session_instructors(user_id);

-- ─── 2. RLS on class_session_instructors ─────────────────────────────────────

ALTER TABLE public.class_session_instructors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'csi_admin_all'
      AND tablename  = 'class_session_instructors'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY csi_admin_all ON public.class_session_instructors
      FOR ALL TO authenticated
      USING     (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

-- Instructors can read all assignments so the "All Classes" browse works.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'csi_instructor_select'
      AND tablename  = 'class_session_instructors'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY csi_instructor_select ON public.class_session_instructors
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'csi_service_role'
      AND tablename  = 'class_session_instructors'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY csi_service_role ON public.class_session_instructors
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 3. Broaden existing instructor read policies ─────────────────────────────
-- The original policies (from 20260323000001) scoped instructors to sessions
-- where instructor_id = auth.uid() (single-instructor model).
-- Instructors now browse all classes, so we replace those with is_instructor().

-- class_sessions
DROP POLICY IF EXISTS class_sessions_instructor_read ON public.class_sessions;
CREATE POLICY class_sessions_instructor_read ON public.class_sessions
  FOR SELECT TO authenticated
  USING (public.is_instructor());

-- classes
DROP POLICY IF EXISTS classes_instructor_read ON public.classes;
CREATE POLICY classes_instructor_read ON public.classes
  FOR SELECT TO authenticated
  USING (public.is_instructor());

-- class_requirements
DROP POLICY IF EXISTS class_requirements_instructor_read ON public.class_requirements;
CREATE POLICY class_requirements_instructor_read ON public.class_requirements
  FOR SELECT TO authenticated
  USING (public.is_instructor());

-- session_occurrence_dates
DROP POLICY IF EXISTS session_occurrence_dates_instructor_read ON public.session_occurrence_dates;
CREATE POLICY session_occurrence_dates_instructor_read ON public.session_occurrence_dates
  FOR SELECT TO authenticated
  USING (public.is_instructor());

-- ─── 4. Add instructor read access to registrations ──────────────────────────
-- Instructors need to read registrations to build class rosters.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'registrations_instructor_read'
      AND tablename  = 'registrations'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY registrations_instructor_read ON public.registrations
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;

-- ─── 5. Add instructor read access to dancers ────────────────────────────────
-- Instructors need to read dancer profiles (name, contact info) for their rosters.
-- Payment data is on registration_batches/payments, which remain admin-only.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'dancers_instructor_read'
      AND tablename  = 'dancers'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY dancers_instructor_read ON public.dancers
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;

-- ─── 6. Add instructor read access to users (parent contact info) ─────────────
-- Instructors need parent names/phone/email shown on the roster.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users_instructor_read'
      AND tablename  = 'users'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY users_instructor_read ON public.users
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;
