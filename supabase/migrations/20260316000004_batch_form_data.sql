-- Migration: Add form_data to registration_batches
--
-- Previously form_data was stored per-registration row (one duplicate copy per
-- class_session). Now that class is the registrable unit and enrollments live in
-- schedule_enrollments, form answers are stored once at the batch level.

ALTER TABLE registration_batches
  ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb NOT NULL;
