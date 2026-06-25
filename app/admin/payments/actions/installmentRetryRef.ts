/**
 * Shared customReference prefix for "Pay Now (new card)" single-installment
 * HPP charges (meeting-plan #47 Part B).
 *
 * Lives in its own plain module — NOT in createInstallmentHppSession.ts —
 * because that file is `"use server"`, which only permits async-function
 * exports. Both the server action and the webhook route import this constant.
 *
 * Reconciliation is keyed off `${INSTALLMENT_RETRY_PREFIX}{installmentId}`.
 */
export const INSTALLMENT_RETRY_PREFIX = "installment-retry-";
