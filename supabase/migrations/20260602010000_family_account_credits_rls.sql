-- family_account_credits — Row Level Security
--
-- Until now this money-bearing table had RLS disabled while being read directly
-- from the browser. These policies lock it down to three identities:
--
--   1. admin_all       — admins/super-admins: full read + write on every credit
--                        (issue, bulk-issue, admin-checkout grant + mark-used,
--                        and all admin display reads).
--   2. parent_select   — a parent may READ ONLY their own family's credits (their
--                        balance on the public payment page + the server-side
--                        verify-before-spend). Deliberately SELECT-only: if
--                        parents could UPDATE, they could null out
--                        `used_in_batch_id` to re-spend a consumed credit, or
--                        inflate `amount`.
--   3. service_role    — trusted server/edge contexts (bypasses the above).
--
-- ⚠️ Paired code requirement: because parents have NO update permission, the
-- public checkout's "mark credit used" write must run via the service-role
-- client (createAdminClient), not the user-scoped server client — otherwise the
-- redemption UPDATE is silently denied and a credit could be applied to
-- unlimited orders. See app/(user-facing)/register/actions/createRegistrations.ts.

ALTER TABLE public.family_account_credits ENABLE ROW LEVEL SECURITY;

-- 1. Admins: full read/write on every credit.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_account_credits_admin_all'
      AND tablename = 'family_account_credits'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_account_credits_admin_all ON public.family_account_credits
      TO authenticated
      USING (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

-- 2. Parents: read ONLY their own family's credits. No write.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_account_credits_parent_select'
      AND tablename = 'family_account_credits'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_account_credits_parent_select ON public.family_account_credits
      FOR SELECT
      TO authenticated
      USING (
        family_id = (
          SELECT users.family_id FROM public.users WHERE users.id = auth.uid()
        )
      );
  END IF;
END $$;

-- 3. Service role: trusted server/edge writes (bypasses the policies above).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'family_account_credits_service_role'
      AND tablename = 'family_account_credits'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY family_account_credits_service_role ON public.family_account_credits
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
