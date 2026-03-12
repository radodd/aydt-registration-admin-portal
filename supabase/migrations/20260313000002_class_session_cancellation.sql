-- Add cancellation fields to class_sessions
ALTER TABLE class_sessions
  ADD COLUMN cancelled_at        TIMESTAMPTZ NULL,
  ADD COLUMN cancellation_reason TEXT NULL;

CREATE INDEX ON class_sessions(cancelled_at) WHERE cancelled_at IS NOT NULL;
