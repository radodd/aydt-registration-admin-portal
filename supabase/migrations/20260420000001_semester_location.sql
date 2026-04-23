-- Add location to semesters table.
-- Location is set at the semester level; all classes within a semester share it.
ALTER TABLE public.semesters
  ADD COLUMN IF NOT EXISTS location text;

COMMENT ON COLUMN public.semesters.location IS
  'Physical location for this semester (e.g. "Upper East Side", "Washington Heights"). Used to silo programs by campus.';
