-- ============================================================
-- email_subscribers: one-off addresses not tied to a user account
-- ============================================================

CREATE TABLE public.email_subscribers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  name         TEXT,
  phone        TEXT,
  is_subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_subscribers_admin_all ON public.email_subscribers
  TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

-- Allow service role full access (for unsubscribe route using service key)
CREATE POLICY email_subscribers_service_role_all ON public.email_subscribers
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- email_recipient_selections: allow "subscribed_list" type
-- ============================================================

ALTER TABLE public.email_recipient_selections
  DROP CONSTRAINT email_recipient_selections_selection_type_check;

ALTER TABLE public.email_recipient_selections
  ADD CONSTRAINT email_recipient_selections_selection_type_check
  CHECK (selection_type = ANY (ARRAY['semester'::text, 'session'::text, 'manual'::text, 'subscribed_list'::text]));

-- ============================================================
-- email_recipients: make user_id nullable, add subscriber_id,
-- change unique constraint to (email_id, email_address)
-- ============================================================

ALTER TABLE public.email_recipients
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.email_recipients
  ADD COLUMN subscriber_id UUID REFERENCES public.email_subscribers(id) ON DELETE SET NULL;

ALTER TABLE public.email_recipients
  DROP CONSTRAINT email_recipients_email_id_user_id_key;

ALTER TABLE public.email_recipients
  ADD CONSTRAINT email_recipients_email_id_email_address_key UNIQUE (email_id, email_address);

-- ============================================================
-- email_deliveries: make user_id nullable, add subscriber_id,
-- change unique constraint to (email_id, email_address)
-- ============================================================

ALTER TABLE public.email_deliveries
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.email_deliveries
  ADD COLUMN subscriber_id UUID REFERENCES public.email_subscribers(id) ON DELETE SET NULL;

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT email_deliveries_email_id_user_id_key;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_email_id_email_address_key UNIQUE (email_id, email_address);
