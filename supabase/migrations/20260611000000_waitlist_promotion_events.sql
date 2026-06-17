-- Meeting-plan (2026-06-10 decision): ZERO-TOUCH waitlist auto-promotion.
--
-- This migration adds the OBSERVABILITY layer first: an admin-reviewable event +
-- error log for the whole promotion lifecycle (offer created/sent/expired,
-- claimed, rolled-to-next, queue emptied, reopened-to-public, manual-fallback
-- flagged, and any error the engine could not self-remediate). The admin "Logs"
-- view reads this table; the auto-promote edge function and the manual-assign
-- action write to it.
--
-- Modeled deliberately on `enrollment_warnings` (20260420000002) — same shape of
-- typed feed (event_type + message + entity FKs + detail jsonb + is_reviewed /
-- reviewed_by / reviewed_at), so the admin UI can mirror app/admin/warnings.
--
-- Append-only / additive: creates ONE new table. No existing object is altered.
-- Timestamp is later than the newest migration on disk (20260610000000) per the
-- MEMORY note on timestamp-collision silently skipping DDL.

CREATE TABLE IF NOT EXISTS public.waitlist_promotion_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened. Kept as free-text-with-CHECK so new event kinds can be added
  -- via the same drop/re-add pattern without a separate enum type.
  event_type    text NOT NULL CHECK (event_type IN (
                   'seat_freed',              -- a hold lapsed / enrollment cancelled / capacity raised
                   'offer_created',           -- front-of-queue reserved (pending order) + offer opened
                   'offer_sent',              -- claim email dispatched
                   'offer_reminder_sent',     -- reminder before expiry
                   'offer_claimed',           -- claimer paid → enrolled
                   'offer_expired',           -- window lapsed, seat released back
                   'rolled_to_next',          -- offer moved to the next person in queue
                   'queue_emptied',           -- no one left to offer
                   'reopened_to_public',      -- seat returned to the public catalog
                   'manual_fallback_flagged', -- ambiguous/unrecoverable → admin must assign
                   'manual_assigned',         -- an admin assigned the seat by hand
                   'error'                    -- engine could not self-remediate (see detail)
                 )),

  severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),

  -- Who/what this event is about. All nullable so a coarse engine-level event
  -- (e.g. a cron error) can be logged without a specific entry.
  waitlist_entry_id uuid REFERENCES public.waitlist_entries(id) ON DELETE SET NULL,
  class_id          uuid REFERENCES public.classes(id)          ON DELETE CASCADE,
  section_id        uuid REFERENCES public.class_sections(id)   ON DELETE SET NULL,
  meeting_id        uuid REFERENCES public.class_meetings(id)   ON DELETE SET NULL,
  semester_id       uuid REFERENCES public.semesters(id)        ON DELETE CASCADE,
  -- The reservation/claim order, when this event involved one.
  batch_id          uuid REFERENCES public.registration_orders(id) ON DELETE SET NULL,

  -- Human-readable line for the admin feed + machine detail for diagnosis
  -- (error stack, the contender set for a manual fallback, prior offer attempts).
  message       text  NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Review workflow, mirroring enrollment_warnings so the admin can triage errors.
  is_reviewed   boolean NOT NULL DEFAULT false,
  reviewed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Feed is read newest-first per semester; errors are triaged on their own.
CREATE INDEX IF NOT EXISTS idx_wpe_semester_created ON public.waitlist_promotion_events (semester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpe_class            ON public.waitlist_promotion_events (class_id);
CREATE INDEX IF NOT EXISTS idx_wpe_entry            ON public.waitlist_promotion_events (waitlist_entry_id);
CREATE INDEX IF NOT EXISTS idx_wpe_event_type       ON public.waitlist_promotion_events (event_type);
CREATE INDEX IF NOT EXISTS idx_wpe_unreviewed_error ON public.waitlist_promotion_events (created_at DESC)
  WHERE severity = 'error' AND is_reviewed = false;

COMMENT ON TABLE public.waitlist_promotion_events IS
  'Admin-reviewable event + error log for zero-touch waitlist auto-promotion '
  '(offer lifecycle, roll-to-next, public reopen, manual fallback, errors). '
  'Written by the auto-promote edge function (service role) and the manual-assign '
  'action; read by the admin Logs view. Modeled on enrollment_warnings.';

/* ========================================================================== */
/* RLS — admin-only read/triage. The engine writes via the service-role client */
/* (which bypasses RLS), matching the waitlist_service_role pattern.            */
/* ========================================================================== */

ALTER TABLE public.waitlist_promotion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpe_admin_all ON public.waitlist_promotion_events;
CREATE POLICY wpe_admin_all ON public.waitlist_promotion_events
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
  ));
