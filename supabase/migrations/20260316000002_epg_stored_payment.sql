-- Phase 3: EPG Shopper + Stored Payment Method infrastructure
-- Required for installment plan auto-charge (Phase 4).
-- Ref: docs/elavon/api_shoppers.md, api_stored_cards.md, api_stored_ach.md

-- ---------------------------------------------------------------------------
-- shoppers
-- Represents an Elavon Shopper resource, always linked to a Supabase user.
-- ON DELETE SET NULL: preserve stored payment records even if auth user is deleted.
-- ---------------------------------------------------------------------------

CREATE TABLE shoppers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  epg_shopper_id    text NOT NULL UNIQUE,
  epg_shopper_href  text NOT NULL,
  full_name         text,
  email             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shoppers_user_id_idx ON shoppers(user_id);

-- ---------------------------------------------------------------------------
-- stored_payment_methods
-- Unified table for stored cards and stored ACH payments.
-- type discriminates between 'card' and 'ach'; the other type's columns are null.
-- ---------------------------------------------------------------------------

CREATE TABLE stored_payment_methods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id        uuid NOT NULL REFERENCES shoppers(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('card', 'ach')),
  epg_stored_id     text NOT NULL UNIQUE,
  epg_stored_href   text NOT NULL,
  -- Card fields (null for ACH)
  masked_number     text,
  card_scheme       text,
  card_last4        text,
  expiration_month  integer,
  expiration_year   integer,
  -- ACH fields (null for card)
  ach_account_type  text,
  ach_last4         text,
  account_name      text,
  -- Shared
  is_default        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stored_payment_methods_shopper_id_idx ON stored_payment_methods(shopper_id);

-- ---------------------------------------------------------------------------
-- registration_batches — add stored payment method FK
-- ON DELETE SET NULL: if a stored method is deleted, batch record is preserved.
-- Partial index: only index batches that actually have a stored method.
-- ---------------------------------------------------------------------------

ALTER TABLE registration_batches
  ADD COLUMN stored_payment_method_id uuid REFERENCES stored_payment_methods(id) ON DELETE SET NULL;

CREATE INDEX registration_batches_stored_payment_method_id_idx
  ON registration_batches(stored_payment_method_id)
  WHERE stored_payment_method_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE shoppers ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY shoppers_admin_all ON shoppers
  TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

-- Service role bypasses RLS (used by webhook handler)
CREATE POLICY shoppers_service_role ON shoppers
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Parents can read their own shopper record
CREATE POLICY shoppers_parent_read ON shoppers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE stored_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY stored_payment_methods_admin_all ON stored_payment_methods
  TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY stored_payment_methods_service_role ON stored_payment_methods
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Parents can read their own stored methods via their shopper
CREATE POLICY stored_payment_methods_parent_read ON stored_payment_methods
  FOR SELECT TO authenticated
  USING (
    shopper_id IN (
      SELECT id FROM shoppers WHERE user_id = auth.uid()
    )
  );
