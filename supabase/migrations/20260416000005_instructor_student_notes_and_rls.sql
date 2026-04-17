-- =============================================================================
-- Migration: instructor_student_notes
-- Date: 2026-04-16
-- Purpose: Private notes that an instructor writes about an individual dancer.
--          Visible only to the writing instructor and admins — not to parents
--          or other instructors.
-- =============================================================================

-- ─── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.instructor_student_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid        NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  dancer_id     uuid        NOT NULL REFERENCES public.dancers(id)  ON DELETE CASCADE,
  note          text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructor_student_notes_instructor_id_idx
  ON public.instructor_student_notes(instructor_id);

CREATE INDEX IF NOT EXISTS instructor_student_notes_dancer_id_idx
  ON public.instructor_student_notes(dancer_id);

-- ─── 2. updated_at trigger ───────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'instructor_student_notes_updated_at'
  ) THEN
    CREATE TRIGGER instructor_student_notes_updated_at
    BEFORE UPDATE ON public.instructor_student_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.instructor_student_notes ENABLE ROW LEVEL SECURITY;

-- Admins: full access (can see all notes for oversight, create notes on behalf
-- of an instructor, or delete inappropriate entries).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_admin_all'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_admin_all ON public.instructor_student_notes
      FOR ALL TO authenticated
      USING     (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

-- Instructors: can read, insert, and update ONLY their own notes.
-- Another instructor cannot read or modify a colleague's private notes.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_instructor_own'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_instructor_own ON public.instructor_student_notes
      FOR ALL TO authenticated
      USING     (public.is_instructor() AND instructor_id = auth.uid())
      WITH CHECK (public.is_instructor() AND instructor_id = auth.uid());
  END IF;
END $$;

-- Service role: full bypass.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_service_role'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_service_role ON public.instructor_student_notes
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
