-- ============================================================
-- Email Recipient System: Family-level model
-- ============================================================

-- 1. email_recipient_selections: add class_id, include_instructors, family_id
ALTER TABLE public.email_recipient_selections
  ADD COLUMN IF NOT EXISTS class_id UUID
    REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS include_instructors BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS family_id UUID
    REFERENCES public.families(id) ON DELETE CASCADE;

-- 2. Rebuild selection_type CHECK to include 'class'
ALTER TABLE public.email_recipient_selections
  DROP CONSTRAINT IF EXISTS email_recipient_selections_selection_type_check;

ALTER TABLE public.email_recipient_selections
  ADD CONSTRAINT email_recipient_selections_selection_type_check
  CHECK (selection_type = ANY (ARRAY[
    'semester'::text,
    'session'::text,
    'class'::text,
    'manual'::text,
    'subscribed_list'::text
  ]));

-- 3. email_recipients: add family_id + dancer_context snapshot
ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS family_id UUID
    REFERENCES public.families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dancer_context JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_email_recipients_family_id
  ON public.email_recipients (family_id);
