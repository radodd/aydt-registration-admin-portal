-- dancer_student_priority
-- Allows a family to designate the dancer as the primary contact person
-- for their own account (rather than the parent). When true, the student's
-- email/phone (secondary_email + phone_number on the dancers row) should be
-- preferred for non-emergency communications.

ALTER TABLE public.dancers
  ADD COLUMN IF NOT EXISTS is_student_contact_priority boolean NOT NULL DEFAULT false;
