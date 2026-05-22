-- ──────────────────────────────────────────────────────────────────────────────
-- Normalize legacy admin installment batches: payment_plan_type "monthly" → "installments"
-- ──────────────────────────────────────────────────────────────────────────────
-- Background: registration_batches.payment_plan_type is free text (no CHECK
-- constraint). Historically the admin registration flow wrote the UI vocabulary
-- value "monthly" for installment plans, while the public flow + EPG session/webhook
-- use the canonical "installments". This split the same concept across two strings,
-- which distorted Reports grouping/filtering by payment plan type.
--
-- The admin flow now writes "installments" directly (createAdminRegistration.ts).
-- This migration backfills existing rows so there is ONE canonical installment value.
--
-- Safe: admin batches are synchronous (confirmed at creation) and never pass through
-- createEPGPaymentSession or the EPG webhook — the only readers that gate on the
-- literal "installments" to set doCapture:false / store a card. No behavior change,
-- pure reporting/data normalization.
-- ──────────────────────────────────────────────────────────────────────────────

UPDATE public.registration_batches
SET payment_plan_type = 'installments'
WHERE payment_plan_type = 'monthly';
