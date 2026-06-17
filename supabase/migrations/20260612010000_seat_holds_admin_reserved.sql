-- Meeting-plan (2026-06-10 decision): manual-assignment of REFUND-freed seats.
--
-- When a refund frees a seat, the seat must NOT silently reopen to the public —
-- it is held for the admin (assign from the queue if one exists; otherwise the
-- admin may explicitly reopen it). The existing "admin-managed freed seat"
-- concept (seat_holds.released_at) is the right primitive, but a refund-freed
-- seat has no hold to mark — so we place a NEW system-owned placeholder hold on
-- the seat. That hold occupies the seat in the capacity count + the public
-- catalog (active_hold_counts) until an admin assigns or reopens it.
--
-- A system placeholder has no owning parent, so this migration:
--   1. makes seat_holds.user_id NULLABLE (system holds have no user), and
--   2. adds `hold_type` ('cart' default | 'admin_reserved').
--
-- SAFETY — why this is non-disruptive to the existing reserve-at-cart path:
--   • holdSeat() always sets user_id, so cart holds keep user_id NOT NULL in
--     practice; only system 'admin_reserved' rows use NULL.
--   • holdSeat()/convert_holds_to_enrollments filter `user_id = auth.uid()`, so
--     they never see or convert a NULL-user admin_reserved hold.
--   • The capacity triggers count holds by section/meeting + expires_at +
--     released_at (NOT by user), so an admin_reserved hold correctly blocks a
--     racing public reservation with no trigger change.
--   • cleanup_expired_seat_holds only reaps RELEASED holds, so an unreleased
--     admin_reserved placeholder persists until an admin acts.
--   • RLS owner policies (user_id = auth.uid()) make NULL-user rows invisible to
--     authenticated users; the engine writes via service role (bypasses RLS) and
--     the public reads availability via SECURITY DEFINER active_hold_counts.
--
-- Append-only / additive. Timestamp later than the newest applied migration on
-- remote (20260612000000_payment_error_logs, from concurrent work on this DB).

ALTER TABLE public.seat_holds
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.seat_holds
  ADD COLUMN IF NOT EXISTS hold_type text NOT NULL DEFAULT 'cart'
    CHECK (hold_type IN ('cart', 'admin_reserved'));

-- Fast lookup of the admin-reserved placeholders for the freed-seat admin surface.
CREATE INDEX IF NOT EXISTS idx_seat_holds_admin_reserved
  ON public.seat_holds (section_id, meeting_id)
  WHERE hold_type = 'admin_reserved' AND released_at IS NULL;

COMMENT ON COLUMN public.seat_holds.hold_type IS
  'cart = a parent reserve-at-cart hold (owner = user_id). admin_reserved = a '
  'system placeholder holding a refund-freed seat for the admin (user_id NULL) '
  'until they assign from the queue or reopen it to the public.';
