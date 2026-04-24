-- Second phone number for parent/guardian
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number_alt TEXT;

-- Toggle: copy alternate parent on notifications
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cc_alternate_parent BOOLEAN NOT NULL DEFAULT FALSE;

-- How did you hear about us? (set once on first registration)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_source TEXT;
