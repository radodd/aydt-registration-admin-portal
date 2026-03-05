-- Migration: Hybrid pricing model — full_schedule vs per_session
--
-- Each class_schedule block now declares a pricing_model:
--   full_schedule — user must enroll in the entire schedule; price is a schedule-level tier.
--   per_session   — user picks individual class_sessions; each session has a flat drop-in price.
--
-- This migration is fully additive. Existing schedules default to full_schedule.

/* -------------------------------------------------------------------------- */
/* 1. class_schedules — add pricing_model                                      */
/* -------------------------------------------------------------------------- */

ALTER TABLE class_schedules
  ADD COLUMN pricing_model TEXT NOT NULL DEFAULT 'full_schedule'
    CHECK (pricing_model IN ('full_schedule', 'per_session'));

/* -------------------------------------------------------------------------- */
/* 2. schedule_price_tiers — Mode A schedule-level price tiers                 */
/*                                                                             */
/* The old class_session_price_rows was designed as a per-date rate-band       */
/* override. schedule_price_tiers is the correct abstraction: one set of named  */
/* tiers per schedule, not per generated session.                               */
/* -------------------------------------------------------------------------- */

CREATE TABLE schedule_price_tiers (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  UUID          NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
  label        TEXT          NOT NULL,                         -- "Regular", "Early Bird", "Scholarship"
  amount       NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  sort_order   INTEGER       NOT NULL DEFAULT 0,
  is_default   BOOLEAN       NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_price_tiers_schedule ON schedule_price_tiers(schedule_id);

-- Enforce exactly one default tier per schedule
CREATE UNIQUE INDEX uq_schedule_price_tiers_default
  ON schedule_price_tiers(schedule_id)
  WHERE is_default = true;

/* -------------------------------------------------------------------------- */
/* 3. class_sessions — add drop_in_price for Mode B                           */
/*                                                                             */
/* Propagated from the schedule at session generation time.                    */
/* Sessions belonging to a full_schedule have drop_in_price = NULL.            */
/* -------------------------------------------------------------------------- */

ALTER TABLE class_sessions
  ADD COLUMN drop_in_price NUMERIC(10,2) NULL CHECK (drop_in_price >= 0);

/* -------------------------------------------------------------------------- */
/* 4. schedule_enrollments — Mode A enrollment record                          */
/*                                                                             */
/* Replaces per-session registrations for full_schedule blocks.                */
/* One row per (dancer, schedule). Financial record lives in                   */
/* registration_line_items (below).                                            */
/* -------------------------------------------------------------------------- */

CREATE TABLE schedule_enrollments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id      UUID          NOT NULL REFERENCES class_schedules(id),
  batch_id         UUID          NOT NULL REFERENCES registration_batches(id) ON DELETE CASCADE,
  dancer_id        UUID          NOT NULL REFERENCES dancers(id),
  price_tier_id    UUID          REFERENCES schedule_price_tiers(id) ON DELETE SET NULL,
  price_snapshot   NUMERIC(10,2) NOT NULL,  -- immutable once created; source tier may change
  status           TEXT          NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- One enrollment per dancer per schedule
  UNIQUE (schedule_id, dancer_id)
);

CREATE INDEX idx_schedule_enrollments_batch    ON schedule_enrollments(batch_id);
CREATE INDEX idx_schedule_enrollments_dancer   ON schedule_enrollments(dancer_id);
CREATE INDEX idx_schedule_enrollments_schedule ON schedule_enrollments(schedule_id);

/* -------------------------------------------------------------------------- */
/* 5. Capacity trigger for schedule_enrollments (Mode A)                       */
/*                                                                             */
/* Mirrors check_session_capacity() but operates at the schedule level.        */
/* Uses FOR UPDATE to serialize concurrent enrollments.                        */
/* -------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION check_schedule_enrollment_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sched_capacity INTEGER;
  enrolled_count INTEGER;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT capacity INTO sched_capacity
  FROM class_schedules
  WHERE id = NEW.schedule_id
  FOR UPDATE;  -- serialize concurrent inserts

  IF sched_capacity IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO enrolled_count
  FROM schedule_enrollments
  WHERE schedule_id = NEW.schedule_id
    AND status != 'cancelled'
    AND id IS DISTINCT FROM NEW.id;

  IF enrolled_count >= sched_capacity THEN
    RAISE EXCEPTION
      'Schedule is at capacity — % enrolled, capacity is %.',
      enrolled_count, sched_capacity;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_schedule_enrollment_capacity
  BEFORE INSERT OR UPDATE ON schedule_enrollments
  FOR EACH ROW EXECUTE FUNCTION check_schedule_enrollment_capacity();

/* -------------------------------------------------------------------------- */
/* 6. registration_line_items — normalized financial record for both modes     */
/*                                                                             */
/* Source of truth for what is charged in a registration_batch.               */
/* Item types:                                                                  */
/*   full_schedule    — Mode A schedule enrollment                             */
/*   drop_in         — Mode B individual session                              */
/*   option          — purchasable add-on                                     */
/*   registration_fee — per-dancer fixed fee                                  */
/*   family_discount  — batch-level credit (dancer_id NULL)                   */
/*   auto_pay_fee     — batch-level fee (dancer_id NULL)                      */
/* -------------------------------------------------------------------------- */

CREATE TABLE registration_line_items (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id               UUID          NOT NULL REFERENCES registration_batches(id) ON DELETE CASCADE,
  dancer_id              UUID          REFERENCES dancers(id),  -- NULL for batch-level items

  -- Exactly one of these is non-null for enrollment items; both null for fees/discounts
  session_id             UUID          REFERENCES class_sessions(id),
  schedule_enrollment_id UUID          REFERENCES schedule_enrollments(id),

  item_type TEXT NOT NULL CHECK (item_type IN (
    'full_schedule',
    'drop_in',
    'option',
    'registration_fee',
    'family_discount',
    'auto_pay_fee'
  )),
  label        TEXT          NOT NULL,
  unit_amount  NUMERIC(10,2) NOT NULL,
  quantity     INTEGER       NOT NULL DEFAULT 1,
  amount       NUMERIC(10,2) NOT NULL,  -- final amount (unit_amount * quantity, post any per-line discount)

  CONSTRAINT chk_line_item_source CHECK (
    -- Enrollment line items must not reference both sources simultaneously
    NOT (session_id IS NOT NULL AND schedule_enrollment_id IS NOT NULL)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_line_items_batch           ON registration_line_items(batch_id);
CREATE INDEX idx_line_items_session         ON registration_line_items(session_id);
CREATE INDEX idx_line_items_schedule_enroll ON registration_line_items(schedule_enrollment_id);

/* -------------------------------------------------------------------------- */
/* 7. discount_rule_schedules — Mode A discount targeting                      */
/*                                                                             */
/* Parallel to discount_rule_sessions (Mode B).                                */
/* A discount rule can target schedules (full_schedule mode) or sessions       */
/* (per_session mode) — not both simultaneously.                               */
/* -------------------------------------------------------------------------- */

CREATE TABLE discount_rule_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_rule_id UUID NOT NULL REFERENCES discount_rules(id) ON DELETE CASCADE,
  schedule_id      UUID NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
  UNIQUE (discount_rule_id, schedule_id)
);

CREATE INDEX idx_discount_rule_schedules_rule     ON discount_rule_schedules(discount_rule_id);
CREATE INDEX idx_discount_rule_schedules_schedule ON discount_rule_schedules(schedule_id);
