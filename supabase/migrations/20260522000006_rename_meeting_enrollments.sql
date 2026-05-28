-- ──────────────────────────────────────────────────────────────────────────────
-- Rename cluster 3b of 3: registrations → meeting_enrollments
-- ──────────────────────────────────────────────────────────────────────────────
-- Final cluster. Pairs with section_enrollments by grain:
--   section_enrollments → enrolled in a whole class_section (full term)
--   meeting_enrollments → booked into a single class_meeting (drop-in)
--
-- DB-boundary rename: the table moves to meeting_enrollments, but the app-layer
-- result-key vocabulary stays "registrations" (PostgREST embeds are aliased back
-- so .registrations property accesses, TS type properties, and UI copy remain
-- unchanged). Intentional naming gap between DB and app layers — cheap clarity
-- win at the schema level without disrupting domain-model code.
--
-- Tables: indexes, FKs, RLS policies, triggers, sequences follow the OID
-- automatically. Constraint and trigger NAMES keep their "registration" wording
-- (cosmetic, deferred).
--
-- 8 plpgsql functions reference the table by name (late binding). All 8 are
-- re-pointed via the same mechanical token swap applied to the .from() calls
-- in app code. The triggers attached to the (renamed) meeting_enrollments table
-- move automatically and continue to call these same-named functions.
--
-- registration_batch_id (FK column on the now-meeting_enrollments table) and
-- registration_orders (table, Batch 1) are deliberately untouched — those are
-- references to the order cluster, not this one.
--
-- registration_days (per-day enrollment satellite) is left as-is — its current
-- name is self-explanatory on its own terms.
--
-- See docs/DB_RENAME_PLAN.md.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Table rename
ALTER TABLE public.registrations RENAME TO meeting_enrollments;

-- 2. Re-point the 8 plpgsql functions (mechanical token swap of their latest bodies).

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

  -- Check for overlapping meeting_enrollments for this dancer in the same semester
  SELECT c.name INTO conflict_class
  FROM meeting_enrollments r
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
  FROM meeting_enrollments
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
  FROM meeting_enrollments
  WHERE meeting_id = OLD.id
    AND status NOT IN ('cancelled');

  IF reg_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete class_session % — % active registration(s) exist. '
      'Cancel or move those meeting_enrollments first.',
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
  -- per-session meeting_enrollments) for this dancer in the same semester whose
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
        SELECT 1 FROM meeting_enrollments r
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
  from meeting_enrollments r
  join class_meetings s on s.id = r.meeting_id
  where s.semester_id = target_semester_id;

  if reg_count > 0 then
    raise exception 'Cannot modify records for a published semester with meeting_enrollments';
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
    from meeting_enrollments r
    join class_meetings s on s.id = r.meeting_id
    where s.semester_id = old.id;

    if reg_count > 0 then
      if (
        new.registration_form  is distinct from old.registration_form or
        new.confirmation_email is distinct from old.confirmation_email or
        new.waitlist_settings  is distinct from old.waitlist_settings
      ) then
        raise exception
          'Cannot modify registration form, confirmation email, or waitlist settings for a published semester with meeting_enrollments';
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
    from meeting_enrollments r
    join class_meetings s on s.id = r.meeting_id
    where s.semester_id = target_semester_id;

    if reg_count > 0 then
      raise exception
        'Cannot modify session grouping structure for a published semester with meeting_enrollments';
    end if;

  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_registration_holds()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Cancel meeting_enrollments whose hold has expired
  UPDATE public.meeting_enrollments
  SET status = 'cancelled'
  WHERE status = 'pending_payment'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();

  -- Mark orders as failed when all their meeting_enrollments are no longer pending_payment
  UPDATE public.registration_orders
  SET status = 'failed'
  WHERE status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM public.meeting_enrollments r
      WHERE r.registration_batch_id = registration_orders.id
        AND r.status = 'pending_payment'
    );
END;
$$;

