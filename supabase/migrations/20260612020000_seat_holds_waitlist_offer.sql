-- Meeting-plan (2026-06-10): ZERO-TOUCH auto-promotion — Stage B reservation.
--
-- When the engine offers a freed seat to the front of the queue, it reserves the
-- seat for the duration of the claim window with a `waitlist_offer` placeholder
-- hold — an ACTIVE (non-expired) hold whose expires_at = the offer deadline.
-- This is the same placeholder primitive as 'admin_reserved' (added in
-- 20260612010000) but with two behavioral differences:
--   • it EXPIRES at the offer deadline (admin_reserved is far-future), so an
--     unclaimed offer naturally stops occupying the seat; and
--   • the engine OWNS its lifecycle — it rolls the offer to the next person (new
--     waitlist_offer hold) or reopens the seat to the public (released_at) when
--     the queue empties.
--
-- The claim path (acceptWaitlistInvite) releases this placeholder before it mints
-- the real enrollment, exactly like registerWaitlistEntryInPortal does for
-- admin_reserved. Distinguishing offers from refund-holds by hold_type keeps the
-- engine from ever touching an admin's manually-held refund seat.
--
-- Additive: only widens the hold_type CHECK. Timestamp later than the newest on
-- remote (20260612010000).

ALTER TABLE public.seat_holds
  DROP CONSTRAINT IF EXISTS seat_holds_hold_type_check;
ALTER TABLE public.seat_holds
  ADD CONSTRAINT seat_holds_hold_type_check
  CHECK (hold_type IN ('cart', 'admin_reserved', 'waitlist_offer'));

CREATE INDEX IF NOT EXISTS idx_seat_holds_waitlist_offer
  ON public.seat_holds (section_id, meeting_id)
  WHERE hold_type = 'waitlist_offer' AND released_at IS NULL;
