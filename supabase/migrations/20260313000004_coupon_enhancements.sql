-- Migration: coupon line-item targeting enhancements
-- Adds two columns to discount_coupons:
--   applies_to_most_expensive_only  — when true, discount applies only to the
--                                     single highest-priced eligible line item
--   eligible_line_item_types        — array of line item types the coupon may
--                                     discount (tuition / registration_fee / recital_fee)
--
-- All existing rows receive the backward-compatible defaults:
--   applies_to_most_expensive_only = false  (sum mode, same as before)
--   eligible_line_item_types = all three    (equivalent to old preCouponTotal scope)

ALTER TABLE public.discount_coupons
  ADD COLUMN applies_to_most_expensive_only boolean NOT NULL DEFAULT false,
  ADD COLUMN eligible_line_item_types text[]
    NOT NULL DEFAULT ARRAY['tuition','registration_fee','recital_fee']::text[];

ALTER TABLE public.discount_coupons
  ADD CONSTRAINT chk_eligible_line_item_types CHECK (
    eligible_line_item_types <@ ARRAY['tuition','registration_fee','recital_fee']::text[]
  );
