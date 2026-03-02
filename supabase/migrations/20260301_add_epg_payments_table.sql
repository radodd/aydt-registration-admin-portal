-- Migration: Add EPG payments table
-- Replaces Converge payment_reference_id tracking on registration_batches with a
-- dedicated payments table that tracks the full EPG Order → PaymentSession → Transaction
-- lifecycle. The registration_batches table is unchanged — it remains the authoritative
-- registration record; the payments table is the authoritative payment record.

CREATE TABLE IF NOT EXISTS public.payments (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One payment per registration batch. UNIQUE enforces idempotency at DB level.
  registration_batch_id uuid          NOT NULL UNIQUE
                                      REFERENCES public.registration_batches(id)
                                      ON DELETE CASCADE,

  -- EPG resource IDs (set progressively as the flow advances)
  order_id              text,         -- EPG Order resource ID (set when Order is created)
  payment_session_id    text,         -- EPG PaymentSession resource ID
  transaction_id        text,         -- EPG Transaction resource ID (set by webhook handler)

  -- Our own reference embedded in the EPG Order and PaymentSession.
  -- Must equal the registration_batch id. UNIQUE constraint is the primary
  -- idempotency guard preventing duplicate EPG orders for the same batch.
  custom_reference      text          NOT NULL UNIQUE,

  amount                numeric(10,2) NOT NULL,
  currency              text          NOT NULL DEFAULT 'USD',

  -- Payment state aligned with EPG EventType values.
  -- Registration is confirmed when state IN ('authorized', 'captured', 'settled').
  state                 text          NOT NULL DEFAULT 'initiated'
                        CHECK (state IN (
                          'initiated',           -- row created, no EPG calls yet
                          'pending_authorization', -- payment session created, user on HPP
                          'authorized',          -- saleAuthorized webhook received
                          'captured',            -- saleCaptured (only if doCapture=false flow)
                          'settled',             -- saleSettled
                          'declined',            -- saleDeclined
                          'voided',              -- voidAuthorized
                          'refunded',            -- refundAuthorized
                          'held_for_review'      -- saleHeldForReview
                        )),

  -- Last EPG event type received for this payment (e.g. 'saleAuthorized')
  event_type            text,

  -- Raw payloads stored for debugging, reconciliation, and audit trail.
  -- raw_notification: the notification body EPG POSTed to our webhook.
  -- raw_transaction:  the full transaction object from GET /transactions/{id}.
  raw_notification      jsonb,
  raw_transaction       jsonb,

  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- Index for lookups by batch (used by webhook handler and status polling)
CREATE INDEX IF NOT EXISTS idx_payments_batch_id
  ON public.payments(registration_batch_id);

-- Index for idempotency lookups (createEPGPaymentSession checks this)
CREATE INDEX IF NOT EXISTS idx_payments_custom_reference
  ON public.payments(custom_reference);

-- Partial index for lookups by EPG transaction ID (webhook handler uses this)
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id
  ON public.payments(transaction_id)
  WHERE transaction_id IS NOT NULL;
