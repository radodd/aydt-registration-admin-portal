-- ============================================================================
-- Migration: class tuition override + enrollment requirement refinements
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-class tuition override
--    Nullable flat dollar amount that bypasses division rate-band lookup.
--    When NULL → use normal rate-band pricing.
-- ---------------------------------------------------------------------------
ALTER TABLE classes
  ADD COLUMN tuition_override_amount NUMERIC(10, 2) NULL;

COMMENT ON COLUMN classes.tuition_override_amount IS
  'If non-null, this flat amount is used as the class tuition for ALL sessions '
  'of this class, bypassing the tuition_rate_bands lookup entirely.';

-- ---------------------------------------------------------------------------
-- 2. Remove skill_qualification requirement type
--    Migrate existing rows to prerequisite_completed (functionally equivalent).
-- ---------------------------------------------------------------------------
UPDATE class_requirements
  SET requirement_type = 'prerequisite_completed'
  WHERE requirement_type = 'skill_qualification';

-- Drop and re-create the CHECK constraint without skill_qualification.
ALTER TABLE class_requirements
  DROP CONSTRAINT class_requirements_requirement_type_check;

ALTER TABLE class_requirements
  ADD CONSTRAINT class_requirements_requirement_type_check
  CHECK (requirement_type = ANY (ARRAY[
    'prerequisite_completed'::text,
    'concurrent_enrollment'::text,
    'teacher_recommendation'::text,
    'audition_required'::text,
    'parent_accompaniment'::text
  ]));

-- ---------------------------------------------------------------------------
-- 3. Approved-dancer list for teacher_recommendation requirements
--    When a dancer is in this list for a requirement, the teacher_recommendation
--    check is skipped entirely (no warning issued) — they're pre-approved.
-- ---------------------------------------------------------------------------
CREATE TABLE public.class_requirement_approved_dancers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_requirement_id UUID NOT NULL
    REFERENCES public.class_requirements(id) ON DELETE CASCADE,
  dancer_id            UUID NOT NULL
    REFERENCES public.dancers(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_requirement_id, dancer_id)
);

COMMENT ON TABLE public.class_requirement_approved_dancers IS
  'Pre-approved dancers for teacher_recommendation requirements. '
  'A dancer in this list bypasses the soft warning for that requirement.';

-- RLS: admins can read/write; no public access.
ALTER TABLE public.class_requirement_approved_dancers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage approved dancers"
  ON public.class_requirement_approved_dancers
  FOR ALL
  USING (true)
  WITH CHECK (true);
