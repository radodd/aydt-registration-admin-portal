-- Migration: Fix class_session uniqueness for per-day enrollment model
--
-- The legacy constraint no_duplicate_class_slot enforces UNIQUE (class_id, day_of_week, start_time).
-- This was appropriate when each class_session represented a recurring weekly slot.
--
-- In the per-day model a single schedule generates N sessions for the same class on the
-- same day_of_week (e.g. 16 Monday sessions for Ballet 1A). Every one of those rows has
-- the same class_id + day_of_week + start_time, so the old constraint fires immediately
-- on the second INSERT.
--
-- Fix:
--   1. Drop the old constraint (applies to ALL rows — breaks per-day generation).
--   2. Add a per-day constraint: UNIQUE (schedule_id, schedule_date) WHERE schedule_id IS NOT NULL.
--      This enforces that a schedule generates at most one session per calendar date.
--   3. Add a legacy constraint: UNIQUE (class_id, day_of_week, start_time) WHERE schedule_id IS NULL.
--      This preserves the original protection for legacy recurring rows that have no schedule.

/* -------------------------------------------------------------------------- */
/* 1. Drop the old constraint                                                  */
/* -------------------------------------------------------------------------- */

ALTER TABLE class_sessions
  DROP CONSTRAINT IF EXISTS no_duplicate_class_slot;

/* -------------------------------------------------------------------------- */
/* 2. Per-day uniqueness: one session per (schedule, calendar date)            */
/* -------------------------------------------------------------------------- */

CREATE UNIQUE INDEX uq_class_sessions_schedule_date
  ON class_sessions (schedule_id, schedule_date)
  WHERE schedule_id IS NOT NULL;

/* -------------------------------------------------------------------------- */
/* 3. Legacy uniqueness: one slot per (class, day-of-week, start-time)        */
/* -------------------------------------------------------------------------- */

CREATE UNIQUE INDEX uq_class_sessions_legacy_slot
  ON class_sessions (class_id, day_of_week, start_time)
  WHERE schedule_id IS NULL;
