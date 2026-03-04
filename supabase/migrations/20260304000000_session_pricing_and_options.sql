-- Migration: Per-session pricing, session options, excluded dates, and class/session field additions
-- All changes are additive (no drops, no type changes, no destructive operations).

/* -------------------------------------------------------------------------- */
/* 1. class_session_price_rows                                                 */
/* -------------------------------------------------------------------------- */

-- Stores named price tiers for a specific class_session.
-- If any rows exist for a session, the default row's amount drives checkout.
-- Sessions with no rows fall back to the semester's tuition_rate_bands.
CREATE TABLE class_session_price_rows (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id  UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  label             TEXT        NOT NULL,                    -- e.g. "Regular", "Early Bird", "Scholarship"
  amount            NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  is_default        BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_rows_session ON class_session_price_rows(class_session_id);

-- Partial unique index: only one default row per session
CREATE UNIQUE INDEX idx_price_rows_one_default
  ON class_session_price_rows(class_session_id)
  WHERE is_default = true;

/* -------------------------------------------------------------------------- */
/* 2. class_session_options                                                    */
/* -------------------------------------------------------------------------- */

-- Stores purchasable add-ons attached to a class_session (e.g. recital ticket,
-- costume fee). Displayed during checkout alongside the session.
CREATE TABLE class_session_options (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id  UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  description       TEXT,
  price             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_required       BOOLEAN     NOT NULL DEFAULT false,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_options_session ON class_session_options(class_session_id);

/* -------------------------------------------------------------------------- */
/* 3. class_session_excluded_dates                                             */
/* -------------------------------------------------------------------------- */

-- Tracks individual calendar dates when a recurring session does NOT meet
-- (e.g. holidays, studio closures). Used by the enrollment UI and schedule display.
CREATE TABLE class_session_excluded_dates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id  UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  excluded_date     DATE        NOT NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_session_id, excluded_date)
);

CREATE INDEX idx_excluded_dates_session ON class_session_excluded_dates(class_session_id);

/* -------------------------------------------------------------------------- */
/* 4. class_sessions — new columns                                             */
/* -------------------------------------------------------------------------- */

-- When registration opens for this specific session (NULL = always open).
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS registration_open_at TIMESTAMPTZ NULL;

-- Optional gender restriction for the session.
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS gender_restriction TEXT NULL
  CHECK (gender_restriction IN ('male', 'female', 'no_restriction'));

-- Per-session urgency threshold: when (capacity - enrolled_count) <= this value,
-- users see "Only X spots left!". NULL = no urgency display.
-- Replaces the semester-level capacity_warning_threshold for per-session control.
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS urgency_threshold INTEGER NULL CHECK (urgency_threshold >= 0);

/* -------------------------------------------------------------------------- */
/* 5. classes — new columns                                                    */
/* -------------------------------------------------------------------------- */

-- Optional public-facing display name (falls back to `name` if NULL).
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS display_name TEXT NULL;

-- Optional grade range for enrollment eligibility.
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS min_grade INTEGER NULL;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS max_grade INTEGER NULL;
