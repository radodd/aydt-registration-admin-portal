-- =============================================================================
-- Phase 4 — Overdue Payment Detection Cron
--
-- Schedules a daily pg_cron job that invokes the
-- `process-overdue-payments` Edge Function.
--
-- Requirements:
--   • pg_cron extension must be enabled in the Supabase project.
--   • net (pg_net) extension must be enabled for http_post.
--   • Set the Edge Function URL below to match your project.
--
-- The Edge Function itself handles:
--   1. Marking overdue batch_payment_installments
--   2. Sending admin notification email via Resend
--
-- Set ADMIN_NOTIFICATION_EMAIL in the Edge Function's environment variables
-- via the Supabase dashboard.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SQL wrapper function that calls the Edge Function via pg_net
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_overdue_payments_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_url  text;
  svc_key   text;
BEGIN
  -- Resolve the Edge Function URL from the stored setting
  -- (set with: SELECT set_config('app.supabase_url', '...', false))
  -- Falls back to a sensible default for the known project.
  edge_url := current_setting('app.supabase_url', true)
              || '/functions/v1/process-overdue-payments';

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Schedule daily at 06:00 UTC
--    (Adjust the schedule expression as needed.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'process-overdue-payments-daily',   -- job name (unique)
  '0 6 * * *',                        -- every day at 06:00 UTC
  $$SELECT public.process_overdue_payments_cron()$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Pre-requisite: store the project URL + service role key as DB settings
--    so the function above can resolve them at runtime.
--
--    Run these once in the Supabase SQL editor after applying the migration
--    (replace the values with your actual project credentials):
--
--      SELECT set_config('app.supabase_url',
--        'https://bulplzknfbietpmdfwlk.supabase.co', true);
--
--      SELECT set_config('app.service_role_key',
--        '<your-service-role-key>', true);
--
--    Or use pg_settings to persist:
--
--      ALTER DATABASE postgres
--        SET "app.supabase_url" = 'https://bulplzknfbietpmdfwlk.supabase.co';
--
--      ALTER DATABASE postgres
--        SET "app.service_role_key" = '<your-service-role-key>';
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (run manually):
--
--   SELECT jobid, schedule, command FROM cron.job
--   WHERE jobname = 'process-overdue-payments-daily';
--
-- Expected: 1 row with schedule '0 6 * * *'.
-- ─────────────────────────────────────────────────────────────────────────────
