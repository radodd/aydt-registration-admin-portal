-- Migration: Formalise users.status values and introduce 'invited'
--
-- 'invited'  — instructor invited via admin portal, email sent, password not yet set
-- 'active'   — account fully set up and usable
-- 'inactive' — manually deactivated by an admin

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_status_check,
  ADD CONSTRAINT users_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'invited'::text]));
