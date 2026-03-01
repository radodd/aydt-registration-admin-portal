-- =============================================================================
-- Phase 1 — Data Migration
--
-- Migrates existing data from old tables (sessions, session_available_days) to
-- new tables (classes, class_sessions, session_occurrence_dates) and updates
-- every FK reference that pointed at sessions(id).
--
-- PREREQUISITES:
--   1. Run 20260226000001_phase1_new_tables.sql first.
--   2. Take a full Supabase DB snapshot BEFORE running this file.
--   3. Run in a staging environment first.
--
-- FK columns updated by this migration:
--   registrations.session_id             → class_sessions(id)
--   session_group_sessions.session_id    → class_sessions(id)
--   waitlist_entries.session_id          → class_sessions(id)
--   discount_rule_sessions.session_id    → class_sessions(id)
--   email_recipient_selections.session_id → class_sessions(id)  [conditional]
--
-- After success, run verification queries at the bottom of this file.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — sessions → classes
--
-- NOTE: discipline and division default to 'ballet' / 'junior'.
--       Admins MUST update these per class after migration.
--       The 'level' column is populated from the old 'type' field as a
--       placeholder — admins should review and correct.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.classes (
  id, semester_id, name, discipline, division, level,
  description, min_age, max_age, is_active, created_at, updated_at
)
SELECT
  id,
  semester_id,
  title            AS name,
  'ballet'         AS discipline,   -- ⚠ Admin must update discipline per class
  'junior'         AS division,     -- ⚠ Admin must update division per class
  type             AS level,        -- repurposed from old type field
  description,
  min_age,
  max_age,
  is_active,
  created_at,
  now()            AS updated_at
FROM public.sessions
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Build day-expansion mapping table
--
-- Each row in sessions.days_of_week[] becomes one row in class_sessions.
-- For sessions with NULL / empty days_of_week, a single 'monday' placeholder
-- is created — admin must correct after migration.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _csmap (
  old_session_id  uuid  NOT NULL,
  day_of_week     text  NOT NULL,
  new_cs_id       uuid  NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (old_session_id, day_of_week)
);

-- Sessions with explicit days_of_week — one row per day
INSERT INTO _csmap (old_session_id, day_of_week, new_cs_id)
SELECT
  id                                   AS old_session_id,
  lower(trim(d))                       AS day_of_week,
  gen_random_uuid()                    AS new_cs_id
FROM public.sessions, unnest(COALESCE(days_of_week, ARRAY[]::text[])) AS d
WHERE days_of_week IS NOT NULL
  AND array_length(days_of_week, 1) > 0
ON CONFLICT (old_session_id, day_of_week) DO NOTHING;

-- Sessions with no days_of_week — placeholder 'monday' row
INSERT INTO _csmap (old_session_id, day_of_week, new_cs_id)
SELECT
  id      AS old_session_id,
  'monday' AS day_of_week,
  gen_random_uuid()
FROM public.sessions s
WHERE NOT EXISTS (
  SELECT 1 FROM _csmap m WHERE m.old_session_id = s.id
)
ON CONFLICT (old_session_id, day_of_week) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Insert class_sessions
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.class_sessions (
  id, class_id, semester_id, day_of_week,
  start_time, end_time, start_date, end_date,
  location, capacity, registration_close_at, is_active
)
SELECT
  m.new_cs_id,
  s.id           AS class_id,
  s.semester_id,
  m.day_of_week,
  CASE
    WHEN s.start_time IS NOT NULL AND trim(s.start_time) <> ''
    THEN trim(s.start_time)::time
    ELSE NULL
  END            AS start_time,
  CASE
    WHEN s.end_time IS NOT NULL AND trim(s.end_time) <> ''
    THEN trim(s.end_time)::time
    ELSE NULL
  END            AS end_time,
  CASE WHEN s.start_date IS NOT NULL THEN s.start_date::date ELSE NULL END,
  CASE WHEN s.end_date   IS NOT NULL THEN s.end_date::date   ELSE NULL END,
  s.location,
  s.capacity,
  s.registration_close_at,
  s.is_active
FROM _csmap m
JOIN public.sessions s ON s.id = m.old_session_id
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — session_available_days → session_occurrence_dates
--
-- Each available date is matched to the class_session whose day_of_week
-- matches the calendar day of the date.  Falls back to the first class_session
-- for that class if no day-of-week match is found (handles data inconsistencies).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.session_occurrence_dates (id, session_id, date, created_at)
SELECT
  sad.id,
  COALESCE(
    -- Try: match by day of week
    (
      SELECT m.new_cs_id
      FROM   _csmap m
      WHERE  m.old_session_id = sad.session_id
        AND  m.day_of_week = lower(trim(to_char(sad.date::date, 'Day')))
      LIMIT 1
    ),
    -- Fallback: first class_session for this class (alphabetical by day)
    (
      SELECT m.new_cs_id
      FROM   _csmap m
      WHERE  m.old_session_id = sad.session_id
      ORDER  BY m.day_of_week
      LIMIT  1
    )
  ) AS session_id,
  sad.date::date,
  now()
FROM public.session_available_days sad
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 — Update registrations.session_id  → class_sessions(id)
--
-- Each registration maps to the first class_session of its old session
-- (ordered by day_of_week).  This is the safest default: it preserves the
-- association with the class while acknowledging that the exact day was not
-- captured in the old schema.  Admins can correct individual records if needed.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS _new_session_id uuid;

UPDATE public.registrations r
SET    _new_session_id = (
  SELECT m.new_cs_id
  FROM   _csmap m
  WHERE  m.old_session_id = r.session_id
  ORDER  BY m.day_of_week
  LIMIT  1
)
WHERE r.session_id IS NOT NULL;

