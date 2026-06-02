-- Meeting-plan #18: add ACH to manual-reg payment methods (keep check).
--
-- A one-time admin-initiated ACH debit runs on Elavon's hosted bank-entry page
-- and does NOT store a payment method, so there is no `stored_payment_method_id`
-- to join for display. We therefore record the method directly on the order so
-- the payments dashboard, dancer profile, and receipts can show "ACH" rather
-- than inferring card details from `payments.raw_transaction.card` (which is
-- null for an ACH transaction).
--
-- Nullable + no backfill: historical orders pre-date the column and the synchronous
-- manual flow already encodes the method in `payment_reference_id`. The allowed
-- set mirrors the manual-reg method buttons (cash/check/card/other) plus `ach`.

ALTER TABLE public.registration_orders
  ADD COLUMN IF NOT EXISTS payment_method text
  CHECK (payment_method IN ('cash', 'check', 'card', 'ach', 'other'));
