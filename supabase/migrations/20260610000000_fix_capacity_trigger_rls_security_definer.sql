-- Meeting-plan #37 — FIX a real overbook / double-book under cross-user contention.
--
-- BUG (found 2026-06-10 via the two-human race harness, reproduced 3/3):
--   The three capacity-enforcing trigger functions ran as SECURITY INVOKER and
--   COUNT(*) the RLS-protected `seat_holds` (owner-only SELECT) and the
--   *_enrollments tables. A racing user's capacity check therefore could NOT see
--   OTHER users' holds/enrollments — so two parents racing the last seat each saw
--   it as free and BOTH got a hold (occupancy > capacity). Service-role tests
--   bypassed RLS and masked this with false PASSes.
--
-- FIX: run these trigger functions as SECURITY DEFINER (owner = postgres, which
--   bypasses RLS) so the occupancy COUNT sees ALL rows. Bodies are otherwise
--   byte-identical to 20260605040000_seat_holds_admin_managed.sql — only the
--   security clause changes. The `FOR UPDATE` serialization was already correct.
--
-- SAFETY:
--   • The actual INSERT's RLS (seat_holds owner-only WITH CHECK; enrollment
--     policies) is evaluated in the CALLER's context, independent of the trigger
--     function's security mode — so DEFINER here does NOT widen what a user may
--     insert. It only fixes what the capacity COUNT can SEE.
--   • `SET search_path = public` pins resolution (defense against search_path
--     hijacking on a DEFINER function), matching active_hold_counts /
--     admin_section_hold_breakdown in the prior migration.
--   • Triggers are already attached (BEFORE INSERT/UPDATE); CREATE OR REPLACE
--     keeps the existing trigger bindings — no DROP TRIGGER needed.

/* -------------------------------------------------------------------------- */
/* 1. seat_holds capacity gate (add-to-cart / reserve-at-cart).               */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.check_seat_hold_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap      INTEGER;
  occupied INTEGER;
BEGIN
  IF NEW.expires_at <= now() OR NEW.released_at IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.section_id IS NOT NULL THEN
    SELECT capacity INTO cap FROM public.class_sections WHERE id = NEW.section_id FOR UPDATE;
    IF cap IS NULL THEN RETURN NEW; END IF;
    SELECT
      (SELECT count(*) FROM public.section_enrollments se
         WHERE se.section_id = NEW.section_id AND se.status <> 'cancelled')
      + (SELECT count(*) FROM public.seat_holds h
         WHERE h.section_id = NEW.section_id AND h.expires_at > now()
           AND h.released_at IS NULL AND h.id IS DISTINCT FROM NEW.id)
    INTO occupied;
    IF occupied >= cap THEN
      RAISE EXCEPTION 'Section is at capacity — % occupied, capacity is %.', occupied, cap;
    END IF;
  ELSE
    SELECT capacity INTO cap FROM public.class_meetings WHERE id = NEW.meeting_id FOR UPDATE;
    IF cap IS NULL THEN RETURN NEW; END IF;
    SELECT
      (SELECT count(*) FROM public.meeting_enrollments me
         WHERE me.meeting_id = NEW.meeting_id AND me.status <> 'cancelled')
      + (SELECT count(*) FROM public.seat_holds h
         WHERE h.meeting_id = NEW.meeting_id AND h.expires_at > now()
           AND h.released_at IS NULL AND h.id IS DISTINCT FROM NEW.id)
    INTO occupied;
    IF occupied >= cap THEN
      RAISE EXCEPTION 'Session is at capacity — % occupied, capacity is %.', occupied, cap;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

/* -------------------------------------------------------------------------- */
/* 2. section_enrollments capacity gate (full-term enroll / hold conversion).  */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION check_schedule_enrollment_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sched_capacity INTEGER;
  occupied_count INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT capacity INTO sched_capacity FROM class_sections WHERE id = NEW.section_id FOR UPDATE;
  IF sched_capacity IS NULL THEN RETURN NEW; END IF;
  SELECT
    (SELECT COUNT(*) FROM section_enrollments
       WHERE section_id = NEW.section_id AND status <> 'cancelled' AND id IS DISTINCT FROM NEW.id)
    + (SELECT COUNT(*) FROM seat_holds h
       WHERE h.section_id = NEW.section_id AND h.expires_at > now() AND h.released_at IS NULL)
  INTO occupied_count;
  IF occupied_count >= sched_capacity THEN
    RAISE EXCEPTION 'Section is at capacity — % enrolled, capacity is %.', occupied_count, sched_capacity;
  END IF;
  RETURN NEW;
END;
$$;

/* -------------------------------------------------------------------------- */
/* 3. meeting_enrollments capacity gate (drop-in enroll / hold conversion).     */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION check_session_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_capacity INTEGER;
  occupied_count   INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT capacity INTO session_capacity FROM class_meetings WHERE id = NEW.meeting_id FOR UPDATE;
  IF session_capacity IS NULL THEN RETURN NEW; END IF;
  SELECT
    (SELECT COUNT(*) FROM meeting_enrollments
       WHERE meeting_id = NEW.meeting_id AND status NOT IN ('cancelled') AND id IS DISTINCT FROM NEW.id)
    + (SELECT COUNT(*) FROM seat_holds h
       WHERE h.meeting_id = NEW.meeting_id AND h.expires_at > now() AND h.released_at IS NULL)
  INTO occupied_count;
  IF occupied_count >= session_capacity THEN
    RAISE EXCEPTION 'Session is at capacity — % enrolled, capacity is %.', occupied_count, session_capacity;
  END IF;
  RETURN NEW;
END;
$$;
