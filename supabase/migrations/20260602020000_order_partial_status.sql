-- Meeting-plan #19: partial-payment balance must propagate to the dancer
-- profile + payment dashboard.
--
-- A super-admin can under-collect on a manual (cash/check) registration — e.g.
-- $400 cash on an $800 order. Until now such an order was written `confirmed`,
-- making it look fully paid. We need a distinct financial status so the order
-- reads as partially paid everywhere it surfaces.
--
-- The CHECK constraint still carries its pre-rename name
-- (`registration_batches_status_check`) because renaming the table in
-- 20260522000003 did not rename its constraints. Drop by every name it could
-- have, then re-add under the current table name with 'partial' added.

ALTER TABLE public.registration_orders
  DROP CONSTRAINT IF EXISTS registration_batches_status_check,
  DROP CONSTRAINT IF EXISTS registration_orders_status_check;

ALTER TABLE public.registration_orders
  ADD CONSTRAINT registration_orders_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'partial'::text, 'failed'::text, 'refunded'::text]));
