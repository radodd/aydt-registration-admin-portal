-- Add instructor_name column to email_recipient_selections to support
-- the "instructor" selection type, which targets all families enrolled
-- in any class taught by a specific instructor.

ALTER TABLE email_recipient_selections
  ADD COLUMN IF NOT EXISTS instructor_name TEXT;
