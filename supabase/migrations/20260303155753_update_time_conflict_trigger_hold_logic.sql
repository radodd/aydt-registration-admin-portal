-- Update time conflict trigger to respect hold expiration

CREATE OR REPLACE FUNCTION public.check_registration_time_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_day        TEXT;
  new_start      TIME;
  new_end        TIME;
  new_semester   UUID;
  conflict_class TEXT;
BEGIN
  -- Ignore cancelled registrations
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Fetch schedule info
  SELECT
    cs.day_of_week,
    cs.start_time::TIME,
    cs.end_time::TIME,
    cs.semester_id
  INTO new_day, new_start, new_end, new_semester
  FROM public.class_sessions cs
  WHERE cs.id = NEW.session_id;

  IF new_start IS NULL OR new_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check conflicts
  SELECT c.name INTO conflict_class
  FROM public.registrations r
  JOIN public.class_sessions cs ON cs.id = r.session_id
  JOIN public.classes c         ON c.id  = cs.class_id
  WHERE r.dancer_id = NEW.dancer_id
    AND r.id != NEW.id
    AND cs.semester_id = new_semester
    AND cs.day_of_week = new_day
    AND cs.start_time IS NOT NULL
    AND cs.end_time IS NOT NULL
    AND cs.start_time::TIME < new_end
    AND cs.end_time::TIME > new_start
    AND (
      r.status = 'confirmed'
      OR (
        r.status = 'pending_payment'
        AND r.hold_expires_at IS NOT NULL
        AND r.hold_expires_at > now()
      )
    )
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