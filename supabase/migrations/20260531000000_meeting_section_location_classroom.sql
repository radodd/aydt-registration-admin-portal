-- Migration: location address + classroom name for confirmation-email receipt
--
-- Meeting-plan item #4 (confirmation email static summary) wants a receipt-style
-- block that lists, per session: location, *location address*, and *classroom*.
-- The session tables only carried a free-text `location` — there were no columns
-- for a street address or a room/classroom label. Add them to BOTH session layers
-- so the receipt can render them when present:
--   - class_meetings  → one generated calendar date (drop-in / per-day flow)
--   - class_sections  → the recurring full-term offering (standard / tiered flow)
--
-- Additive + nullable. No backfill: these stay NULL (and are simply omitted from
-- the receipt) until an authoring UI populates them. No online-session flag is
-- added — that field was explicitly dropped from the #4 scope.

ALTER TABLE public.class_meetings
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS classroom_name   TEXT;

ALTER TABLE public.class_sections
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS classroom_name   TEXT;
