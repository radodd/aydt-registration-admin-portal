"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RegistrationProvider, useRegistration } from "@/app/providers/RegistrationProvider";
import { CartProvider } from "@/app/providers/CartProvider";
import { useCart } from "@/app/providers/CartProvider";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function PreviewPaymentContent({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { state, reset } = useRegistration();
  const { items, total, clearCart } = useCart();
  const [processing, setProcessing] = useState(false);

  async function handleSimulate() {
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1000));
    clearCart();
    reset();
    router.push(`/register/confirmation?preview=1`);
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
        Preview mode — payment is simulated. No charge will occur.
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          [Preview] Review & Pay
        </h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm mb-2">
            <span className="text-gray-700">{item.sessionName}</span>
            <span className="font-semibold">{formatCurrency(item.subtotal)}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between font-bold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSimulate}
        disabled={processing}
        className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-60"
      >
        {processing ? "Processing…" : "Simulate Payment Success"}
      </button>
    </div>
  );
}

export default function PreviewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <CartProvider semesterId={id} preview>
        <RegistrationProvider semesterId={id} preview>
          <PreviewPaymentContent semesterId={id} />
        </RegistrationProvider>
      </CartProvider>
    </div>
  );
}
