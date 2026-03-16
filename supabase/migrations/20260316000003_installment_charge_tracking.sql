-- Phase 4: Recurring installment auto-charge tracking columns.
-- Enables charge_attempt_count-based retry logic and admin visibility
-- into per-installment EPG transaction IDs and failure reasons.

ALTER TABLE batch_payment_installments
  ADD COLUMN transaction_id       text,
  ADD COLUMN charge_attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN last_charge_error    text;

COMMENT ON COLUMN batch_payment_installments.transaction_id IS
  'EPG transaction ID from the server-to-server charge. Null until a charge succeeds.';
COMMENT ON COLUMN batch_payment_installments.charge_attempt_count IS
  'Number of failed/declined charge attempts. Auto-charge stops and status moves to ''failed'' at 3.';
COMMENT ON COLUMN batch_payment_installments.last_charge_error IS
  'Most recent EPG failure code or error message from a declined charge attempt.';

-- Extend the status check constraint to include 'failed'.
-- Installments move to 'failed' after 3 unsuccessful charge attempts.
ALTER TABLE batch_payment_installments
  DROP CONSTRAINT batch_payment_installments_status_check;

ALTER TABLE batch_payment_installments
  ADD CONSTRAINT batch_payment_installments_status_check
    CHECK (status = ANY (ARRAY[
      'scheduled'::text,
      'paid'::text,
      'overdue'::text,
      'waived'::text,
      'processing'::text,
      'failed'::text
    ]));
