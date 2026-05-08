-- Divisions lookup table.
-- Replaces the hardcoded CHECK constraint on classes.division and tuition_rate_bands.division
-- with an FK to a `divisions` table so admins can create new divisions inline (e.g. "adult" for
-- drop-in classes, future "Teen Hip-Hop", etc.) without a migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.divisions (
    id text PRIMARY KEY,
    label text NOT NULL,
    sort_order integer NOT NULL DEFAULT 100,
    is_drop_in boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.divisions (id, label, sort_order, is_drop_in) VALUES
    ('early_childhood', 'Early Childhood', 10, false),
    ('junior',          'Junior',           20, false),
    ('senior',          'Senior',           30, false),
    ('competition',     'Competition',      40, false),
    ('adult',           'Drop-In',          50, true)
ON CONFLICT (id) DO NOTHING;

-- Ensure the label is "Drop-In" even if this row was previously seeded as "Adult".
UPDATE public.divisions SET label = 'Drop-In' WHERE id = 'adult';

-- Drop existing CHECK constraints
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_division_check;
ALTER TABLE public.tuition_rate_bands DROP CONSTRAINT IF EXISTS tuition_rate_bands_division_check;

-- Add FK constraints
ALTER TABLE public.classes
    ADD CONSTRAINT classes_division_fkey
    FOREIGN KEY (division) REFERENCES public.divisions(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.tuition_rate_bands
    ADD CONSTRAINT tuition_rate_bands_division_fkey
    FOREIGN KEY (division) REFERENCES public.divisions(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- RLS: admin full access, public read.
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY divisions_admin_all ON public.divisions
    FOR ALL TO authenticated
    USING (public.is_admin_or_super())
    WITH CHECK (public.is_admin_or_super());

CREATE POLICY divisions_public_read ON public.divisions
    FOR SELECT
    USING (true);

CREATE POLICY divisions_service_role ON public.divisions
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

COMMIT;
