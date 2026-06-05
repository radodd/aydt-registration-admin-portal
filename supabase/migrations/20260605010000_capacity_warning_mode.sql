-- Availability warning threshold: support both an absolute "spots remaining"
-- count AND a "percent full" trigger. ACTIVE Works expresses this as a percentage
-- (e.g. warn at 90% capacity), which the existing integer-spots field could not
-- represent. `capacity_warning_threshold` keeps its meaning; this column selects
-- how to interpret it.
--
-- 'count'   → warn when (capacity − enrolled) ≤ threshold        (spots remaining)
-- 'percent' → warn when enrolled / capacity ≥ threshold / 100    (% full)

ALTER TABLE public.semesters
  ADD COLUMN IF NOT EXISTS capacity_warning_mode text NOT NULL DEFAULT 'count'
  CHECK (capacity_warning_mode IN ('count', 'percent'));
