-- ──────────────────────────────────────────────────────────────────────────────
-- Rename cluster 3a of 3: "session" → "meeting"  (class_sessions half)
-- ──────────────────────────────────────────────────────────────────────────────
-- A class_sessions row is one generated calendar date — a single meeting — not a
-- login/auth "session" and not a "semester". Renaming to class_meetings (+ its
-- session-named satellites and the session_id FK column) removes that overload.
--
-- The `registrations` table is intentionally LEFT for cluster 3b (its rename is
-- surgical — "registration" is a pervasive word). Here, registrations keeps its
-- name but its session_id column is renamed to meeting_id along with every other
-- table's (all session_id columns reference class_sessions).
--
-- Tables: indexes, FKs, RLS policies, triggers, sequences follow the OID; trigger
-- column lists (UPDATE OF session_id) and RLS column refs follow the column
-- rename automatically. Trigger/constraint NAMES keep their "session" wording
-- (cosmetic, deferred). audition_sessions / audition_session_id are a DIFFERENT
-- subsystem and are deliberately untouched.
--
-- The 7 plpgsql functions below reference these tables/columns by name (late
-- binding) and are re-pointed via the same mechanical token swap applied to the
-- app code. Three are semester-publish guards — QA semester publish/edit after
-- deploy, since the Vitest suite mocks the DB and does not exercise triggers.
--
-- See docs/DB_RENAME_PLAN.md.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Table renames
ALTER TABLE public.class_sessions               RENAME TO class_meetings;
ALTER TABLE public.session_groups               RENAME TO meeting_groups;
ALTER TABLE public.session_group_sessions       RENAME TO meeting_group_meetings;
ALTER TABLE public.session_group_tags           RENAME TO meeting_group_tags;
ALTER TABLE public.session_tags                 RENAME TO meeting_tags;
ALTER TABLE public.session_occurrence_dates     RENAME TO meeting_occurrence_dates;
ALTER TABLE public.class_session_options        RENAME TO class_meeting_options;
ALTER TABLE public.class_session_excluded_dates RENAME TO class_meeting_excluded_dates;
ALTER TABLE public.class_session_price_rows     RENAME TO class_meeting_price_rows;
ALTER TABLE public.class_session_instructors    RENAME TO class_meeting_instructors;
ALTER TABLE public.discount_rule_sessions       RENAME TO discount_rule_meetings;

-- 2. Column renames (every owner of each column; all reference the renamed tables).
--    Dynamic so no owning table is missed.
DO $$
DECLARE r record;
  pairs text[][] := ARRAY[
    ARRAY['session_id','meeting_id'],
    ARRAY['class_session_id','class_meeting_id'],
    ARRAY['cloned_from_session_id','cloned_from_meeting_id'],
    ARRAY['session_group_id','meeting_group_id']
  ];
  p text[];
BEGIN
  FOREACH p SLICE 1 IN ARRAY pairs LOOP
    FOR r IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = p[1]
        AND t.table_type = 'BASE TABLE'
    LOOP
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', r.table_name, p[1], p[2]);
    END LOOP;
  END LOOP;
END $$;

-- 3. Re-point the 7 plpgsql trigger functions (mechanical token swap of latest bodies).

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
  FROM class_meetings cs
  WHERE cs.id = NEW.meeting_id;

  -- Skip check if times are not set
  IF new_start IS NULL OR new_end IS NULL THEN RETURN NEW; END IF;

  -- Check for overlapping registrations for this dancer in the same semester
  SELECT c.name INTO conflict_class
  FROM registrations r
  JOIN class_meetings cs ON cs.id = r.meeting_id
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
  FROM class_meetings
  WHERE id = NEW.meeting_id
  FOR UPDATE;

  -- NULL capacity = unlimited
  IF session_capacity IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO enrolled_count
  FROM registrations
  WHERE meeting_id = NEW.meeting_id
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

CREATE OR REPLACE FUNCTION prevent_enrolled_session_deletion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  reg_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO reg_count
  FROM registrations
  WHERE meeting_id = OLD.id
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
  WHERE meeting_id = OLD.id
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
  FROM class_meetings new_cs
  JOIN class_meetings other_cs
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
        WHERE r.meeting_id = other_cs.id
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

CREATE OR REPLACE FUNCTION public.prevent_child_modification_if_semester_published() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  target_semester_id uuid;
  semester_status    text;
  reg_count          integer;
begin
  target_semester_id := coalesce(new.semester_id, old.semester_id);

  select status into semester_status
  from semesters
  where id = target_semester_id;

  if semester_status is distinct from 'published' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*) into reg_count
  from registrations r
  join class_meetings s on s.id = r.meeting_id
  where s.semester_id = target_semester_id;

  if reg_count > 0 then
    raise exception 'Cannot modify records for a published semester with registrations';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.prevent_semester_core_edit_if_published() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  reg_count integer;
begin
  if old.status = 'published' then

    select count(*) into reg_count
    from registrations r
    join class_meetings s on s.id = r.meeting_id
    where s.semester_id = old.id;

    if reg_count > 0 then
      if (
        new.registration_form  is distinct from old.registration_form or
        new.confirmation_email is distinct from old.confirmation_email or
        new.waitlist_settings  is distinct from old.waitlist_settings
      ) then
        raise exception
          'Cannot modify registration form, confirmation email, or waitlist settings for a published semester with registrations';
      end if;
    end if;

  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.prevent_session_group_structure_if_published() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  target_semester_id uuid;
  semester_status    text;
  reg_count          integer;
begin
  if tg_table_name = 'meeting_groups' then
    target_semester_id := coalesce(new.semester_id, old.semester_id);

  elsif tg_table_name = 'meeting_group_meetings' then
    select sg.semester_id into target_semester_id
    from meeting_groups sg
    where sg.id = coalesce(new.meeting_group_id, old.meeting_group_id);

  elsif tg_table_name = 'meeting_group_tags' then
    select sg.semester_id into target_semester_id
    from meeting_groups sg
    where sg.id = coalesce(new.meeting_group_id, old.meeting_group_id);

  elsif tg_table_name = 'meeting_tags' then
    select s.semester_id into target_semester_id
    from class_meetings s
    where s.id = coalesce(new.meeting_id, old.meeting_id);
  end if;

  select status into semester_status
  from semesters
  where id = target_semester_id;

  if semester_status = 'published' then

    select count(*) into reg_count
    from registrations r
    join class_meetings s on s.id = r.meeting_id
    where s.semester_id = target_semester_id;

    if reg_count > 0 then
      raise exception
        'Cannot modify session grouping structure for a published semester with registrations';
    end if;

  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

