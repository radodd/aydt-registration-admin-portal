-- Add configurable costume-fee exemption keys to semester_fee_config.
-- Defaults preserve the previously hardcoded behaviour: technique, pointe,
-- and competition-division classes are exempt from junior/senior costume fees
-- and the registration fee.
ALTER TABLE semester_fee_config
  ADD COLUMN IF NOT EXISTS costume_fee_exempt_keys TEXT[]
  NOT NULL DEFAULT ARRAY['technique','pointe','competition'];
