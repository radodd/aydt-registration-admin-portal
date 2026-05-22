-- ──────────────────────────────────────────────────────────────────────────────
-- Drop the dead `registrations.batch_id` column
-- ──────────────────────────────────────────────────────────────────────────────
-- `registrations` carried two nullable FKs to registration_batches:
--   • registration_batch_id  — the authoritative column. Set by the canonical
--     write path (createRegistrations) and read by every consumer (EPG webhook
--     confirm, confirmation page, stale-batch cleanup).
--   • batch_id               — vestigial. Never written and never read by any
--     application code. Verified NULL on all rows
--     (SELECT count(*) WHERE batch_id IS NOT NULL AND registration_batch_id IS NULL = 0).
--
-- Beyond being dead, batch_id carried a UNIQUE partial index
-- (registrations_batch_id_idx WHERE batch_id IS NOT NULL) that is backwards for
-- the one-batch-to-many-registrations model — it would reject two registrations
-- sharing a batch if the column were ever populated. Removing it eliminates that
-- latent footgun.
--
-- DROP COLUMN automatically drops the column's dependent objects:
--   • idx_registrations_batch_id        (index)
--   • registrations_batch_id_idx        (unique partial index)
--   • registrations_batch_id_fkey       (FK constraint)
-- No separate DROP statements are required.
--
-- The authoritative registration_batch_id column is untouched. (Its eventual
-- rename to order_id is tracked in docs/DB_RENAME_PLAN.md, post-launch.)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.registrations
  DROP COLUMN IF EXISTS batch_id;
