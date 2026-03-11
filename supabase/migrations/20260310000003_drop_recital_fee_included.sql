-- Drop the redundant recital_fee_included column from tuition_rate_bands.
-- This field was an admin-only reference that duplicated the per-class
-- recital costume fee already stored in semester_fee_config
-- (junior_costume_fee_per_class / senior_costume_fee_per_class).
-- The column was never used in the pricing engine and is now removed to
-- eliminate the confusion of having two separate "recital fee" inputs.

ALTER TABLE tuition_rate_bands
  DROP COLUMN IF EXISTS recital_fee_included;
