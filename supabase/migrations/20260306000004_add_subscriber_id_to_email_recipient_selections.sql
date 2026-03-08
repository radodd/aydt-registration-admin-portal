-- Add subscriber_id to email_recipient_selections so external (one-off)
-- subscribers can be manually added as recipients for a specific email.

ALTER TABLE public.email_recipient_selections
  ADD COLUMN IF NOT EXISTS subscriber_id uuid
    REFERENCES public.email_subscribers(id) ON DELETE CASCADE;
