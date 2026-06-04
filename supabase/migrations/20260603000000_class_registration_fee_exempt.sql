-- Meeting-plan #22: per-offering registration-fee exemption.
--
-- Some offerings carry NO registration fee — a runoff, a movie night, or an
-- internal registration like Art in Motion. This adds a per-CLASS toggle so an
-- admin can exempt an individual class from the per-child registration fee
-- without affecting its costume/video fees (those keep their own exempt logic
-- via semester_fee_config.costume_fee_exempt_keys).
--
-- The pricing engine (computePricingQuote) reads this flag in the
-- registration-fee branch ONLY: a dancer whose classes are ALL reg-fee-exempt
-- pays no Registration Fee line item; a dancer mixing an exempt offering with a
-- standard class still pays the fee once.

-- Matches the existing boolean-flag convention on classes
-- (is_tiered, waitlist_enabled, requires_parent_accompaniment).
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS registration_fee_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.classes.registration_fee_exempt IS
  'Meeting-plan #22: when true, this class is exempt from the per-child '
  'registration fee. Affects the registration_fee line item only — costume/video '
  'fees are governed separately by semester_fee_config.costume_fee_exempt_keys.';
