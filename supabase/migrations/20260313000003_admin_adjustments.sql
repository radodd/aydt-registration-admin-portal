-- Migration: admin_adjustments column on registration_batches
-- Stores admin-applied deduction line items (proration credits, scholarships, etc.)
-- so they can be displayed on email receipts and audited later.

ALTER TABLE public.registration_batches
  ADD COLUMN IF NOT EXISTS admin_adjustments JSONB NULL DEFAULT NULL;

COMMENT ON COLUMN public.registration_batches.admin_adjustments IS
  'Array of admin-applied deductions: [{type: "tuition_adjustment"|"credit", label: string, amount: number}]. NULL = none applied.';
