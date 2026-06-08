-- Meeting-plan #28: reserve-at-cart seat holds.
--
-- A `seat_holds` row is a time-boxed reservation of one seat in a section
-- (full-term) or meeting (drop-in), created the moment a class is added to cart.
-- It is NOT a real enrollment (no payment, dancer optional until assigned).
--
-- Capacity now counts: confirmed/pending enrollments + ACTIVE (non-expired)
-- holds. Expiry is LAZY — a hold with expires_at <= now() simply stops counting
-- (no cron is load-bearing for correctness; a cleanup job only trims old rows).
--
-- Two-stage model:
--   Stage 1  add-to-cart            → INSERT seat_holds (atomic capacity check)
--   Stage 2  Proceed to Payment     → convert_holds_to_enrollments() turns the
--                                      caller's own holds into pending enrollments
--                                      in ONE transaction (delete hold + insert
--                                      enrollment), so the seat is never momentarily
--                                      free and the holder cannot lose it mid-checkout.
--
-- PAYMENTS NOTE: the enrollment rows produced by convert_holds_to_enrollments are
-- byte-identical to what createRegistrations inserts today (same batch_id, status,
-- columns). The EPG webhook / confirmBatch (which flip status pending→confirmed by
-- batch_id) are therefore unaffected. See PAYMENTS-CHANGELOG-seat-holds.md.

/* ========================================================================== */
/* 1. seat_holds table                                                        */
/* ========================================================================== */

