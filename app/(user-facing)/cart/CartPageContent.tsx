"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/providers/CartProvider";
import { CartExpiryTimer } from "@/app/components/public/CartExpiryTimer";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function CartPageContent() {
  const router = useRouter();
  const {
    items,
    subtotal,
    total,
    removeItem,
    clearCart,
    isExpired,
    semesterId,
  } = useCart();
  useEffect(() => {
    console.log(
      "[Cart Page] Mount — semesterId:",
      semesterId,
      "itemCount:",
      items.length,
      "isExpired:",
      isExpired,
    );
    console.log(
      "[Cart Page] Items:",
      items.map((i) => ({
        sessionId: i.sessionId,
        sessionName: i.sessionName,
        selectedDayIds: i.selectedDayIds,
        subtotal: i.subtotal,
        minAge: i.minAge,
        maxAge: i.maxAge,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Redirect on expiry
  useEffect(() => {
    if (isExpired) {
      console.warn(
        "[Cart Page] Cart expired — clearing and redirecting to /semester/" +
          semesterId,
      );
      clearCart();
      router.push(`/semester/${semesterId}`);
    }
  }, [isExpired, clearCart, router, semesterId]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Review Your Cart</h1>
        <CartExpiryTimer />
      </div>
      <p className="text-gray-500 text-sm mb-8">
        Review your selections before continuing to registration.
      </p>

      {/* Line items */}
      <div className="space-y-4 mb-8">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white border border-gray-200 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {item.sessionName}
                </h3>
                {item.selectedDayIds.length >= 0 && (
                  <p className="text-sm text-gray-500">
                    {item.selectedDayIds.length} day
                    {item.selectedDayIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
                {item.pricePerDay > 0 && item.selectedDayIds.length >= 0 && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {formatCurrency(item.pricePerDay)} ×{" "}
                    {item.selectedDayIds.length}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(item.subtotal)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.sessionId)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                href={`/semester/${item.semesterId}`}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                ← Edit days
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Order summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Discounts</span>
            <span className="text-green-600">Calculated at checkout</span>
          </div>
          <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-bold text-gray-900 text-base">
            <span>Estimated Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={`/semester/${semesterId}`}
          className="flex-1 text-center py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          ← Add more sessions
        </Link>
        <Link
          href={`/register?semester=${semesterId}`}
          className="flex-1 text-center py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-semibold"
        >
          Continue to Registration
        </Link>
      </div>
    </div>
  );
}
