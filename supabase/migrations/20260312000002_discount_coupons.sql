-- Migration: Coupon/promo code system
-- Adds discount_coupons, coupon_session_restrictions, semester_coupons, coupon_redemptions

CREATE TABLE public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,                         -- NULL = auto-apply by date (no code entry needed)
  value numeric(10,2) NOT NULL CHECK (value > 0),
  value_type text NOT NULL CHECK (value_type IN ('flat', 'percent')),
  valid_from timestamptz,                   -- NULL = no start restriction
  valid_until timestamptz,                  -- NULL = no expiry
  max_total_uses integer CHECK (max_total_uses > 0), -- NULL = unlimited
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  max_per_family integer NOT NULL DEFAULT 1 CHECK (max_per_family > 0),
  stackable boolean NOT NULL DEFAULT false, -- true = stacks with threshold-based discounts
  eligible_sessions_mode text NOT NULL DEFAULT 'all'
    CHECK (eligible_sessions_mode IN ('all', 'selected')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Restrict coupon to specific class sessions (when eligible_sessions_mode = 'selected')
CREATE TABLE public.coupon_session_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  UNIQUE (coupon_id, session_id)
);

-- Junction: which coupons are available for a given semester
CREATE TABLE public.semester_coupons (
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  PRIMARY KEY (semester_id, coupon_id)
);

-- Record of each time a family redeems a coupon
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.discount_coupons(id) ON DELETE RESTRICT,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE RESTRICT,
  registration_batch_id uuid REFERENCES public.registration_batches(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup: has this family already redeemed this coupon?
CREATE INDEX idx_coupon_redemptions_coupon_family
  ON public.coupon_redemptions (coupon_id, family_id);

-- Auto-update updated_at on discount_coupons
CREATE OR REPLACE FUNCTION public.set_discount_coupon_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_discount_coupons_updated_at
  BEFORE UPDATE ON public.discount_coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_discount_coupon_updated_at();

-- Atomic increment for uses_count; called from the app after a redemption is recorded
CREATE OR REPLACE FUNCTION public.increment_coupon_uses(p_coupon_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.discount_coupons
  SET uses_count = uses_count + 1
  WHERE id = p_coupon_id;
$$;
