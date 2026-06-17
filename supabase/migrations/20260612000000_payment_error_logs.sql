-- Payment Error Logging — Phase 1: the durable error store.
-- See docs/PAYMENT_ERROR_LOGGING_PLAN.md for the full design.
--
-- One row per FAILED payment attempt (gateway or application origin). This is the
-- HISTORY layer: it complements the row-level "latest failure" columns already on
-- order_payment_installments (last_charge_error, charge_attempt_count) by keeping
-- every attempt as its own auditable record, chained via retry_of.
--
-- Two foundational axes (see plan §2):
--   origin     — gateway (came from EPG/Elavon) vs application (internal, never
--                touched EPG; Elavon's dashboard cannot see these).
--   owner_lane — admin (card/family issue, admin can act) vs dev (integration/app
--                issue, needs the developer).
--
-- Writers: trusted server/edge contexts ONLY, via the single logPaymentError()
-- helper using the service-role client. Admins read + resolve through RLS.

/* ========================================================================== */
/* 1. payment_error_logs table                                                */
/* ========================================================================== */

CREATE TABLE IF NOT EXISTS public.payment_error_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- Classification (plan §2 + §3) ------------------------------------------
  origin             text NOT NULL CHECK (origin IN ('gateway', 'application')),
  source             text NOT NULL CHECK (source IN (
                       'cron', 'webhook', 'manual_admin', 'hpp_checkout', 'app_internal')),
  category           text NOT NULL CHECK (category IN (
                       'decline', 'insufficient_funds', 'card_expired', 'token_expired',
                       'avs_cvv', 'network', 'api_error', '3ds_mit', 'idempotency',
                       'validation', 'bad_state', 'db_error', 'unknown')),
  owner_lane         text NOT NULL CHECK (owner_lane IN ('admin', 'dev')),
  severity           text NOT NULL DEFAULT 'warning' CHECK (severity IN (
                       'info', 'warning', 'critical')),

  -- Linkage — who/what this is about. All nullable: an application-origin error
  -- (e.g. a missing-pricing failure) may have no order/installment yet. ON DELETE
  -- SET NULL so purging a parent never destroys the audit record.
  order_id           uuid REFERENCES public.registration_orders(id) ON DELETE SET NULL,
  installment_id     uuid REFERENCES public.order_payment_installments(id) ON DELETE SET NULL,
  installment_number int,
  family_id          uuid REFERENCES public.families(id) ON DELETE SET NULL,
  dancer_id          uuid REFERENCES public.dancers(id) ON DELETE SET NULL,

  -- Gateway identifiers (null for application-origin errors) ----------------
  transaction_id     text,
  payment_session_id text,

  -- Raw detail — for the dev lane to debug. raw_payload holds the full EPG
  -- response, or the application error context/stack.
  error_code         text,
  error_message      text,
  http_status        int,
  raw_payload        jsonb,

  -- Retry chain (plan §5). Each retry is a NEW row pointing at the prior attempt;
  -- the original is never mutated. is_retryable is set by the classifier
  -- (transient → true, terminal/hard-decline → false).
  retry_of           uuid REFERENCES public.payment_error_logs(id) ON DELETE SET NULL,
  retry_count        int NOT NULL DEFAULT 0,
  is_retryable       boolean NOT NULL DEFAULT false,

  -- Resolution workflow -----------------------------------------------------
  status             text NOT NULL DEFAULT 'new' CHECK (status IN (
                       'new', 'acknowledged', 'actioned', 'resolved', 'wont_fix')),
  resolved_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  resolution_notes   text
);

CREATE INDEX IF NOT EXISTS idx_payment_error_logs_status      ON public.payment_error_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_error_logs_created     ON public.payment_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_error_logs_lane        ON public.payment_error_logs (owner_lane, status);
CREATE INDEX IF NOT EXISTS idx_payment_error_logs_origin      ON public.payment_error_logs (origin);
CREATE INDEX IF NOT EXISTS idx_payment_error_logs_order       ON public.payment_error_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_error_logs_installment ON public.payment_error_logs (installment_id);
CREATE INDEX IF NOT EXISTS idx_payment_error_logs_family      ON public.payment_error_logs (family_id);

COMMENT ON TABLE public.payment_error_logs IS
  'Durable per-attempt log of payment failures (gateway + application origin). '
  'History layer complementing order_payment_installments.last_charge_error. '
  'See docs/PAYMENT_ERROR_LOGGING_PLAN.md.';

/* ========================================================================== */
/* 2. RLS — admins read + resolve; service role writes; nobody else sees it.  */
/*    Mirrors the family_account_credits policy shape (is_admin_or_super +     */
/*    a service_role bypass for trusted server/edge writers).                 */
/* ========================================================================== */

ALTER TABLE public.payment_error_logs ENABLE ROW LEVEL SECURITY;

-- 1. Admins / super-admins: full read + write (the admin Error Log UI reads here
--    and writes resolution fields).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'payment_error_logs_admin_all'
      AND tablename = 'payment_error_logs'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY payment_error_logs_admin_all ON public.payment_error_logs
      TO authenticated
      USING (public.is_admin_or_super())
      WITH CHECK (public.is_admin_or_super());
  END IF;
END $$;

-- 2. Service role: trusted server/edge writes (the cron, the webhook handler, and
--    logPaymentError run here and bypass the admin check).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'payment_error_logs_service_role'
      AND tablename = 'payment_error_logs'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY payment_error_logs_service_role ON public.payment_error_logs
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
