-- Migration: Extended fee configuration
--
-- 1. semester_fee_config: add junior_costume_fee_per_class
--    Junior division dancers pay a per-class costume fee ($55/class default),
--    separate from the senior tier ($65/class). This column was missing.
--
-- 2. special_program_tuition: add registration_fee_override
--    Allows per-program override of the semester-level registration fee.
--    NULL  → use global registration_fee_per_child from semester_fee_config
--    0.00  → exempt (no registration fee for this program)
--    Other → use that exact amount
--
-- Both changes are additive — defaults keep existing rows valid.

-- ── 1. Junior costume fee ────────────────────────────────────────────────────

ALTER TABLE semester_fee_config
  ADD COLUMN IF NOT EXISTS junior_costume_fee_per_class NUMERIC(10,2) NOT NULL DEFAULT 55.00;

COMMENT ON COLUMN semester_fee_config.junior_costume_fee_per_class IS
  'Per-class costume fee for junior division dancers. Multiplied by the dancer''s
   standard weekly class count at checkout. Default $55. Not applied to special
   program classes (technique, pointe, competition, early childhood).';

-- ── 2. Registration fee override on special programs ─────────────────────────

ALTER TABLE special_program_tuition
  ADD COLUMN IF NOT EXISTS registration_fee_override NUMERIC(10,2);

COMMENT ON COLUMN special_program_tuition.registration_fee_override IS
  'Override the semester-level registration_fee_per_child for this program.
   NULL  = use the global fee from semester_fee_config (default behavior).
   0.00  = exempt — no registration fee charged for this program.
   Other = use this exact amount instead of the global fee.
   Technique, Pre-Pointe, Pointe, and Competition programs are set to 0.00.';
