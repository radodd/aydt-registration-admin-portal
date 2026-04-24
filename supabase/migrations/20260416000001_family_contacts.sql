-- family_contacts
-- Stores additional household contacts: emergency contacts, alternate parents,
-- and caregivers (including authorized-pickup persons) for a family.
-- One record per contact; multiple contacts per family are supported.

CREATE TABLE IF NOT EXISTS public.family_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  type                text NOT NULL CHECK (type IN ('emergency_contact', 'alternate_parent', 'caregiver')),
  first_name          text,
  last_name           text,
  phone               text,
  email               text,
  relationship        text,           -- e.g. "Grandmother", "Nanny", "Father"
  is_authorized_pickup boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_contacts_family_id_idx ON public.family_contacts(family_id);
CREATE INDEX IF NOT EXISTS family_contacts_type_idx      ON public.family_contacts(type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'family_contacts_updated_at'
  ) THEN
    CREATE TRIGGER family_contacts_updated_at
    BEFORE UPDATE ON public.family_contacts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE public.family_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_contacts_admin_all'
    AND tablename = 'family_contacts'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_contacts_admin_all ON public.family_contacts
      TO authenticated
      USING (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_contacts_parent_family'
    AND tablename = 'family_contacts'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_contacts_parent_family ON public.family_contacts
      TO authenticated
      USING (family_id = (
        SELECT users.family_id FROM public.users WHERE users.id = auth.uid()
      ))
      WITH CHECK (family_id = (
        SELECT users.family_id FROM public.users WHERE users.id = auth.uid()
      ));
  END IF;
END $$;
