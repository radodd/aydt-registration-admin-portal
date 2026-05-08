-- Time-conflict trigger for schedule_enrollments.
--
-- Mirrors check_registration_time_conflict on `registrations`, but operates at
-- the schedule level. A dancer cannot be enrolled in two overlapping schedules
-- in the same semester — covers the "Full Day vs Half Day camp" mutual
-- exclusivity case and the latent bug noted in MEMORY.md.
--
-- The check joins through generated class_sessions for both the new and
-- existing enrollments so per-day conflicts are detected exactly (same logic
-- as the registrations trigger, just iterated over the full schedule's
-- generated dates).

BEGIN;

CREATE OR REPLACE FUNCTION check_schedule_enrollment_time_conflict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  conflict_class TEXT;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Look for any existing non-cancelled enrollment (schedule_enrollments OR
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
  WHERE new_cs.schedule_id = NEW.schedule_id
    AND other_cs.id <> new_cs.id
    AND (
      EXISTS (
        SELECT 1 FROM schedule_enrollments se
        WHERE se.schedule_id = other_cs.schedule_id
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

DROP TRIGGER IF EXISTS trg_check_schedule_enrollment_time_conflict ON schedule_enrollments;
CREATE TRIGGER trg_check_schedule_enrollment_time_conflict
  BEFORE INSERT OR UPDATE ON schedule_enrollments
  FOR EACH ROW EXECUTE FUNCTION check_schedule_enrollment_time_conflict();

COMMIT;
