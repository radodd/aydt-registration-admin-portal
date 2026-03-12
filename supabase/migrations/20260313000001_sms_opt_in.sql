-- Add SMS opt-in fields to users table
ALTER TABLE users
  ADD COLUMN sms_opt_in   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN sms_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- SMS notification log table
CREATE TABLE sms_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  to_phone      TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  twilio_sid    TEXT UNIQUE,
  error_message TEXT,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON sms_notifications(twilio_sid);
CREATE INDEX ON sms_notifications(user_id);
