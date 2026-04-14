-- Add secondary_email and school fields to dancers
-- secondary_email: for older students (juniors/seniors, grade 11-12) who want
--                  notifications separate from their parents
-- school: the dancer's regular school or PS number

ALTER TABLE public.dancers
  ADD COLUMN IF NOT EXISTS secondary_email text,
  ADD COLUMN IF NOT EXISTS school text;
