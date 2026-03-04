-- Migration: Per-day enrollment architecture
-- Introduces class_schedules (admin config layer) and evolves class_sessions
-- to one-row-per-calendar-day. All changes are additive — legacy rows co-exist.

/* -------------------------------------------------------------------------- */
/* 1. class_schedules — admin-level schedule config                            */
/* -------------------------------------------------------------------------- */

CREATE TABLE class_schedules (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id              UUID          NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  -- Denormalized for trigger access without a JOIN
  semester_id           UUID          NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  days_of_week          TEXT[]        NOT NULL,     -- e.g. ['monday','wednesday']
  start_time            TIME,
  end_time              TIME,
  start_date            DATE,
  end_date              DATE,
  location              TEXT,
  instructor_name       TEXT,
  capacity              INTEGER       CHECK (capacity > 0),
  registration_open_at  TIMESTAMPTZ,
  registration_close_at TIMESTAMPTZ,
  gender_restriction    TEXT          CHECK (gender_restriction IN ('male','female','no_restriction')),
  urgency_threshold     INTEGER       CHECK (urgency_threshold >= 0),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_schedules_class     ON class_schedules(class_id);
CREATE INDEX idx_class_schedules_semester  ON class_schedules(semester_id);

/* -------------------------------------------------------------------------- */
/* 2. class_schedule_excluded_dates — dates suppressed from session generation */
/* -------------------------------------------------------------------------- */

CREATE TABLE class_schedule_excluded_dates (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id   UUID  NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
  excluded_date DATE  NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, excluded_date)
);

CREATE INDEX idx_schedule_excluded_dates ON class_schedule_excluded_dates(schedule_id);

/* -------------------------------------------------------------------------- */
/* 3. class_sessions — add schedule_id and schedule_date                       */
/* -------------------------------------------------------------------------- */

-- schedule_id: FK to class_schedules. NULL on legacy rows.
-- ON DELETE RESTRICT: deleting a schedule that still has generated sessions is blocked.
ALTER TABLE class_sessions
  ADD COLUMN schedule_id   UUID REFERENCES class_schedules(id) ON DELETE RESTRICT,
  ADD COLUMN schedule_date DATE;   -- specific calendar date; NULL on legacy rows

-- Performance indexes for generation diff and pricing queries
CREATE INDEX idx_class_sessions_schedule_date
  ON class_sessions(schedule_id, schedule_date);

CREATE INDEX idx_class_sessions_semester_date
  ON class_sessions(semester_id, schedule_date);

CREATE INDEX IF NOT EXISTS idx_class_sessions_semester_date_time
  ON class_sessions(semester_id, schedule_date, start_time, end_time);

/* -------------------------------------------------------------------------- */
/* 4. Fix discount_rule_sessions — add FK so orphaned rows surface as errors   */
/* -------------------------------------------------------------------------- */

ALTER TABLE discount_rule_sessions
  ADD CONSTRAINT fk_drs_session
    FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE SET NULL;

