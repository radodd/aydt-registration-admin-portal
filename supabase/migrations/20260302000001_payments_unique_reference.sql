-- Add UNIQUE constraint on payments.custom_reference.
--
-- Required for the EPG payment flow's upsert idempotency guard:
--   supabase.from("payments").upsert(..., { onConflict: "custom_reference" })
--
-- Without this constraint the upsert falls back to a plain INSERT, creating
-- duplicate payment rows every time a user retries the payment page.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_custom_reference_key'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_custom_reference_key UNIQUE (custom_reference);
  END IF;
END $$;
