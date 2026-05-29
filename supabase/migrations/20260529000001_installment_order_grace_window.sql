-- Meeting-plan #7 fix: give PENDING registration_orders a grace window before
-- the stale-hold cron marks them 'failed'.
--
-- Why: the order-failing condition only checks meeting_enrollments (drop-in rows,
-- which carry hold_expires_at). Standard/tiered + installment orders write ONLY
-- section_enrollments (no hold), so `NOT EXISTS (pending_payment meeting_enrollments)`
-- is true immediately — the cron (runs every 5 min) flipped such orders to
-- 'failed' on the next tick, BEFORE the EPG webhook could confirm them. For an
-- admin-set-up installment plan the family may take several minutes to enter
-- their card on the hosted page, so the order was being killed mid-flow (card
-- charged, but confirmBatch then skips because status != 'pending').
--
-- Fix: only fail orders older than a 30-minute grace. Seat release is unaffected
-- (meeting_enrollments holds are still cancelled at hold_expires_at, as before);
-- this purely delays the order's 'failed' transition so the hosted-page +
-- webhook round-trip can complete. Abandoned orders still fail after the grace.
--
-- CREATE OR REPLACE only — the pg_cron schedule from
-- 20260303160000_expire_registration_holds_cron.sql is unchanged.

CREATE OR REPLACE FUNCTION public.expire_stale_registration_holds()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Cancel meeting_enrollments whose hold has expired (unchanged).
  UPDATE public.meeting_enrollments
  SET status = 'cancelled'
  WHERE status = 'pending_payment'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();

  -- Mark orders failed only once past the grace window AND with no live holds.
  UPDATE public.registration_orders
  SET status = 'failed'
  WHERE status = 'pending'
    AND created_at < now() - interval '30 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public.meeting_enrollments r
      WHERE r.registration_batch_id = registration_orders.id
        AND r.status = 'pending_payment'
    );
END;
$$;
