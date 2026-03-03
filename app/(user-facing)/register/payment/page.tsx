"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  RegistrationProvider,
  useRegistration,
} from "@/app/providers/RegistrationProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { useCart } from "@/app/providers/CartProvider";
import { createRegistrations } from "../actions/createRegistrations";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { createEPGPaymentSession } from "@/app/actions/createEPGPaymentSession";
import type { PricingQuote } from "@/types";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/* -------------------------------------------------------------------------- */
/* Payment content                                                             */
/* -------------------------------------------------------------------------- */

function PaymentContent({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { state, setPaymentIntent, reset } = useRegistration();
  const { items, clearCart } = useCart();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Stable batchId: same cart + retry = same ID, so createRegistrations()
  // idempotency guard returns existing registrations without duplicate DB inserts.
  // If cart assignments change the fingerprint shifts, a new ID is generated,
  // and the stale batch is cleaned up by createRegistrations() on the next call.
  const [batchId] = useState<string>(() => {
    const fingerprint = state.participants
      .filter((p) => p.dancerId)
      .map((p) => `${p.dancerId}:${p.sessionId}`)
      .sort()
      .join("|");
    const key = `aydt_payment_batch_${semesterId}`;
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (stored?.fingerprint === fingerprint && stored?.batchId) {
        return stored.batchId as string;
      }
    } catch {}
    const id = crypto.randomUUID();
    try {
      sessionStorage.setItem(key, JSON.stringify({ batchId: id, fingerprint }));
    } catch {}
    return id;
  });

  const { secondsRemaining, isExpired } = useCart();

  // Guard: if registration was already completed, redirect to confirmation.
  useEffect(() => {
    if (state.batchId && !processing) {
      router.replace(`/register/confirmation?semester=${semesterId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guard: if cart hold expires, redirect back to the semester page.
  useEffect(() => {
    if (isExpired && !processing && !state.batchId) {
      clearCart();
      router.replace(`/?semester=${semesterId}&expired=1`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  // Fetch pricing quote when participants are available
  useEffect(() => {
    const fullyAssigned = state.participants.filter((p) => p.dancerId);
    if (fullyAssigned.length === 0 || state.isPreview) return;

    // Group session IDs by dancer
    const enrollmentMap = new Map<
      string,
      { dancerName?: string; sessionIds: string[] }
    >();
    for (const p of fullyAssigned) {
      if (!p.dancerId) continue;
      if (!enrollmentMap.has(p.dancerId)) {
        enrollmentMap.set(p.dancerId, { sessionIds: [] });
      }
      enrollmentMap.get(p.dancerId)!.sessionIds.push(p.sessionId);
    }

    // Include new-dancer name overrides
    for (const p of state.participants) {
      if (!p.dancerId || !p.newDancer) continue;
      const entry = enrollmentMap.get(p.dancerId);
      if (entry && !entry.dancerName) {
        entry.dancerName = `${p.newDancer.firstName} ${p.newDancer.lastName}`;
      }
    }

    const enrollments = Array.from(enrollmentMap.entries()).map(
      ([dancerId, { dancerName, sessionIds }]) => ({
        dancerId,
        dancerName,
        sessionIds,
      }),
    );

    setQuoteLoading(true);
    setQuoteError(null);

    computePricingQuote({
      semesterId,
      enrollments,
      paymentPlanType: "pay_in_full",
    })
      .then(setQuote)
      .catch((err) => {
        setQuoteError(
          err instanceof Error ? err.message : "Could not load pricing.",
        );
      })
      .finally(() => setQuoteLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.participants, semesterId]);

  async function handleConfirm() {
    setProcessing(true);
    setError(null);

    const fullyAssigned = state.participants.filter((p) => p.dancerId);

    if (items.length === 0) {
      setError("Your cart is empty. Please go back and add sessions.");
      setProcessing(false);
      return;
    }
    if (fullyAssigned.length === 0) {
      setError("Please assign a dancer to each session before continuing.");
      setProcessing(false);
      return;
    }

    if (state.isPreview) {
      await new Promise((r) => setTimeout(r, 800));
      clearCart();
      reset();
      router.push(`/register/confirmation?preview=1`);
      return;
    }

    setPaymentIntent("", batchId);

    const result = await createRegistrations({
      semesterId,
      participants: fullyAssigned.map((p) => ({
        sessionId: p.sessionId,
        dancerId: p.dancerId!,
        newDancer: p.newDancer,
        selectedDayIds: p.selectedDayIds,
      })),
      batchId,
      pricingQuote: quote ?? undefined,
    });

    if (!result.success) {
      if (result.priceChanged && result.newQuote) {
        setQuote(result.newQuote);
        setError(
          "Pricing was updated. Please review the new total and confirm again.",
        );
      } else {
        setError(result.error ?? "Registration failed. Please try again.");
      }
      setProcessing(false);
      return;
    }

    if (state.isPreview) {
      // Preview path already returned above — this branch should not be reached
      setProcessing(false);
      return;
    }

    // Registration batch created (pending_payment). Now redirect to EPG HPP.
    const paymentResult = await createEPGPaymentSession({
      batchId: result.batchId ?? batchId,
      amountDueNow: quote?.amountDueNow ?? quote?.grandTotal ?? 0,
      semesterId,
      semesterName: "Registration",
    });

    if (paymentResult.error || !paymentResult.paymentSessionUrl) {
      setError(
        paymentResult.error ?? "Could not initiate payment. Please try again.",
      );
      setProcessing(false);
      return;
    }

    // Redirect to EPG HPP — cart/state cleared on confirmation page return
    window.location.href = paymentResult.paymentSessionUrl;
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                   */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Review & Confirm
        </h1>
        <p className="text-gray-500 text-sm">
          Confirm your registration details below.
        </p>
      </div>

      {/* Cart hold countdown — warn when < 5 minutes remain */}
      {!state.isPreview && secondsRemaining > 0 && secondsRemaining < 300 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
          Your cart reservation expires in {Math.floor(secondsRemaining / 60)}:
          {String(secondsRemaining % 60).padStart(2, "0")}. Complete your
          registration before the hold is released.
        </div>
      )}

      {/* Preview mode banner */}
      {state.isPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
          Preview mode — no registration will be saved.
        </div>
      )}

      {/* Pricing breakdown (Phase 2) */}
      {!state.isPreview && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Pricing Breakdown</h2>

          {quoteLoading && (
            <p className="text-sm text-gray-400">Calculating pricing…</p>
          )}

          {quoteError && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Pricing unavailable</p>
              <p className="mt-1 text-xs">{quoteError}</p>
              <p className="mt-1 text-xs">
                The admin may need to configure tuition rate bands for this
                semester.
              </p>
            </div>
          )}

          {quote && !quoteLoading && (
            <div className="space-y-4">
              {/* Per-dancer breakdowns */}
              {quote.perDancer.map((dancer) => (
                <div
                  key={dancer.dancerId}
                  className="border border-gray-100 rounded-xl p-4 space-y-2"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {dancer.dancerName}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">
                    {dancer.division.replace("_", " ")} ·{" "}
                    {dancer.weeklyClassCount} class
                    {dancer.weeklyClassCount !== 1 ? "es" : ""}/week
                  </p>
                  <div className="space-y-1">
                    {dancer.lineItems.map((li, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-sm text-gray-700"
                      >
                        <span>{li.label}</span>
                        <span className={li.amount < 0 ? "text-green-600" : ""}>
                          {formatCurrency(li.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Family-level adjustments */}
              {(quote.familyDiscountAmount > 0 ||
                quote.autoPayAdminFeeTotal > 0) && (
                <div className="space-y-1 px-1">
                  {quote.familyDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-700 font-medium">
                      <span>Family Discount</span>
                      <span>−{formatCurrency(quote.familyDiscountAmount)}</span>
                    </div>
                  )}
                  {quote.autoPayAdminFeeTotal > 0 && (
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>Auto-pay Admin Fee</span>
                      <span>{formatCurrency(quote.autoPayAdminFeeTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Grand total */}
              <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(quote.grandTotal)}</span>
              </div>

              {/* Amount due now */}
              {quote.amountDueNow !== quote.grandTotal && (
                <div className="flex justify-between text-sm text-indigo-700 font-medium">
                  <span>Due today</span>
                  <span>{formatCurrency(quote.amountDueNow)}</span>
                </div>
              )}

              {/* Payment schedule (if multi-installment) */}
              {quote.paymentSchedule.length > 1 && (
                <div className="rounded-xl bg-gray-50 p-4 space-y-2">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Payment Schedule
                  </p>
                  {quote.paymentSchedule.map((inst) => (
                    <div
                      key={inst.installmentNumber}
                      className="flex justify-between text-sm text-gray-700"
                    >
                      <span>
                        Payment {inst.installmentNumber} —{" "}
                        {new Date(
                          inst.dueDate + "T00:00:00",
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span>{formatCurrency(inst.amountDue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cart items (simple summary for reference) */}
      {(state.isPreview || !quote) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Sessions</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <p className="font-medium text-gray-800">{item.sessionName}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participant summary */}
      {state.participants.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Participants</h2>
          <div className="space-y-2">
            {state.participants.map((p) => {
              const item = items.find((i) => i.sessionId === p.sessionId);
              return (
                <div
                  key={p.sessionId}
                  className="flex justify-between text-sm text-gray-700"
                >
                  <span>{item?.sessionName ?? p.sessionId}</span>
                  <span className="text-gray-400">
                    {p.newDancer
                      ? `${p.newDancer.firstName} ${p.newDancer.lastName}`
                      : p.dancerId
                        ? "Existing dancer"
                        : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment section */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Payment</h2>
        {state.isPreview ? (
          <p className="text-sm text-gray-500">
            In preview mode, payment is simulated. Click confirm to see the
            success screen.
          </p>
        ) : (
          <p className="text-sm text-gray-400">
            You will be redirected to a secure Elavon payment page to complete
            your payment.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={processing}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing}
          className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-60"
        >
          {processing
            ? "Processing…"
            : state.isPreview
              ? "Simulate Registration"
              : "Confirm Registration"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function PaymentPageInner() {
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";

  return (
    <CartRestoreGuard semesterId={semesterId}>
      {/* <RegistrationProvider semesterId={semesterId}> */}
      <PaymentContent semesterId={semesterId} />
      {/* </RegistrationProvider> */}
    </CartRestoreGuard>
  );
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentPageInner />
    </Suspense>
  );
}
