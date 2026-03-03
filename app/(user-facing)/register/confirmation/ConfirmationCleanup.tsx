"use client";

import { useEffect } from "react";

/**
 * Clears the cart and registration state from localStorage when the user
 * lands on the confirmation page after returning from the Converge HPP.
 * Runs once on mount; no-ops in preview mode (cart was never persisted).
 */
export function ConfirmationCleanup({
  semesterId,
  isPreview,
}: {
  semesterId: string;
  isPreview: boolean;
}) {
  useEffect(() => {
    if (isPreview || !semesterId) return;
    try {
      localStorage.removeItem(`aydt_cart_${semesterId}`);
      localStorage.removeItem(`aydt_registration_${semesterId}`);
      sessionStorage.removeItem(`aydt_payment_batch_${semesterId}`);
    } catch {
      // localStorage unavailable — no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
