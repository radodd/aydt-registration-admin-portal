-- ──────────────────────────────────────────────────────────────────────────────
-- Class tiers & registration modes (Phase 2)
-- ──────────────────────────────────────────────────────────────────────────────
-- Adds per-class `is_tiered` and per-schedule `is_drop_in` flags as the new
-- source of truth for registration mode, creates a `class_tiers` table for the
-- per-class tier configuration (used when `is_tiered = true`), and relaxes
-- `classes.division` to nullable so drop-in classes don't need a division.
--
-- Legacy `divisions.is_drop_in` is left in place; read paths fall back to it
-- when the new per-schedule flag is unset on existing rows. Phase 4 will remove
-- the legacy column once registration is fully migrated.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. classes: per-class tiered flag + nullable division
ALTER TABLE public.classes
  ADD COLUMN is_tiered boolean NOT NULL DEFAULT false,
  ALTER COLUMN division DROP NOT NULL;

-- 2. class_schedules: per-schedule drop-in flag
ALTER TABLE public.class_schedules
  ADD COLUMN is_drop_in boolean NOT NULL DEFAULT false;

-- 3. class_tiers: per-class tier configuration
CREATE TABLE public.class_tiers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  label        text NOT NULL,
  start_time   time NULL,
  end_time     time NULL,
  price_cents  integer NULL CHECK (price_cents IS NULL OR price_cents >= 0),
  sort_order   integer NOT NULL DEFAULT 0,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX class_tiers_class_id_idx ON public.class_tiers(class_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- RLS for class_tiers (mirrors class_requirements policies)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.class_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY class_tiers_admin_all ON public.class_tiers
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_tiers_public_read ON public.class_tiers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.semesters s ON s.id = c.semester_id
      WHERE c.id = class_tiers.class_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_tiers_instructor_read ON public.class_tiers
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    AND EXISTS (
      SELECT 1 FROM public.class_sessions cs
      WHERE cs.class_id = class_tiers.class_id
        AND cs.instructor_id = auth.uid()
    )
  );

CREATE POLICY class_tiers_service_role ON public.class_tiers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
