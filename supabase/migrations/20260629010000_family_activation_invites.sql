-- #62 Account activation rollout (Option A): silent create + phased batch invites.
--
-- Migrated family accounts are created SILENTLY (no email at create time). A
-- separate, admin-triggered batch sends activation invites to a chosen cohort,
-- rolled out small -> large. This column records when a family was last sent an
-- activation invite: NULL = silently created, never invited (the default cohort
-- the batch console offers first). Stamping it makes batches idempotent (skip
-- already-invited families) and lets the console split invited vs. un-invited.
--
-- The normal admin "create family + send welcome" path stamps this too, so
-- families onboarded through that flow never resurface as "un-invited."

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS activation_invited_at timestamptz;

COMMENT ON COLUMN public.families.activation_invited_at IS
  'When an activation invite (passwordless welcome) was last sent to this family. NULL = silently created, not yet invited.';