-- Drop the old FK (Supabase auto-names it; use IF EXISTS for safety)
ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_session_id_fkey;

ALTER TABLE public.registrations
  DROP COLUMN IF EXISTS session_id;

ALTER TABLE public.registrations
  RENAME COLUMN _new_session_id TO session_id;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);

CREATE INDEX IF NOT EXISTS idx_registrations_session_id ON public.registrations(session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 — Update session_group_sessions.session_id  → class_sessions(id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.session_group_sessions
  ADD COLUMN IF NOT EXISTS _new_session_id uuid;

UPDATE public.session_group_sessions sgs
SET    _new_session_id = (
  SELECT m.new_cs_id
  FROM   _csmap m
  WHERE  m.old_session_id = sgs.session_id
  ORDER  BY m.day_of_week
  LIMIT  1
)
WHERE sgs.session_id IS NOT NULL;

ALTER TABLE public.session_group_sessions
  DROP CONSTRAINT IF EXISTS session_group_sessions_session_id_fkey;

ALTER TABLE public.session_group_sessions
  DROP COLUMN IF EXISTS session_id;

ALTER TABLE public.session_group_sessions
  RENAME COLUMN _new_session_id TO session_id;

ALTER TABLE public.session_group_sessions
  ADD CONSTRAINT session_group_sessions_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7 — Update waitlist_entries.session_id  → class_sessions(id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS _new_session_id uuid;

UPDATE public.waitlist_entries we
SET    _new_session_id = (
  SELECT m.new_cs_id
  FROM   _csmap m
  WHERE  m.old_session_id = we.session_id
  ORDER  BY m.day_of_week
  LIMIT  1
)
WHERE we.session_id IS NOT NULL;

ALTER TABLE public.waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_session_id_fkey;

ALTER TABLE public.waitlist_entries
  DROP COLUMN IF EXISTS session_id;

ALTER TABLE public.waitlist_entries
  RENAME COLUMN _new_session_id TO session_id;

ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT waitlist_entries_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_session_id ON public.waitlist_entries(session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8 — Update discount_rule_sessions.session_id  → class_sessions(id)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'discount_rule_sessions'
  ) THEN
    ALTER TABLE public.discount_rule_sessions
      ADD COLUMN IF NOT EXISTS _new_session_id uuid;

    UPDATE public.discount_rule_sessions drs
    SET    _new_session_id = (
      SELECT m.new_cs_id
      FROM   _csmap m
      WHERE  m.old_session_id = drs.session_id
      ORDER  BY m.day_of_week
      LIMIT  1
    )
    WHERE drs.session_id IS NOT NULL;

    ALTER TABLE public.discount_rule_sessions
      DROP CONSTRAINT IF EXISTS discount_rule_sessions_session_id_fkey;

    ALTER TABLE public.discount_rule_sessions
      DROP COLUMN IF EXISTS session_id;

    ALTER TABLE public.discount_rule_sessions
      RENAME COLUMN _new_session_id TO session_id;

    ALTER TABLE public.discount_rule_sessions
      ADD CONSTRAINT discount_rule_sessions_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9 — Update email_recipient_selections.session_id  → class_sessions(id)
--          (conditional — only if the column exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'email_recipient_selections'
      AND  column_name  = 'session_id'
  ) THEN
    ALTER TABLE public.email_recipient_selections
      ADD COLUMN IF NOT EXISTS _new_session_id uuid;

    UPDATE public.email_recipient_selections ers
    SET    _new_session_id = (
      SELECT m.new_cs_id
      FROM   _csmap m
      WHERE  m.old_session_id = ers.session_id
      ORDER  BY m.day_of_week
      LIMIT  1
    )
    WHERE ers.session_id IS NOT NULL;

    ALTER TABLE public.email_recipient_selections
      DROP CONSTRAINT IF EXISTS email_recipient_selections_session_id_fkey;

    ALTER TABLE public.email_recipient_selections
      DROP COLUMN IF EXISTS session_id;

    ALTER TABLE public.email_recipient_selections
      RENAME COLUMN _new_session_id TO session_id;

    ALTER TABLE public.email_recipient_selections
      ADD CONSTRAINT email_recipient_selections_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10 — Drop old tables
--           CASCADE removes any remaining FK constraints on these tables.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.session_available_days CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;

COMMIT;

-- =============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- Run these manually after the migration to confirm data integrity.
-- =============================================================================
--
-- 1. Row counts
--    SELECT COUNT(*) FROM public.classes;                  -- should equal old sessions count
--    SELECT COUNT(*) FROM public.class_sessions;           -- should be >= old sessions count
--    SELECT COUNT(*) FROM public.session_occurrence_dates; -- should equal old session_available_days count
--
-- 2. Orphaned registrations (should be 0)
--    SELECT COUNT(*) FROM public.registrations WHERE session_id IS NULL;
--
-- 3. Orphaned waitlist entries (should be 0)
--    SELECT COUNT(*) FROM public.waitlist_entries WHERE session_id IS NULL;
--
-- 4. FK integrity check — all class_sessions belong to the right semester
--    SELECT COUNT(*) FROM public.class_sessions cs
--    JOIN public.classes c ON c.id = cs.class_id
--    WHERE cs.semester_id <> c.semester_id;  -- should be 0
--
-- 5. Classes needing discipline/division update
--    SELECT id, name, discipline, division FROM public.classes
--    WHERE discipline = 'ballet' AND division = 'junior';  -- admin must review these
-- =============================================================================
