-- Meeting-plan #7: manual-registration installments + super-admin overrides.
-- Records the chosen installment COUNT on the order when a super-admin sets up
-- an auto-charged installment plan from the admin register flow.
--
-- The per-installment rows already live in order_payment_installments
-- (installment_number 1..N); installment_count stores N on the order itself so
-- the payments dashboard and the (separate) late-join recompute window can read
-- the intended plan length without counting rows.
--
-- Card-token + auto-charge plumbing already exists:
--   registration_orders.stored_payment_method_id  (20260316000002)
--   order_payment_installments.transaction_id/...  (20260316000003)
-- so no other columns are required for the auto-charge path.

ALTER TABLE public.registration_orders
  ADD COLUMN IF NOT EXISTS installment_count integer;

COMMENT ON COLUMN public.registration_orders.installment_count IS
  'Number of installments chosen for an auto-charged installment plan (admin '
  'register flow). NULL for pay-in-full orders. The matching schedule rows live '
  'in order_payment_installments.';
