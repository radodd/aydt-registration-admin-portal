-- Fix: convert_holds_to_enrollments raised "column reference \"id\" is ambiguous"
-- because the RETURNS TABLE OUT column `id` collided with the `id` columns of
-- seat_holds / section_enrollments / meeting_enrollments inside the body.
--
-- Rename the OUT column to `enrollment_id` and fully alias/qualify every table
-- reference. Behavior is otherwise identical to 20260604000000_seat_holds.sql.
-- (Callers updated to read `enrollment_id`.)

-- NOTE: this migration was skipped on the original dev push (out-of-order vs an
-- already-applied 20260605010000). The working fix lands in 20260605020000. DROP
-- before CREATE so a fresh replay doesn't hit 42P13 (return-type change).
DROP FUNCTION IF EXISTS public.convert_holds_to_enrollments(uuid, jsonb, jsonb, timestamptz);

CREATE FUNCTION public.convert_holds_to_enrollments(
  p_batch_id              uuid,
  p_sections              jsonb,
  p_meetings              jsonb,
  p_meeting_hold_expires  timestamptz
)
RETURNS TABLE (kind text, enrollment_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  uid    uuid := auth.uid();
  rec    jsonb;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'convert_holds_to_enrollments: not authenticated';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  LOOP
    DELETE FROM public.seat_holds AS sh
    WHERE sh.id = (
      SELECT sh2.id FROM public.seat_holds sh2
      WHERE sh2.user_id = uid AND sh2.section_id = (rec->>'section_id')::uuid
        AND (sh2.dancer_id = (rec->>'dancer_id')::uuid OR sh2.dancer_id IS NULL)
      ORDER BY (sh2.dancer_id = (rec->>'dancer_id')::uuid) DESC NULLS LAST
      LIMIT 1
    );

    INSERT INTO public.section_enrollments AS se
      (section_id, batch_id, dancer_id, price_snapshot, status, class_tier_id)
    VALUES (
      (rec->>'section_id')::uuid,
      p_batch_id,
      (rec->>'dancer_id')::uuid,
      0,
      'pending',
      NULLIF(rec->>'class_tier_id', '')::uuid
    )
    RETURNING se.id INTO new_id;

    kind := 'section'; enrollment_id := new_id; RETURN NEXT;
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb))
  LOOP
    DELETE FROM public.seat_holds AS sh
    WHERE sh.id = (
      SELECT sh2.id FROM public.seat_holds sh2
      WHERE sh2.user_id = uid AND sh2.meeting_id = (rec->>'meeting_id')::uuid
        AND (sh2.dancer_id = (rec->>'dancer_id')::uuid OR sh2.dancer_id IS NULL)
      ORDER BY (sh2.dancer_id = (rec->>'dancer_id')::uuid) DESC NULLS LAST
      LIMIT 1
    );

    INSERT INTO public.meeting_enrollments AS me
      (dancer_id, meeting_id, status, total_amount, hold_expires_at, registration_batch_id)
    VALUES (
      (rec->>'dancer_id')::uuid,
      (rec->>'meeting_id')::uuid,
      'pending_payment',
      0,
      p_meeting_hold_expires,
      p_batch_id
    )
    RETURNING me.id INTO new_id;

    kind := 'meeting'; enrollment_id := new_id; RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.convert_holds_to_enrollments(uuid, jsonb, jsonb, timestamptz)
  TO authenticated;
