-- ============================================================
-- Competition Track: email configs + invite analytics
-- ============================================================

-- class_invites: first-open timestamp
-- Set once on first open (idempotent); used for dashboard display
-- without requiring a JOIN against invite_events.
ALTER TABLE public.class_invites
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NULL;

-- Back-fill: for invites already in 'opened' or 'registered' status,
-- set opened_at from the earliest 'opened' event in invite_events.
UPDATE public.class_invites ci
SET opened_at = (
  SELECT MIN(ie.created_at)
  FROM public.invite_events ie
  WHERE ie.invite_id = ci.id
    AND ie.event_type = 'opened'
)
WHERE ci.status IN ('opened', 'registered')
  AND ci.opened_at IS NULL;

-- classes: per-class competition email configurations (all nullable;
-- standard classes never populate these).
-- Each column stores a ClassEmailConfig: { subject, fromName, fromEmail, htmlBody }
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS invite_email JSONB,
  ADD COLUMN IF NOT EXISTS audition_booking_email JSONB,
  ADD COLUMN IF NOT EXISTS competition_acceptance_email JSONB;
