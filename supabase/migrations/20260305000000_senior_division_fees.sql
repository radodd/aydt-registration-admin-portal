-- Migration: Senior division extra fees
-- Adds video_fee and costume_fee columns to semester_fee_config.
-- These are senior-division-specific charges billed per semester.
--   video_fee_per_registrant: flat $15 charge per senior dancer registered
--   costume_fee_per_class:    $65 per class/week for senior dancers
-- All changes are additive — no data loss, defaults keep existing rows valid.

ALTER TABLE semester_fee_config
  ADD COLUMN senior_video_fee_per_registrant NUMERIC(10,2) NOT NULL DEFAULT 15.00,
  ADD COLUMN senior_costume_fee_per_class    NUMERIC(10,2) NOT NULL DEFAULT 65.00;
