-- ──────────────────────────────────────────────────────────────────────────────
-- Rename cluster 2 of 3: "schedule" → "section"
-- ──────────────────────────────────────────────────────────────────────────────
-- class_schedules is not a timetable — it's the recurring offering a dancer
-- enrolls in (days/time/date-range/capacity/pricing), which the system fans out
-- into class_sessions. Renaming it (and its full-term enrollment + satellites)
-- to "section" makes the pair self-documenting against the meeting-level tables:
--   class_sections      ← the recurring offering        (was class_schedules)
--   section_enrollments ← enrolled in a whole section   (was schedule_enrollments)
--
-- Every schedule_id column in the schema references class_schedules, so the FK
-- column is renamed to section_id across all five owners.
--
-- Tables: indexes, FKs, RLS policies, triggers, and sequences follow the OID
-- automatically. RLS policy column references update with the column rename.
-- Trigger/constraint *names* keep their "schedule" wording (cosmetic, deferred).
--
-- Two plpgsql trigger functions reference these tables/columns by name and use
-- late binding, so they are CREATE OR REPLACEd after the renames. The shared
-- prevent_child_modification_if_semester_published() is generic (no table named
-- in its body) and is left untouched.
--
-- class_sessions and registrations are renamed in cluster 3; here only their
-- schedule_id column moves to section_id. (schedule_DATE is a different column
-- and is intentionally NOT renamed.)
--
-- See docs/DB_RENAME_PLAN.md.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Table renames
ALTER TABLE public.class_schedules               RENAME TO class_sections;
ALTER TABLE public.schedule_enrollments          RENAME TO section_enrollments;
ALTER TABLE public.schedule_price_tiers          RENAME TO section_price_tiers;
ALTER TABLE public.class_schedule_excluded_dates RENAME TO class_section_excluded_dates;
ALTER TABLE public.discount_rule_schedules       RENAME TO discount_rule_sections;

-- 2. Column rename: schedule_id → section_id on every table that references the
--    (now) class_sections table. class_sessions keeps its name until cluster 3.
ALTER TABLE public.class_sessions               RENAME COLUMN schedule_id TO section_id;
ALTER TABLE public.section_enrollments          RENAME COLUMN schedule_id TO section_id;
ALTER TABLE public.section_price_tiers          RENAME COLUMN schedule_id TO section_id;
ALTER TABLE public.class_section_excluded_dates RENAME COLUMN schedule_id TO section_id;
ALTER TABLE public.discount_rule_sections       RENAME COLUMN schedule_id TO section_id;

-- 3. Re-point the two plpgsql trigger functions at the new names (late binding).
--    Triggers themselves moved with their table (now section_enrollments) and
--    still call these same-named functions — only the bodies change.

CREATE OR REPLACE FUNCTION check_schedule_enrollment_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sched_capacity INTEGER;
  enrolled_count INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT capacity INTO sched_capacity
  FROM class_sections
  WHERE id = NEW.section_id
  FOR UPDATE;  -- serialize concurrent inserts

  IF sched_capacity IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO enrolled_count
  FROM section_enrollments
  WHERE section_id = NEW.section_id
    AND status != 'cancelled'
    AND id IS DISTINCT FROM NEW.id;

  IF enrolled_count >= sched_capacity THEN
    RAISE EXCEPTION
      'Section is at capacity — % enrolled, capacity is %.',
      enrolled_count, sched_capacity;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_schedule_enrollment_time_conflict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  conflict_class TEXT;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Look for any existing non-cancelled enrollment (section_enrollments OR
  -- per-session registrations) for this dancer in the same semester whose
  -- generated session dates overlap with NEW's generated sessions.
  SELECT c.name INTO conflict_class
  FROM class_sessions new_cs
  JOIN class_sessions other_cs
    ON other_cs.semester_id = new_cs.semester_id
    AND new_cs.start_time IS NOT NULL
    AND new_cs.end_time IS NOT NULL
    AND other_cs.start_time IS NOT NULL
    AND other_cs.end_time IS NOT NULL
    AND other_cs.start_time::TIME < new_cs.end_time::TIME
    AND other_cs.end_time::TIME   > new_cs.start_time::TIME
    AND (
      (new_cs.schedule_date IS NOT NULL
         AND other_cs.schedule_date IS NOT NULL
         AND new_cs.schedule_date = other_cs.schedule_date)
      OR
      (new_cs.schedule_date IS NULL
         AND other_cs.schedule_date IS NULL
         AND new_cs.day_of_week = other_cs.day_of_week)
    )
  JOIN classes c ON c.id = other_cs.class_id
  WHERE new_cs.section_id = NEW.section_id
    AND other_cs.id <> new_cs.id
    AND (
      EXISTS (
        SELECT 1 FROM section_enrollments se
        WHERE se.section_id = other_cs.section_id
          AND se.dancer_id  = NEW.dancer_id
          AND se.status <> 'cancelled'
          AND se.id IS DISTINCT FROM NEW.id
      )
      OR EXISTS (
        SELECT 1 FROM registrations r
        WHERE r.session_id = other_cs.id
          AND r.dancer_id  = NEW.dancer_id
          AND r.status <> 'cancelled'
      )
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Schedule conflict: this enrollment overlaps with % on the same date/time.',
      conflict_class;
  END IF;

  RETURN NEW;
END;
$$;
