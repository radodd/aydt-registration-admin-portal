-- Migration: Email delivery failure tracking
-- Adds failure_reason to email_deliveries, allows 'failed' status,
-- and updates email_analytics view to include failed_count.

-- 1. Add failure_reason column
ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 2. Replace status check constraint to include 'failed'
ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_status_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'sent'::text,
      'delivered'::text,
      'bounced'::text,
      'complained'::text,
      'failed'::text
    ]));

-- 3. Replace email_analytics view to include failed_count.
--    Must DROP + CREATE because PostgreSQL's CREATE OR REPLACE VIEW does not
--    allow inserting new columns in the middle of the existing column list.
--    Also switches DISTINCT keys from user_id to id so that
--    subscriber-based recipients (nullable user_id) are counted correctly.
DROP VIEW IF EXISTS public.email_analytics;
CREATE VIEW public.email_analytics AS
SELECT
  e.id,
  e.subject,
  e.sent_at,
  e.sender_name,
  count(DISTINCT er.id)                                                          AS recipient_count,
  count(DISTINCT CASE WHEN ed.status = 'delivered'  THEN ed.id END)             AS delivered_count,
  count(DISTINCT CASE WHEN ed.opened_at IS NOT NULL THEN ed.id END)             AS opened_count,
  count(DISTINCT CASE WHEN ed.clicked_at IS NOT NULL THEN ed.id END)            AS clicked_count,
  count(DISTINCT CASE WHEN ed.status = 'bounced'    THEN ed.id END)             AS bounced_count,
  count(DISTINCT CASE WHEN ed.status = 'failed'     THEN ed.id END)             AS failed_count,
  round(
    (100.0 * count(DISTINCT CASE WHEN ed.opened_at IS NOT NULL THEN ed.id END)::numeric)
    / NULLIF(count(DISTINCT er.id), 0)::numeric,
    1
  )                                                                              AS open_rate,
  round(
    (100.0 * count(DISTINCT CASE WHEN ed.clicked_at IS NOT NULL THEN ed.id END)::numeric)
    / NULLIF(count(DISTINCT er.id), 0)::numeric,
    1
  )                                                                              AS click_rate
FROM public.emails e
LEFT JOIN public.email_recipients  er ON er.email_id = e.id
LEFT JOIN public.email_deliveries  ed ON ed.email_id = e.id
WHERE e.status = 'sent'
  AND e.deleted_at IS NULL
GROUP BY e.id;
