-- ──────────────────────────────────────────────────────────────────────────────
-- schedule_enrollments.class_tier_id (Phase 3a)
-- ──────────────────────────────────────────────────────────────────────────────
-- Records which class_tiers row a tiered enrollment selected at checkout. NULL
-- for non-tiered (standard) enrollments. ON DELETE SET NULL so removing a tier
-- doesn't cascade-delete enrollments; admins can reassign or refund manually.
--
-- Distinct from the existing `price_tier_id` column, which points at the
-- (per-schedule) `schedule_price_tiers` table — a different, older concept.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.schedule_enrollments
  ADD COLUMN class_tier_id uuid NULL REFERENCES public.class_tiers(id) ON DELETE SET NULL;

CREATE INDEX schedule_enrollments_class_tier_id_idx
  ON public.schedule_enrollments(class_tier_id);
