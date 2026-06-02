-- Meeting-plan #7 follow-up: schedule the installment stored-card reconciliation
-- safety net (supabase/functions/reconcile-installment-setup).
--
-- Installment hosted-page sessions are tokenize-only (doCreateTransaction:false)
-- and fire no `saleAuthorized` webhook. The returnUrl handoff
-- (/api/register/finalize-installment) is the primary trigger that stores the
-- card + charges installment 1 + confirms the order; this cron re-drives that
-- same idempotent endpoint for orders where the family left before the handoff
-- ran ("card entered, but we never heard back"). Idempotent — re-running is safe.
--
-- Mirrors process_overdue_payments_cron() (baseline): resolves the Edge Function
-- URL from the stored app.supabase_url setting and POSTs with the service key.

CREATE OR REPLACE FUNCTION public.reconcile_installment_setup_cron() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  edge_url text;
  svc_key  text;
BEGIN
  edge_url := current_setting('app.supabase_url', true)
              || '/functions/v1/reconcile-installment-setup';
  svc_key  := current_setting('app.service_role_key', true);

  PERFORM net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Run every 5 minutes (same cadence as the overdue-payments + hold-expiry crons).
SELECT cron.unschedule('reconcile-installment-setup')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-installment-setup'
);

SELECT cron.schedule(
  'reconcile-installment-setup',
  '*/5 * * * *',
  $$ SELECT public.reconcile_installment_setup_cron(); $$
);
