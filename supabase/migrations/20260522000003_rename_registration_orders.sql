-- ──────────────────────────────────────────────────────────────────────────────
-- Rename cluster 1 of 3: registration "batches" → "orders"
-- ──────────────────────────────────────────────────────────────────────────────
-- "Batch" described the insert mechanism, not the concept. registration_batches
-- is really a checkout/order (cart_snapshot, grand_total, payment_plan_type), and
-- its two satellites are that order's installment schedule and line items.
--
-- Table rename only. Indexes, FK constraints, RLS policies, triggers, and
-- sequences all follow the table automatically (they bind to the table OID, not
-- the name), so no other DDL is required. Their *names* still contain "batch"
-- (e.g. registration_batches_parent_id_fkey, batch_installments_admin_all) — that
-- is cosmetic and deferred; code that references those constraint names as
-- PostgREST FK hints continues to work unchanged.
--
-- FK *columns* (batch_id, registration_batch_id, source_batch_id, used_in_batch_id)
-- are intentionally NOT renamed here — that order_id normalization is a separate
-- later pass (see docs/DB_RENAME_PLAN.md §3). They keep working as-is.
--
-- See docs/DB_RENAME_PLAN.md for the full plan and remaining clusters
-- (section cluster, meeting cluster).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.registration_batches       RENAME TO registration_orders;
ALTER TABLE public.batch_payment_installments  RENAME TO order_payment_installments;
ALTER TABLE public.registration_line_items     RENAME TO order_line_items;

-- ──────────────────────────────────────────────────────────────────────────────
-- Late-binding fixup: plpgsql function bodies resolve table names at execution
-- time, so the pg_cron hold-expiry function must be re-pointed at the new name or
-- it throws "relation registration_batches does not exist" on its next 5-min tick.
-- (RLS policy subqueries that reference this table bind to its OID and survive the
-- rename automatically — no replacement needed there.)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_registration_holds()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Cancel registrations whose hold has expired
  UPDATE public.registrations
  SET status = 'cancelled'
  WHERE status = 'pending_payment'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();

  -- Mark orders as failed when all their registrations are no longer pending_payment
  UPDATE public.registration_orders
  SET status = 'failed'
  WHERE status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.registration_batch_id = registration_orders.id
        AND r.status = 'pending_payment'
    );
END;
$$;
