-- Meeting-plan #28: ADMIN-MANAGED freed seats.
--
-- Product decision (2026-06-05): when a held seat is abandoned (cart added, never
-- checked out), it must NOT auto-return to the public catalog — it stays "full" to
-- the public until an admin reopens it or fills it from the waitlist.
--
-- Mechanism: a `released_at` marker decouples two notions of "occupied":
--   • PUBLIC display  → a seat is taken while an UNRELEASED hold exists, regardless
--                       of expiry (so abandoned seats stay full to the public).
--   • New reservations → only ACTIVE (non-expired, unreleased) holds block a new
--                       hold/enrollment, so an admin can fill a freed seat without
--                       first clearing the stale hold.
-- Reopen = set released_at (seat returns to public). Explicit cart-remove still
-- DELETEs the hold (immediate free). Only RELEASED holds are reaped by cleanup;
-- abandoned (expired, unreleased) holds persist until an admin acts.

ALTER TABLE public.seat_holds
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_seat_holds_unreleased
  ON public.seat_holds (section_id, meeting_id) WHERE released_at IS NULL;

COMMENT ON COLUMN public.seat_holds.released_at IS
  'Meeting-plan #28: when set, the hold no longer occupies the seat for PUBLIC '
  'display (admin reopened it / it was filled). NULL = still holding the seat.';

/* -------------------------------------------------------------------------- */
/* Public availability: count UNRELEASED holds regardless of expiry.          */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.active_hold_counts(
  p_section_ids uuid[],
  p_meeting_ids uuid[]
)
RETURNS TABLE (grain text, ref_id uuid, n integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'section'::text, section_id, count(*)::int
  FROM public.seat_holds
  WHERE section_id = ANY(coalesce(p_section_ids, '{}'::uuid[]))
    AND released_at IS NULL
  GROUP BY section_id
  UNION ALL
  SELECT 'meeting'::text, meeting_id, count(*)::int
  FROM public.seat_holds
  WHERE meeting_id = ANY(coalesce(p_meeting_ids, '{}'::uuid[]))
    AND released_at IS NULL
  GROUP BY meeting_id;
$$;
GRANT EXECUTE ON FUNCTION public.active_hold_counts(uuid[], uuid[]) TO anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Admin breakdown: live (active+unreleased) vs freed (expired+unreleased).    */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.admin_section_hold_breakdown(p_section_ids uuid[])
RETURNS TABLE (section_id uuid, live_holds integer, freed_holds integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.section_id,
    count(*) FILTER (WHERE h.expires_at > now())::int  AS live_holds,
    count(*) FILTER (WHERE h.expires_at <= now())::int AS freed_holds
  FROM public.seat_holds h
  WHERE h.section_id = ANY(coalesce(p_section_ids, '{}'::uuid[]))
    AND h.released_at IS NULL
  GROUP BY h.section_id;
$$;
GRANT EXECUTE ON FUNCTION public.admin_section_hold_breakdown(uuid[]) TO authenticated;

/* -------------------------------------------------------------------------- */
/* Triggers: only ACTIVE (non-expired) UNRELEASED holds block a reservation.   */
/* (Re-create the three capacity fns adding `released_at IS NULL`.)            */
/* -------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.check_seat_hold_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION check_schedule_enrollment_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION check_session_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

/* -------------------------------------------------------------------------- */
/* Cleanup: only reap RELEASED holds. Abandoned (expired, unreleased) holds    */
/* persist so the seat stays full-to-public until an admin reopens/fills it.   */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.cleanup_expired_seat_holds()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.seat_holds
  WHERE released_at IS NOT NULL AND released_at < now() - interval '10 minutes';
$$;
