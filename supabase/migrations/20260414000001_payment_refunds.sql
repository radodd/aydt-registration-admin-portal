-- payment_refunds
-- Records every void and refund action initiated by an admin through the portal.
-- Provides a full audit trail: who initiated, when, how much, EPG response.

CREATE TABLE IF NOT EXISTS payment_refunds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  batch_id            uuid NOT NULL REFERENCES registration_batches(id) ON DELETE CASCADE,
  type                text NOT NULL CHECK (type IN ('void', 'refund')),
  -- null = full refund/void; populated for partial refunds
  amount              numeric(10,2),
  reason              text NOT NULL,
  -- line_items: optional array of {registration_id, class_name, amount} for partial line-item refunds
  line_items          jsonb,
  initiated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- EPG transaction ID returned from the void/refund call
  epg_transaction_id  text,
  -- raw EPG response for debugging
  raw_response        jsonb,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  failure_reason      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_refunds_payment_id_idx ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS payment_refunds_batch_id_idx ON payment_refunds(batch_id);
CREATE INDEX IF NOT EXISTS payment_refunds_initiated_by_idx ON payment_refunds(initiated_by);

-- RLS
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'payment_refunds_admin_all'
    AND tablename = 'payment_refunds'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY payment_refunds_admin_all ON payment_refunds
      TO authenticated
      USING (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'payment_refunds_service_role'
    AND tablename = 'payment_refunds'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY payment_refunds_service_role ON payment_refunds
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
