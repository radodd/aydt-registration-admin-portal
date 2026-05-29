-- Meeting-plan #5: manual, capacity-neutral waitlist.
--
-- Replaces the old AUTO-invite model (process_waitlist_cron + per-meeting
-- semesters.waitlist_settings) with a MANUAL one:
--   * A per-CLASS toggle (classes.waitlist_enabled) decides whether a full class
--     offers "join waitlist" in the public flow.
--   * A waitlist entry is a PURE QUEUE row with ZERO capacity impact — it never
--     holds or consumes a seat. "Full" is still computed from real enrollments.
--   * The entry stores a complete registration record MINUS payment (form answers
--     + family/dancer pointers) so an admin can later convert it into a real
--     registration. Brand-new users are captured as raw form_data with NO dancer
--     row created yet (dancer_id stays NULL until invite/register).
--   * Admins manually pick who registers; the system NEVER auto-invites. The only
--     automated email is a "you're on the waitlist" confirmation (sent by the
--     joinWaitlist server action, not by this migration).
--
-- Table/column names reflect the 2026-05-22 rename cluster: waitlist_entries
-- points at class_meetings via meeting_id (formerly session_id).

-- ---------------------------------------------------------------------------
-- 1. Per-class toggle. Matches the existing boolean-flag convention on classes
--    (is_tiered, requires_parent_accompaniment).
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.classes.waitlist_enabled IS
  'Meeting-plan #5: when true, a full class offers "join waitlist" in the public '
  'registration flow. Capacity-neutral — waitlist entries never consume a seat.';

-- ---------------------------------------------------------------------------
-- 2. Extend waitlist_entries to hold a full registration record minus payment.
--    dancer_id becomes nullable so brand-new (not-yet-created) dancers can be
--    captured purely as form_data.
-- ---------------------------------------------------------------------------
ALTER TABLE public.waitlist_entries
  ALTER COLUMN dancer_id DROP NOT NULL;

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.class_sections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS class_tier_id uuid REFERENCES public.class_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS signed_up_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.waitlist_entries.class_id IS
  'Meeting-plan #5: the class whose waitlist this entry joined. Authoritative '
  'target alongside meeting_id (drop-in) / section_id (full-term/tiered).';
COMMENT ON COLUMN public.waitlist_entries.form_data IS
  'Meeting-plan #5: captured registration form answers (registration minus '
  'payment). For brand-new users this also carries the prospective dancer/family '
  'details since no dancer row is created until an admin invites/registers them.';
COMMENT ON COLUMN public.waitlist_entries.contact_email IS
  'Meeting-plan #5: email for the join-confirmation and the manual invite link. '
  'Falls back from the authenticated parent; required for brand-new users.';
COMMENT ON COLUMN public.waitlist_entries.signed_up_at IS
  'Meeting-plan #5: timestamp that defines chronological queue order in the admin '
  'waitlist view. Distinct from created_at to allow admin reordering later.';

-- Widen the status vocabulary for the manual model. A CHECK cannot be extended
-- in place, so drop and re-add. New values:
--   waiting        — on the list, no action taken (capacity-neutral)
--   invited        — admin emailed a tokenized payment link (Path A). Engages the
--                    class_meetings delete-guard trigger while unexpired.
--   registered     — converted into a real registration (Path A paid OR Path B)
--   declined       — user declined
--   expired        — invite lapsed
--   cancelled      — admin removed the entry
-- ('accepted' retained for backward compat with any existing rows.)
ALTER TABLE public.waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_status_check;
ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT waitlist_entries_status_check
  CHECK (status = ANY (ARRAY[
    'waiting'::text,
    'invited'::text,
    'accepted'::text,
    'registered'::text,
    'declined'::text,
    'expired'::text,
    'cancelled'::text
  ]));

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_class_id
  ON public.waitlist_entries USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_signed_up_at
  ON public.waitlist_entries USING btree (signed_up_at);

-- ---------------------------------------------------------------------------
-- 3. RLS: allow a logged-in parent to insert their OWN waitlist entry. Mirrors
--    registration_orders_parent_insert (ownership keyed to auth.uid()).
--    Brand-new (unauthenticated) users are inserted by the joinWaitlist server
--    action using the service-role key, already covered by waitlist_service_role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS waitlist_parent_insert ON public.waitlist_entries;
CREATE POLICY waitlist_parent_insert ON public.waitlist_entries
  FOR INSERT TO authenticated
  WITH CHECK (parent_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Disable the OLD auto-invite cron. The cron job itself was created in the
--    Supabase dashboard (not in any migration), so its job name is unknown here.
--    Best-effort, idempotent unschedule of anything pointing at the
--    process-waitlist function. The edge function is also gated separately so a
--    surviving schedule no-ops. Guarded on the cron extension existing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    FOR r IN
      SELECT jobid
      FROM cron.job
      WHERE command ILIKE '%process_waitlist_cron%'
         OR command ILIKE '%process-waitlist%'
    LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;
  END IF;
END $$;
