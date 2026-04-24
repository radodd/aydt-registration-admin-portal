-- =============================================================================
-- Migration: attendance table
-- Date: 2026-04-16
-- Purpose: Track per-student, per-occurrence-date attendance for class sessions.
--          Instructors mark each student present, absent, tardy, or excused,
--          with an optional free-form note.
-- =============================================================================

-- ─── 1. Enum ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'tardy', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance (
  id                 uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid                     NOT NULL REFERENCES public.class_sessions(id)          ON DELETE CASCADE,
  occurrence_date_id uuid                              REFERENCES public.session_occurrence_dates(id) ON DELETE SET NULL,
  dancer_id          uuid                     NOT NULL REFERENCES public.dancers(id)                 ON DELETE CASCADE,
  status             public.attendance_status NOT NULL,
  note               text,
  -- The instructor (or admin) who last marked/updated this record.
  marked_by          uuid                     NOT NULL REFERENCES public.users(id),
  created_at         timestamptz              NOT NULL DEFAULT now(),
  updated_at         timestamptz              NOT NULL DEFAULT now()
);

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS attendance_session_id_idx
  ON public.attendance(session_id);

CREATE INDEX IF NOT EXISTS attendance_dancer_id_idx
  ON public.attendance(dancer_id);

CREATE INDEX IF NOT EXISTS attendance_occurrence_date_id_idx
  ON public.attendance(occurrence_date_id);

-- ─── 4. Uniqueness ────────────────────────────────────────────────────────────
-- One record per (session, occurrence date, dancer).
-- Two partial indexes handle the nullable occurrence_date_id correctly,
-- since NULL != NULL in a standard UNIQUE constraint.

CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique_with_occurrence
  ON public.attendance(session_id, occurrence_date_id, dancer_id)
  WHERE occurrence_date_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique_no_occurrence
  ON public.attendance(session_id, dancer_id)
  WHERE occurrence_date_id IS NULL;

-- ─── 5. updated_at trigger ───────────────────────────────────────────────────
-- Reuses the set_updated_at() function added in 20260416000001_family_contacts.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_updated_at'
  ) THEN
    CREATE TRIGGER attendance_updated_at
    BEFORE UPDATE ON public.attendance
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Admins: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_admin_all'
      AND tablename  = 'attendance'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY attendance_admin_all ON public.attendance
      FOR ALL TO authenticated
      USING     (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

-- Instructors: can read all attendance records (supports "All Classes" browse
-- where they view attendance another instructor has marked, read-only).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_instructor_select'
      AND tablename  = 'attendance'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY attendance_instructor_select ON public.attendance
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;

-- Instructors: can insert attendance only for sessions they are assigned to.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_instructor_insert'
      AND tablename  = 'attendance'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY attendance_instructor_insert ON public.attendance
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_instructor()
        AND marked_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.class_session_instructors csi
          WHERE csi.session_id = attendance.session_id
            AND csi.user_id    = auth.uid()
        )
      );
  END IF;
END $$;

-- Instructors: can update records they personally marked.
-- Prevents one instructor from silently overwriting another's records.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_instructor_update'
      AND tablename  = 'attendance'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY attendance_instructor_update ON public.attendance
      FOR UPDATE TO authenticated
      USING (
        public.is_instructor()
        AND marked_by = auth.uid()
      )
      WITH CHECK (
        public.is_instructor()
        AND marked_by = auth.uid()
      );
  END IF;
END $$;

-- Service role: full bypass (edge functions, cron jobs).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_service_role'
      AND tablename  = 'attendance'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY attendance_service_role ON public.attendance
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
