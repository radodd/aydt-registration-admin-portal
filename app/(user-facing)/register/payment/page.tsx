"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RegistrationProvider, useRegistration } from "@/app/providers/RegistrationProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { useCart } from "@/app/providers/CartProvider";
import { createRegistrations } from "../actions/createRegistrations";

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
  const { items, total, clearCart } = useCart();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: if registration was already completed (batchId set but user
  // navigated back), redirect to confirmation rather than allowing re-submit.
  useEffect(() => {
    console.log("[Payment] Mount — state.batchId:", state.batchId, "cartItems:", items.length, "participants:", state.participants.length);
    if (state.batchId && !processing) {
      console.log("[Payment] batchId already set — redirecting to confirmation.");
      router.replace(`/register/confirmation?semester=${semesterId}`);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    setProcessing(true);
    setError(null);

    // Pre-flight: all participants must be assigned
    const fullyAssigned = state.participants.filter((p) => p.dancerId);
    console.log("[Payment] handleConfirm — cartItems:", items.length, "participants:", state.participants.length, "fullyAssigned:", fullyAssigned.length);

    if (items.length === 0) {
      console.warn("[Payment] Pre-flight failed: cart is empty.");
      setError("Your cart is empty. Please go back and add sessions.");
      setProcessing(false);
      return;
    }
    if (fullyAssigned.length === 0) {
      console.warn("[Payment] Pre-flight failed: no assigned participants.");
      setError("Please assign a dancer to each session before continuing.");
      setProcessing(false);
      return;
    }

    if (state.isPreview) {
      console.log("[Payment] Preview mode — simulating.");
      await new Promise((r) => setTimeout(r, 800));
      clearCart();
      reset();
      router.push(`/register/confirmation?preview=1`);
      return;
    }

    // Generate a batchId once and store it in RegistrationProvider so that
    // any retry (network error, double-click) reuses the same key.
    const batchId = crypto.randomUUID();
    console.log("[Payment] Calling createRegistrations — batchId:", batchId, "semesterId:", semesterId);
    setPaymentIntent("", batchId); // intentId is empty until Converge is wired

    const result = await createRegistrations({
      semesterId,
      participants: fullyAssigned.map((p) => ({
        sessionId: p.sessionId,
        dancerId: p.dancerId!,
      })),
      batchId,
    });

    console.log("[Payment] createRegistrations result:", result);

    if (!result.success) {
      console.error("[Payment] createRegistrations failed:", result.error);
      setError(result.error ?? "Registration failed. Please try again.");
      setProcessing(false);
      return;
    }

    // Success: clear client state and navigate to confirmation
    console.log("[Payment] Success — clearing cart and resetting registration state.");
    clearCart();
    reset();
    router.push(`/register/confirmation?semester=${semesterId}`);
  }

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

      {/* Preview mode banner */}
      {state.isPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
          Preview mode — no registration will be saved.
        </div>
      )}

      {/* Cart summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <p className="font-medium text-gray-800">{item.sessionName}</p>
                {item.selectedDays.length > 0 ? (
                  <p className="text-gray-400 text-xs mt-0.5">
                    {item.selectedDays.length} day
                    {item.selectedDays.length !== 1 ? "s" : ""}
                  </p>
                ) : item.selectedDayIds.length > 0 ? (
                  <p className="text-gray-400 text-xs mt-0.5">
                    {item.selectedDayIds.length} day
                    {item.selectedDayIds.length !== 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
              <span className="font-semibold text-gray-900">
                {formatCurrency(item.subtotal)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between font-bold text-gray-900">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

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
            Payment will be processed via Converge. Integration coming soon.
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
      <RegistrationProvider semesterId={semesterId}>
        <PaymentContent semesterId={semesterId} />
      </RegistrationProvider>
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
