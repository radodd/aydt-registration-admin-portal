-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Tuition Engine
--
-- 1. Extend tuition_rate_bands with progressive discount support.
-- 2. Create special_program_tuition for fixed-fee programs that bypass
--    the division-based progressive calculation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend tuition_rate_bands ────────────────────────────────────────────

ALTER TABLE tuition_rate_bands
  ADD COLUMN IF NOT EXISTS progressive_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (progressive_discount_percent >= 0 AND progressive_discount_percent <= 100),
  ADD COLUMN IF NOT EXISTS semester_total               NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS autopay_installment_amount   NUMERIC(10,2);

COMMENT ON COLUMN tuition_rate_bands.progressive_discount_percent IS
  'Percentage discount applied to the base tuition for this nth weekly class.
   0 = no discount (first class), 5 = 5% off base (second class), etc.
   Used by the tuition engine for progressive multi-class pricing.';

COMMENT ON COLUMN tuition_rate_bands.semester_total IS
  'Pre-calculated semester total inclusive of all fees and progressive discounts.
   Admin-editable reference value; the tuition engine also derives this at runtime.';

COMMENT ON COLUMN tuition_rate_bands.autopay_installment_amount IS
  'Pre-calculated per-installment amount for auto-pay plans (semester_total / installment_count).';

-- ── 2. Create special_program_tuition ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS special_program_tuition (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id                UUID        NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,

  -- Stable key used by the engine to look up overrides:
  --   'technique', 'pre_pointe', 'pointe',
  --   'competition_junior', 'competition_senior', 'early_childhood'
  program_key                TEXT        NOT NULL,

  -- Human-readable label shown in admin UI
  program_label              TEXT        NOT NULL,

  -- Fixed tuition for the full semester (no progressive discounts applied)
  semester_total             NUMERIC(10,2) NOT NULL CHECK (semester_total >= 0),

  -- Auto-pay values (null when auto-pay is not available for this program)
  autopay_installment_amount NUMERIC(10,2) CHECK (autopay_installment_amount >= 0),
  autopay_installment_count  INT           CHECK (autopay_installment_count > 0),

  notes                      TEXT,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (semester_id, program_key)
);

CREATE INDEX IF NOT EXISTS idx_special_program_tuition_semester
  ON special_program_tuition (semester_id);

COMMENT ON TABLE special_program_tuition IS
  'Fixed-tuition programs that bypass division-based progressive discount calculations.
   Includes Technique, Pre-Pointe, Pointe, Competition Team, and Early Childhood programs.';
