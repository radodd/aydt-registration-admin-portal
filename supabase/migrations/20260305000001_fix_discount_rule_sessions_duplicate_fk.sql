-- Migration: Remove duplicate FK on discount_rule_sessions.session_id
-- PostgREST cannot resolve embedded resources when multiple FK constraints
-- exist between the same two tables. This idempotently ensures only one FK
-- remains on discount_rule_sessions.session_id → class_sessions.id.

ALTER TABLE discount_rule_sessions
  DROP CONSTRAINT IF EXISTS fk_drs_session;

-- Re-assert the canonical FK (idempotent via DROP + ADD)
ALTER TABLE discount_rule_sessions
  DROP CONSTRAINT IF EXISTS discount_rule_sessions_session_id_fkey;

ALTER TABLE discount_rule_sessions
  ADD CONSTRAINT discount_rule_sessions_session_id_fkey
    FOREIGN KEY (session_id)
    REFERENCES class_sessions(id)
    ON DELETE CASCADE;
