-- Remove the `level` column from classes — no longer used.
ALTER TABLE classes DROP COLUMN IF EXISTS level;
