-- Class catalog schema additions
-- Supports the full AYDT dance class catalog across all disciplines.
--
-- Changes:
--   1. classes table: add registration_note, requires_parent_accompaniment,
--      min_age_months, max_age_months columns
--   2. class_requirements: extend requirement_type CHECK to include 'parent_accompaniment'
--   3. New tables: concurrent_enrollment_groups + concurrent_enrollment_options
--      for OR-logic multi-class enrollment rules

-- ── 1. Additions to classes table ────────────────────────────────────────────

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS registration_note           text,
  ADD COLUMN IF NOT EXISTS requires_parent_accompaniment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_age_months              integer,
  ADD COLUMN IF NOT EXISTS max_age_months              integer;

COMMENT ON COLUMN public.classes.registration_note IS
  'Informational text shown to families during enrollment. Not enforced. Use for mandatory rehearsal notices, multi-year program notes, session structure notes, etc.';

COMMENT ON COLUMN public.classes.requires_parent_accompaniment IS
  'Convenience flag set alongside a parent_accompaniment class_requirement row. Used by the UI to show an acknowledgment checkbox at checkout.';

COMMENT ON COLUMN public.classes.min_age_months IS
  'Age floor in whole months. When non-null, takes precedence over min_age for validation. Used for early childhood classes (e.g. 18 for "18 months+").';

COMMENT ON COLUMN public.classes.max_age_months IS
  'Age ceiling in whole months. When non-null, takes precedence over max_age for validation. Used for early childhood classes (e.g. 26 for "up to 26 months").';

-- ── 2. Extend class_requirements.requirement_type CHECK ───────────────────────

ALTER TABLE public.class_requirements
  DROP CONSTRAINT IF EXISTS class_requirements_requirement_type_check;

ALTER TABLE public.class_requirements
  ADD CONSTRAINT class_requirements_requirement_type_check
    CHECK (requirement_type = ANY (ARRAY[
      'prerequisite_completed'::text,
      'concurrent_enrollment'::text,
      'teacher_recommendation'::text,
      'skill_qualification'::text,
      'audition_required'::text,
      'parent_accompaniment'::text
    ]));

-- ── 3. concurrent_enrollment_groups ──────────────────────────────────────────
-- One row per OR-group on a class.
-- Example: Graded Ballet 5 has one group "third_weekly_class" that is satisfied
-- if the dancer is concurrently enrolled in ANY of: Graded 4, Open 4, Open 5, Technique 1.

CREATE TABLE IF NOT EXISTS public.concurrent_enrollment_groups (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL,
  group_label text NOT NULL,
  enforcement text NOT NULL DEFAULT 'hard_block',
  is_waivable boolean NOT NULL DEFAULT false,
  description text NOT NULL,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT concurrent_enrollment_groups_pkey PRIMARY KEY (id),
  CONSTRAINT concurrent_enrollment_groups_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT concurrent_enrollment_groups_enforcement_check
    CHECK (enforcement = ANY (ARRAY['hard_block'::text, 'soft_warn'::text]))
);

CREATE INDEX IF NOT EXISTS idx_concurrent_enrollment_groups_class_id
  ON public.concurrent_enrollment_groups (class_id);

COMMENT ON TABLE public.concurrent_enrollment_groups IS
  'Defines an OR-logic concurrent enrollment requirement on a class. A dancer satisfies the group if they are concurrently enrolled in at least one of the associated concurrent_enrollment_options rows.';

-- ── 4. concurrent_enrollment_options ─────────────────────────────────────────
-- Each row is one acceptable "option" within its group.
-- Match by specific class_id, by discipline, or by both (more specific wins).
-- Options within a group are OR'd; groups on the same class are AND'd.

CREATE TABLE IF NOT EXISTS public.concurrent_enrollment_options (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL,
  class_id   uuid,
  discipline text,
  level      text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT concurrent_enrollment_options_pkey PRIMARY KEY (id),
  CONSTRAINT concurrent_enrollment_options_group_id_fkey
    FOREIGN KEY (group_id)
    REFERENCES public.concurrent_enrollment_groups(id) ON DELETE CASCADE,
  CONSTRAINT concurrent_enrollment_options_class_id_fkey
    FOREIGN KEY (class_id)
    REFERENCES public.classes(id) ON DELETE SET NULL,
  CONSTRAINT concurrent_enrollment_options_must_specify_something
    CHECK (class_id IS NOT NULL OR discipline IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_concurrent_enrollment_options_group_id
  ON public.concurrent_enrollment_options (group_id);

COMMENT ON TABLE public.concurrent_enrollment_options IS
  'One acceptable class option within a concurrent_enrollment_group. Matched by class_id (exact), discipline (any class in that discipline), or both. Options within a group are OR-logic.';

COMMENT ON COLUMN public.concurrent_enrollment_options.class_id IS
  'Exact class match. If set alongside discipline, both must match (acts as a scoped filter).';

COMMENT ON COLUMN public.concurrent_enrollment_options.discipline IS
  'Discipline-level match (e.g. "ballet"). Any class in this discipline satisfies the option.';

COMMENT ON COLUMN public.concurrent_enrollment_options.level IS
  'Optional level filter within the discipline (e.g. "Open 5"). Only used when discipline is set.';
