-- Family account credits
-- Admins can issue dollar credits to a family's account.
-- Credits are stored here and can be applied toward future registrations.
-- They are NOT cash refunds — they are reallocated as a reusable credit balance.

CREATE TABLE family_account_credits (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount              numeric(10,2) NOT NULL CHECK (amount > 0),
  reason              text,
  issued_by_admin_id  uuid REFERENCES users(id),
  source_batch_id     uuid REFERENCES registration_batches(id),
  used_in_batch_id    uuid REFERENCES registration_batches(id),
  used_at             timestamptz,
  created_at          timestamptz DEFAULT now(),
  is_active           boolean NOT NULL DEFAULT true
);

CREATE INDEX family_account_credits_family_id_idx ON family_account_credits(family_id);
CREATE INDEX family_account_credits_used_in_batch_id_idx ON family_account_credits(used_in_batch_id);
