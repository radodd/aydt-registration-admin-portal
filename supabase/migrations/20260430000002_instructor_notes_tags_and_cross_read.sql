-- =============================================================================
-- Migration: instructor_student_notes — add tag column, allow cross-instructor
--            reads (author-only writes), and let instructors keep multiple
--            notes per dancer.
-- Date: 2026-04-30
-- =============================================================================

-- ─── 1. Tag column ────────────────────────────────────────────────────────────

ALTER TABLE public.instructor_student_notes
  ADD COLUMN IF NOT EXISTS tag text
  CHECK (tag IS NULL OR tag IN ('progress', 'behavior', 'goal', 'general'));

CREATE INDEX IF NOT EXISTS instructor_student_notes_tag_idx
  ON public.instructor_student_notes(tag);

-- ─── 2. Replace single "own-only" policy with split read/write policies ──────
-- Old policy gave the writing instructor full SELECT/INSERT/UPDATE/DELETE on
-- their own rows and NO access to others' rows. We now want:
--   • any instructor: SELECT all notes
--   • only the author instructor: INSERT / UPDATE / DELETE their own rows

DROP POLICY IF EXISTS isn_instructor_own ON public.instructor_student_notes;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_instructor_select_all'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_instructor_select_all ON public.instructor_student_notes
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_instructor_insert_own'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_instructor_insert_own ON public.instructor_student_notes
      FOR INSERT TO authenticated
      WITH CHECK (public.is_instructor() AND instructor_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_instructor_update_own'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_instructor_update_own ON public.instructor_student_notes
      FOR UPDATE TO authenticated
      USING     (public.is_instructor() AND instructor_id = auth.uid())
      WITH CHECK (public.is_instructor() AND instructor_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'isn_instructor_delete_own'
      AND tablename  = 'instructor_student_notes'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY isn_instructor_delete_own ON public.instructor_student_notes
      FOR DELETE TO authenticated
      USING (public.is_instructor() AND instructor_id = auth.uid());
  END IF;
END $$;

-- ─── 3. Instructor SELECT on family_contacts ────────────────────────────────
-- Roster page reads family contacts to render contact rows. Instructors
-- need read access; admin policy already exists.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_contacts_instructor_read'
      AND tablename  = 'family_contacts'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_contacts_instructor_read ON public.family_contacts
      FOR SELECT TO authenticated
      USING (public.is_instructor());
  END IF;
END $$;

-- Instructors can also add new contacts (e.g. capture an emergency contact
-- on the spot from the dancer profile page).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_contacts_instructor_insert'
      AND tablename  = 'family_contacts'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_contacts_instructor_insert ON public.family_contacts
      FOR INSERT TO authenticated
      WITH CHECK (public.is_instructor());
  END IF;
END $$;
