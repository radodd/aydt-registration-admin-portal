-- =============================================================================
-- Migration: Instructor SELECT access on schedule_enrollments
-- Date: 2026-04-30
-- Purpose: Roster query reads schedule_enrollments to find every dancer
--          enrolled in a class schedule. Instructors need SELECT access
--          on this table the same way they got it for registrations
--          in 20260416000003_instructor_sessions_junction.sql.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'schedule_enrollments_instructor_read'
      AND tablename  = 'schedule_enrollments'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY schedule_enrollments_instructor_read ON public.schedule_enrollments
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;