CREATE TABLE IF NOT EXISTS public.seat_holds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- exactly one grain is set: section (full-term) XOR meeting (drop-in)
  section_id  uuid REFERENCES public.class_sections(id) ON DELETE CASCADE,
  meeting_id  uuid REFERENCES public.class_meetings(id) ON DELETE CASCADE,
  -- the parent holding the seat. Dancer is unknown at add-to-cart, bound later
  -- at the participants step, so dancer_id is nullable.
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dancer_id   uuid REFERENCES public.dancers(id) ON DELETE CASCADE,
  -- denormalized for admin views + waitlist mapping without extra joins
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  class_id    uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seat_holds_one_grain CHECK ((section_id IS NOT NULL) <> (meeting_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_seat_holds_section  ON public.seat_holds (section_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_seat_holds_meeting  ON public.seat_holds (meeting_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_seat_holds_user     ON public.seat_holds (user_id);
CREATE INDEX IF NOT EXISTS idx_seat_holds_expires  ON public.seat_holds (expires_at);
CREATE INDEX IF NOT EXISTS idx_seat_holds_class    ON public.seat_holds (class_id);

COMMENT ON TABLE public.seat_holds IS
  'Meeting-plan #28: time-boxed reserve-at-cart seat reservations. Counts toward '
  'capacity while expires_at > now(); lazily released on expiry. Converted to '
  'pending enrollments at checkout via convert_holds_to_enrollments().';

/* ========================================================================== */
/* 2. RLS — a user manages only their own holds                               */
/*    (Availability counts go through the SECURITY DEFINER count fn below, so  */
/*     no broad SELECT is needed and holders' identities stay private.)        */
/* ========================================================================== */

ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seat_holds_owner_select ON public.seat_holds;
CREATE POLICY seat_holds_owner_select ON public.seat_holds
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS seat_holds_owner_insert ON public.seat_holds;
CREATE POLICY seat_holds_owner_insert ON public.seat_holds
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS seat_holds_owner_update ON public.seat_holds;
CREATE POLICY seat_holds_owner_update ON public.seat_holds
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS seat_holds_owner_delete ON public.seat_holds;
CREATE POLICY seat_holds_owner_delete ON public.seat_holds
  FOR DELETE TO authenticated USING (user_id = auth.uid());

/* ========================================================================== */
/* 3. Atomic capacity enforcement for hold creation                           */
/*    Mirrors the enrollment triggers: FOR UPDATE lock on the parent capacity  */
/*    row serializes racers; counts enrollments + other active holds.          */
/* ========================================================================== */

CREATE OR REPLACE FUNCTION public.check_seat_hold_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cap      INTEGER;
  occupied INTEGER;
BEGIN
  -- An already-expired hold occupies nothing — never block on it.
  IF NEW.expires_at <= now() THEN RETURN NEW; END IF;

  IF NEW.section_id IS NOT NULL THEN
    SELECT capacity INTO cap FROM public.class_sections WHERE id = NEW.section_id FOR UPDATE;
    IF cap IS NULL THEN RETURN NEW; END IF;  -- NULL capacity = unlimited
    SELECT
      (SELECT count(*) FROM public.section_enrollments se
         WHERE se.section_id = NEW.section_id AND se.status <> 'cancelled')
      + (SELECT count(*) FROM public.seat_holds h
         WHERE h.section_id = NEW.section_id AND h.expires_at > now()
           AND h.id IS DISTINCT FROM NEW.id)
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
           AND h.id IS DISTINCT FROM NEW.id)
    INTO occupied;
    IF occupied >= cap THEN
      RAISE EXCEPTION 'Session is at capacity — % occupied, capacity is %.', occupied, cap;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_seat_hold_capacity ON public.seat_holds;
CREATE TRIGGER trg_check_seat_hold_capacity
  BEFORE INSERT OR UPDATE ON public.seat_holds
  FOR EACH ROW EXECUTE FUNCTION public.check_seat_hold_capacity();

/* ========================================================================== */
/* 4. Teach the EXISTING enrollment-capacity triggers to also count holds.     */
/*    Faithful re-definitions of the current bodies + an active-holds term.    */
/*    No self-exclusion needed on the holds term: the converting user's own    */
/*    hold is deleted in the SAME transaction before the enrollment insert     */
/*    (see convert_holds_to_enrollments). Direct-insert paths (admin register, */
/*    the #26 fallback) have no hold for that dancer, so the term is 0 there.   */
/* ========================================================================== */

-- 4a. Full-term (section_enrollments).
CREATE OR REPLACE FUNCTION check_schedule_enrollment_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sched_capacity INTEGER;
  occupied_count INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT capacity INTO sched_capacity
  FROM class_sections
  WHERE id = NEW.section_id
  FOR UPDATE;  -- serialize concurrent enrollments + holds

  IF sched_capacity IS NULL THEN RETURN NEW; END IF;

  SELECT
    (SELECT COUNT(*) FROM section_enrollments
       WHERE section_id = NEW.section_id AND status <> 'cancelled'
         AND id IS DISTINCT FROM NEW.id)
    + (SELECT COUNT(*) FROM seat_holds h
       WHERE h.section_id = NEW.section_id AND h.expires_at > now())
  INTO occupied_count;

  IF occupied_count >= sched_capacity THEN
    RAISE EXCEPTION
      'Section is at capacity — % enrolled, capacity is %.',
      occupied_count, sched_capacity;
  END IF;

  RETURN NEW;
END;
$$;

-- 4b. Drop-in (meeting_enrollments).
CREATE OR REPLACE FUNCTION check_session_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  session_capacity INTEGER;
  occupied_count   INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT capacity INTO session_capacity
  FROM class_meetings
  WHERE id = NEW.meeting_id
  FOR UPDATE;

  IF session_capacity IS NULL THEN RETURN NEW; END IF;

  SELECT
    (SELECT COUNT(*) FROM meeting_enrollments
       WHERE meeting_id = NEW.meeting_id AND status NOT IN ('cancelled')
         AND id IS DISTINCT FROM NEW.id)
    + (SELECT COUNT(*) FROM seat_holds h
       WHERE h.meeting_id = NEW.meeting_id AND h.expires_at > now())
  INTO occupied_count;

  IF occupied_count >= session_capacity THEN
    RAISE EXCEPTION
      'Session is at capacity — % enrolled, capacity is %.',
      occupied_count, session_capacity;
  END IF;

  RETURN NEW;
END;
$$;

/* ========================================================================== */
/* 5. Availability counts for the public catalog (SECURITY DEFINER).           */
/*    Returns ONLY counts (no holder identity), so RLS can stay owner-only.    */
/* ========================================================================== */

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
    AND expires_at > now()
  GROUP BY section_id
  UNION ALL
  SELECT 'meeting'::text, meeting_id, count(*)::int
  FROM public.seat_holds
  WHERE meeting_id = ANY(coalesce(p_meeting_ids, '{}'::uuid[]))
    AND expires_at > now()
  GROUP BY meeting_id;
$$;

GRANT EXECUTE ON FUNCTION public.active_hold_counts(uuid[], uuid[]) TO anon, authenticated;

/* ========================================================================== */
/* 6. Hold → enrollment conversion (Stage 2). Runs as the calling user.        */
/*    Atomic per row: delete the caller's matching hold, THEN insert the        */
/*    pending enrollment, so the seat is never momentarily free. If a seat was  */
/*    lost (hold lapsed) the enrollment insert RAISEs and the whole call rolls  */
/*    back — createRegistrations then routes to the waitlist (#26 fallback).    */
/* ========================================================================== */

CREATE OR REPLACE FUNCTION public.convert_holds_to_enrollments(
  p_batch_id              uuid,
  p_sections              jsonb,        -- [{ section_id, dancer_id, class_tier_id }]
  p_meetings              jsonb,        -- [{ meeting_id, dancer_id }]
  p_meeting_hold_expires  timestamptz
)
RETURNS TABLE (kind text, id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  uid uuid := auth.uid();
  rec jsonb;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'convert_holds_to_enrollments: not authenticated';
  END IF;

  -- Full-term participants → section_enrollments
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  LOOP
    -- Release exactly one of the caller's matching holds (prefer the
    -- dancer-bound one; fall back to an unbound hold for this section).
    DELETE FROM public.seat_holds
    WHERE id = (
      SELECT id FROM public.seat_holds
      WHERE user_id = uid AND section_id = (rec->>'section_id')::uuid
        AND (dancer_id = (rec->>'dancer_id')::uuid OR dancer_id IS NULL)
      ORDER BY (dancer_id = (rec->>'dancer_id')::uuid) DESC NULLS LAST
      LIMIT 1
    );

    INSERT INTO public.section_enrollments
      (section_id, batch_id, dancer_id, price_snapshot, status, class_tier_id)
    VALUES (
      (rec->>'section_id')::uuid,
      p_batch_id,
      (rec->>'dancer_id')::uuid,
      0,
      'pending',
      NULLIF(rec->>'class_tier_id', '')::uuid
    )
    RETURNING public.section_enrollments.id INTO new_id;

    kind := 'section'; id := new_id; RETURN NEXT;
  END LOOP;

  -- Drop-in participants → meeting_enrollments
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb))
  LOOP
    DELETE FROM public.seat_holds
    WHERE id = (
      SELECT id FROM public.seat_holds
      WHERE user_id = uid AND meeting_id = (rec->>'meeting_id')::uuid
        AND (dancer_id = (rec->>'dancer_id')::uuid OR dancer_id IS NULL)
      ORDER BY (dancer_id = (rec->>'dancer_id')::uuid) DESC NULLS LAST
      LIMIT 1
    );

    INSERT INTO public.meeting_enrollments
      (dancer_id, meeting_id, status, total_amount, hold_expires_at, registration_batch_id)
    VALUES (
      (rec->>'dancer_id')::uuid,
      (rec->>'meeting_id')::uuid,
      'pending_payment',
      0,
      p_meeting_hold_expires,
      p_batch_id
    )
    RETURNING public.meeting_enrollments.id INTO new_id;

    kind := 'meeting'; id := new_id; RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.convert_holds_to_enrollments(uuid, jsonb, jsonb, timestamptz)
  TO authenticated;

/* ========================================================================== */
/* 7. Hygiene cleanup (lazy expiry already guarantees correctness).            */
/* ========================================================================== */

CREATE OR REPLACE FUNCTION public.cleanup_expired_seat_holds()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.seat_holds WHERE expires_at < now() - interval '10 minutes';
$$;

SELECT cron.unschedule('cleanup-expired-seat-holds')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-seat-holds');

SELECT cron.schedule(
  'cleanup-expired-seat-holds',
  '*/5 * * * *',
  $$ SELECT public.cleanup_expired_seat_holds(); $$
);
