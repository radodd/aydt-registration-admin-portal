"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/app/providers/CartProvider";
import { CartExpiryTimer } from "./CartExpiryTimer";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function CartDrawer() {
  const { items, total, itemCount, removeItem, isExpired, semesterId } =
    useCart();
  const [open, setOpen] = useState(false);

  if (itemCount === 0) return null;

  return (
    <>
      {/* Floating cart button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-lg hover:bg-indigo-700 transition-colors font-semibold"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Cart ({itemCount})
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/30" />

          {/* Drawer panel */}
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Your Cart</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Expiry timer */}
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
              <CartExpiryTimer />
            </div>

            {/* Expired notice */}
            {isExpired && (
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <p className="text-sm text-red-700 font-medium">
                  Your cart has expired. Please add items again.
                </p>
              </div>
            )}

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-gray-900 text-sm">
                      {item.sessionName}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeItem(item.sessionId)}
                      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  {item.selectedDayIds.length > 0 && (
                    <p className="text-xs text-gray-500 mb-1">
                      {item.selectedDayIds.length} day
                      {item.selectedDayIds.length !== 1 ? "s" : ""} ×{" "}
                      {formatCurrency(item.pricePerDay)}
                    </p>
                  )}

                  <p className="text-sm font-semibold text-gray-900">
                    {formatCurrency(item.subtotal)}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(total)}
                </span>
              </div>

              <Link
                href={`/cart`}
                onClick={() => setOpen(false)}
                className="block w-full text-center bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-sm"
              >
                Review Cart & Continue
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
