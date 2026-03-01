-- =============================================================================
-- Phase 3 — Validation Engine Tables & Triggers
--
-- Creates:
--   1. requirement_waivers     — admin-granted override for a class requirement
--   2. trg_check_time_conflict — DB-level safety net trigger on registrations
--
-- These are additive changes — no existing data is modified or dropped.
--
-- Run AFTER Phase 1-2 migrations.
-- Take a full Supabase DB snapshot before running.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. requirement_waivers
--    One row per (class_requirement, dancer) pair.
--    Grants an admin-approved exception so the requirement is skipped
--    during enrollment validation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requirement_waivers (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  class_requirement_id    uuid          NOT NULL
                          REFERENCES public.class_requirements(id) ON DELETE CASCADE,

  dancer_id               uuid          NOT NULL
                          REFERENCES public.dancers(id) ON DELETE CASCADE,

  -- Admin who granted the waiver
  granted_by_admin_id     uuid
                          REFERENCES public.users(id) ON DELETE SET NULL,

  notes                   text,
  granted_at              timestamptz   NOT NULL DEFAULT now(),

  -- Optional: waiver expires (e.g. one semester only)
  expires_at              timestamptz,

  UNIQUE(class_requirement_id, dancer_id)
);

CREATE INDEX IF NOT EXISTS idx_waivers_dancer_id
  ON public.requirement_waivers(dancer_id);

CREATE INDEX IF NOT EXISTS idx_waivers_requirement_id
  ON public.requirement_waivers(class_requirement_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Time conflict detection trigger
--    Fires BEFORE INSERT OR UPDATE on registrations.
--    Checks whether the dancer already has a confirmed or active registration
--    in a different session that overlaps on the same day within the same semester.
--
--    This is Layer 3 (DB safety net). Layers 1+2 run in the app.
--    Conflicts caught here should be rare — they indicate a race condition
--    between two concurrent browser sessions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_registration_time_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_day        TEXT;
  new_start      TIME;
  new_end        TIME;
  new_semester   UUID;
  conflict_class TEXT;
BEGIN
  -- Only check active registrations (ignore cancellations)
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Fetch the new session's schedule
  SELECT
    cs.day_of_week,
    cs.start_time::TIME,
    cs.end_time::TIME,
    cs.semester_id
  INTO new_day, new_start, new_end, new_semester
  FROM public.class_sessions cs
  WHERE cs.id = NEW.session_id;

  -- If times are unset, skip the check
  IF new_start IS NULL OR new_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for an overlapping registration for this dancer in the same semester
  SELECT c.name INTO conflict_class
  FROM public.registrations r
  JOIN public.class_sessions cs ON cs.id = r.session_id
  JOIN public.classes c         ON c.id  = cs.class_id
  WHERE r.dancer_id       = NEW.dancer_id
    AND r.status          != 'cancelled'
    AND r.id              != NEW.id          -- exclude self on UPDATE
    AND cs.semester_id    = new_semester
    AND cs.day_of_week    = new_day
    AND cs.start_time     IS NOT NULL
    AND cs.end_time       IS NOT NULL
    AND cs.start_time::TIME < new_end
    AND cs.end_time::TIME   > new_start
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Time conflict: this dancer already has "%" on % that overlaps with the requested session.',
      conflict_class, new_day
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and re-create to ensure the definition is current
DROP TRIGGER IF EXISTS trg_check_registration_time_conflict
  ON public.registrations;

CREATE TRIGGER trg_check_registration_time_conflict
  BEFORE INSERT OR UPDATE OF session_id, dancer_id, status
  ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_registration_time_conflict();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run manually to confirm):
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'requirement_waivers';
--
--   SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_table = 'registrations'
--     AND trigger_name = 'trg_check_registration_time_conflict';
--
-- Expected: 1 row each.
-- ─────────────────────────────────────────────────────────────────────────────