/* -------------------------------------------------------------------------- */
/* 5. Trigger: prevent deleting class_sessions that have active registrations  */
/* -------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION prevent_enrolled_session_deletion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  reg_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO reg_count
  FROM registrations
  WHERE session_id = OLD.id
    AND status NOT IN ('cancelled');

  IF reg_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete class_session % — % active registration(s) exist. '
      'Cancel or move those registrations first.',
      OLD.id, reg_count;
  END IF;

  -- Also block deletion when an unexpired waitlist invite exists
  SELECT COUNT(*) INTO reg_count
  FROM waitlist_entries
  WHERE session_id = OLD.id
    AND status = 'invited'
    AND (invitation_expires_at IS NULL OR invitation_expires_at > now());

  IF reg_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete class_session % — % active waitlist invite(s) exist.',
      OLD.id, reg_count;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_enrolled_session_deletion
  BEFORE DELETE ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION prevent_enrolled_session_deletion();

/* -------------------------------------------------------------------------- */
/* 6. Trigger: per-day capacity enforcement with row-level lock                */
/* -------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION check_session_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  session_capacity INTEGER;
  enrolled_count   INTEGER;
BEGIN
  -- Cancellations never consume capacity
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Lock the session row to serialize concurrent inserts
  SELECT capacity INTO session_capacity
  FROM class_sessions
  WHERE id = NEW.session_id
  FOR UPDATE;

  -- NULL capacity = unlimited
  IF session_capacity IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO enrolled_count
  FROM registrations
  WHERE session_id = NEW.session_id
    AND status NOT IN ('cancelled')
    AND id IS DISTINCT FROM NEW.id;  -- exclude self on UPDATE

  IF enrolled_count >= session_capacity THEN
    RAISE EXCEPTION
      'Session is at capacity — % enrolled, capacity is %.',
      enrolled_count, session_capacity;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_session_capacity
  BEFORE INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION check_session_capacity();

/* -------------------------------------------------------------------------- */
/* 7. Update time-conflict trigger for per-day sessions                        */
/* -------------------------------------------------------------------------- */
-- The existing trigger compares day_of_week (recurring model).
-- For per-day sessions (schedule_date IS NOT NULL), compare exact dates instead.
-- Re-create with the updated logic. Legacy sessions fall through to old behavior.

CREATE OR REPLACE FUNCTION check_registration_time_conflict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  new_day         TEXT;
  new_start       TIME;
  new_end         TIME;
  new_semester    UUID;
  new_session_date DATE;
  conflict_class  TEXT;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Fetch schedule info for the incoming session
  SELECT
    cs.day_of_week,
    cs.start_time::TIME,
    cs.end_time::TIME,
    cs.semester_id,
    cs.schedule_date
  INTO new_day, new_start, new_end, new_semester, new_session_date
  FROM class_sessions cs
  WHERE cs.id = NEW.session_id;

  -- Skip check if times are not set
  IF new_start IS NULL OR new_end IS NULL THEN RETURN NEW; END IF;

  -- Check for overlapping registrations for this dancer in the same semester
  SELECT c.name INTO conflict_class
  FROM registrations r
  JOIN class_sessions cs ON cs.id = r.session_id
  JOIN classes c ON c.id = cs.class_id
  WHERE r.dancer_id = NEW.dancer_id
    AND r.status != 'cancelled'
    AND r.id IS DISTINCT FROM NEW.id
    AND cs.semester_id = new_semester
    AND cs.start_time IS NOT NULL
    AND cs.end_time IS NOT NULL
    AND cs.start_time::TIME < new_end
    AND cs.end_time::TIME > new_start
    AND (
      -- Per-day sessions: match exact calendar date
      (cs.schedule_date IS NOT NULL
         AND new_session_date IS NOT NULL
         AND cs.schedule_date = new_session_date)
      OR
      -- Legacy sessions: match day of week (original behavior)
      (cs.schedule_date IS NULL
         AND new_session_date IS NULL
         AND cs.day_of_week = new_day)
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

-- Trigger already exists from Phase 3 migration; OR REPLACE above updates the function body.
-- Ensure trigger is attached (idempotent):
DROP TRIGGER IF EXISTS trg_check_registration_time_conflict ON registrations;
CREATE TRIGGER trg_check_registration_time_conflict
  BEFORE INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION check_registration_time_conflict();

/* -------------------------------------------------------------------------- */
/* 8. Lock class_schedules once semester is published with registrations        */
/* -------------------------------------------------------------------------- */
-- Uses the existing prevent_child_modification_if_semester_published() function.
-- That function expects a `semester_id` column on the affected row — provided above.

CREATE TRIGGER lock_class_schedules_if_published
  BEFORE INSERT OR UPDATE OR DELETE ON class_schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_child_modification_if_semester_published();
