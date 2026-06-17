-- Meeting-plan (2026-06-10 decision): ZERO-TOUCH waitlist auto-promotion — Stage A.
--
-- Extends `waitlist_entries` for the offer/claim lifecycle using "approach A":
-- a seat is reserved during a claim window by a PENDING registration order
-- (the same machinery acceptWaitlistInvite already uses at accept-time, just
-- created when the offer is EXTENDED). No capacity-trigger changes — the pending
-- enrollment under that order reserves the seat via the existing triggers.
--
-- Auto-promotion is narrowly scoped (per 2026-06-10 clarification): the engine
-- only fires for a seat freed by a CART-HOLD lapsing mid-registration. Seats
-- freed by refund/cancellation or an admin capacity bump are routed to MANUAL
-- assignment via `needs_manual_assignment` — never auto-offered.
--
-- Reuses the existing `invitation_sent_at` / `invitation_expires_at` columns as
-- the offer window (no duplicate offer-time columns).
--
-- Append-only / additive. Timestamp later than the newest on disk (20260611000000).

-- 1. Offer/claim + manual-fallback columns -----------------------------------
ALTER TABLE public.waitlist_entries
  -- The PENDING registration_orders row reserving the seat during an active
  -- offer (approach A). Same order is confirmed on claim; its enrollment is
  -- cancelled (seat freed) if the offer expires. SET NULL if the order is purged.
  ADD COLUMN IF NOT EXISTS reserved_batch_id uuid
    REFERENCES public.registration_orders(id) ON DELETE SET NULL,

  -- Routed to manual admin assignment (refund-/capacity-freed seat, brand-new
  -- prospect the engine can't self-serve, or ambiguous/unrecoverable contention).
  ADD COLUMN IF NOT EXISTS needs_manual_assignment boolean NOT NULL DEFAULT false,

  -- Why it's in the manual queue — drives admin-UI grouping + the logs feed.
  ADD COLUMN IF NOT EXISTS manual_assignment_reason text
    CHECK (manual_assignment_reason IS NULL OR manual_assignment_reason IN (
      'refund_freed',         -- a paid enrollment was refunded/cancelled
      'capacity_freed',       -- an admin raised capacity
      'new_prospect',         -- no dancer row yet; engine can't auto-enroll
      'ambiguous_contention', -- couldn't determine first / unsafe to auto-resolve
      'engine_error'          -- the auto path errored and could not self-remediate
    )),

  -- How many times this entry has been offered then lapsed — loop-safety for the
  -- roll-to-next engine and a fairness/metrics signal.
  ADD COLUMN IF NOT EXISTS offer_attempts integer NOT NULL DEFAULT 0;

-- 2. Add the 'offered' status (auto-offer with a reserved seat). Distinct from
--    'invited' (manual admin link, historically no reservation). Drop/re-add the
--    CHECK — it cannot be extended in place (constraint name verified against
--    20260530000000_waitlist_manual_model.sql).
ALTER TABLE public.waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_status_check;
ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT waitlist_entries_status_check
  CHECK (status = ANY (ARRAY[
    'waiting'::text,
    'offered'::text,     -- NEW: engine extended an auto-offer; seat reserved
    'invited'::text,
    'accepted'::text,
    'registered'::text,
    'declined'::text,
    'expired'::text,
    'cancelled'::text
  ]));

-- 3. Indexes for the manual-assign surface + the engine's "next in line" scan.
CREATE INDEX IF NOT EXISTS idx_waitlist_needs_manual
  ON public.waitlist_entries (class_id) WHERE needs_manual_assignment = true;
CREATE INDEX IF NOT EXISTS idx_waitlist_offered
  ON public.waitlist_entries (class_id, invitation_expires_at) WHERE status = 'offered';

COMMENT ON COLUMN public.waitlist_entries.reserved_batch_id IS
  'Approach A: the pending registration_orders row reserving the seat during an '
  'active offer. Confirmed on claim; its enrollment is cancelled if the offer lapses.';
COMMENT ON COLUMN public.waitlist_entries.needs_manual_assignment IS
  'Routed to admin manual assignment (refund/capacity-freed seat, new prospect, or '
  'ambiguous contention). Auto-promotion never sets a seat here without a reason.';
