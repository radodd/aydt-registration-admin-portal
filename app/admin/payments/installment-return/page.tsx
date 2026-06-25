"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/**
 * Meeting-plan #47 Part B — HPP return landing for a "Pay Now (new card)"
 * installment charge.
 *
 * The hosted page redirects here after the charge. Reconciliation is performed
 * authoritatively by the EPG webhook (which fetches the transaction and marks
 * the installment paid via reconcileInstallmentHppCharge). This page simply
 * polls our own DB for the installment to flip to "paid" and reports the result.
 * If the webhook hasn't landed within the window we show a "processing" state
 * with an explicit do-NOT-recharge warning to avoid a double charge.
 */

const POLL_MS = 2000;
const MAX_POLLS = 10; // ~20s

export default function InstallmentReturnPage() {
  const router = useRouter();
  const params = useSearchParams();
  const installmentId = params.get("installment");

  const [status, setStatus] = useState<"confirming" | "paid" | "timeout" | "error">(
    installmentId ? "confirming" : "error",
  );

  useEffect(() => {
    if (!installmentId) return;
    const supabase = createClient();
    let polls = 0;
    let cancelled = false;

    async function poll() {
      polls += 1;
      const { data } = await supabase
        .from("order_payment_installments")
        .select("status")
        .eq("id", installmentId)
        .maybeSingle();

      if (cancelled) return;

      if (data?.status === "paid") {
        setStatus("paid");
        return;
      }
      if (polls >= MAX_POLLS) {
        setStatus("timeout");
        return;
      }
      setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [installmentId]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        {status === "confirming" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[var(--admin-sidebar-active)]" />
            <h1 className="text-lg font-semibold text-neutral-900">Confirming payment…</h1>
            <p className="mt-2 text-sm text-neutral-500">
              We&apos;re finalizing the charge with the payment processor. This usually takes a few seconds.
            </p>
          </>
        )}

        {status === "paid" && (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-mint/30 text-xl text-mint-text">
              ✓
            </div>
            <h1 className="text-lg font-semibold text-neutral-900">Payment received</h1>
            <p className="mt-2 text-sm text-neutral-500">
              The installment has been charged and marked paid.
            </p>
          </>
        )}

        {status === "timeout" && (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Payment is processing</h1>
            <p className="mt-2 text-sm text-neutral-500">
              The charge was submitted but hasn&apos;t finished reconciling yet. The row should
              clear shortly.
            </p>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Do <strong>not</strong> re-charge this installment. If it still shows overdue in a
              minute, check the Error Log or Elavon before retrying.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Missing installment</h1>
            <p className="mt-2 text-sm text-neutral-500">
              We couldn&apos;t determine which installment this charge was for.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => router.push("/admin/payments")}
          className="mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--admin-sidebar-active)" }}
        >
          Back to Payments
        </button>
      </div>
    </div>
  );
}
