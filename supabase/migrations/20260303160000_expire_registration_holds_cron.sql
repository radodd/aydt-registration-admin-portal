-- pg_cron safety net: automatically expire stale registration holds.
--
-- Runs every 5 minutes. Cancels registrations whose hold_expires_at has passed
-- and marks their parent batch as failed when no pending_payment registrations
-- remain. This ensures the time-conflict trigger never sees a competing hold
-- from an abandoned payment session.
--
-- Layers 1 (stable batchId) and 2 (stale batch cleanup at create time) prevent
-- the common cases. This job handles the remainder (e.g. server restart mid-flow,
-- or a hold that slips through both earlier layers).

CREATE OR REPLACE FUNCTION public.expire_stale_registration_holds()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Cancel registrations whose hold has expired
  UPDATE public.registrations
  SET status = 'cancelled'
  WHERE status = 'pending_payment'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();

  -- Mark batches as failed when all their registrations are no longer pending_payment
  UPDATE public.registration_batches
  SET status = 'failed'
  WHERE status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.registration_batch_id = registration_batches.id
        AND r.status = 'pending_payment'
    );
END;
$$;

-- Schedule to run every 5 minutes (idempotent: unschedule first if already exists)
SELECT cron.unschedule('expire-registration-holds')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-registration-holds'
);

SELECT cron.schedule(
  'expire-registration-holds',
  '*/5 * * * *',
  $$ SELECT public.expire_stale_registration_holds(); $$
);
