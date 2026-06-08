-- Meeting-plan #28 safety net: long-stop for stuck pending enrollments.
--
-- The two-stage hold makes a checkout-time pending enrollment timer-IMMUNE
-- (so a paying user can't lose their seat mid-Elavon). The flip side: if the
-- EPG webhook never arrives (the documented Converge-subscription gotcha) or the
-- shopper abandons at the hosted page, that pending row would hold the seat
-- forever. This job releases any enrollment whose order has sat `pending` for
-- > 24h (far longer than any legitimate checkout), freeing the seat.
--
-- Distinct from `expire_stale_registration_holds` (5-min drop-in cart holds);
-- this is the hours-scale backstop for full-term section_enrollments (which have
-- no hold_expires_at) and any drop-in row that slipped through.

CREATE OR REPLACE FUNCTION public.expire_stuck_pending_enrollments()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Full-term pending enrollments under a long-stuck pending order.
  UPDATE public.section_enrollments se
  SET status = 'cancelled'
  FROM public.registration_orders o
  WHERE se.batch_id = o.id
    AND se.status = 'pending'
    AND o.status = 'pending'
    AND o.created_at < now() - interval '24 hours';

  -- Drop-in pending rows (defensive — the 5-min cron normally handles these).
  UPDATE public.meeting_enrollments me
  SET status = 'cancelled'
  FROM public.registration_orders o
  WHERE me.registration_batch_id = o.id
    AND me.status = 'pending_payment'
    AND o.status = 'pending'
    AND o.created_at < now() - interval '24 hours';

  -- Fail the order once nothing live remains (leaves 'partial'/'confirmed' alone:
  -- the WHERE status='pending' guard already excludes them).
  UPDATE public.registration_orders o
  SET status = 'failed'
  WHERE o.status = 'pending'
    AND o.created_at < now() - interval '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.section_enrollments se
      WHERE se.batch_id = o.id AND se.status <> 'cancelled'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.meeting_enrollments me
      WHERE me.registration_batch_id = o.id AND me.status NOT IN ('cancelled')
    );
END;
$$;

SELECT cron.unschedule('expire-stuck-pending-enrollments')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stuck-pending-enrollments');

SELECT cron.schedule(
  'expire-stuck-pending-enrollments',
  '*/30 * * * *',
  $$ SELECT public.expire_stuck_pending_enrollments(); $$
);
