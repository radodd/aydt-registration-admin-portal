-- Add grade-based enrollment criteria to classes
-- Classes can now restrict enrollment by age OR grade.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS min_grade integer,
  ADD COLUMN IF NOT EXISTS max_grade integer;
