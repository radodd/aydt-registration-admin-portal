"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCart } from "@/app/providers/CartProvider";
import { useSemesterData } from "@/app/providers/SemesterDataProvider";
import { CartExpiryTimer } from "./CartExpiryTimer";

export function CartDrawer() {
  const { sessionIds, remove, itemCount, isExpired, preview } = useCart();

  const { semester } = useSemesterData();
  const [open, setOpen] = useState(false);

  // Map sessionId → session object
  const sessionMap = useMemo(() => {
    const map = new Map();
    for (const s of semester.sessions) {
      map.set(s.id, s);
    }
    return map;
  }, [semester.sessions]);

  const cartSessions = sessionIds
    .map((id) => sessionMap.get(id))
    .filter(Boolean);

  if (itemCount === 0) return null;

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-lg hover:bg-indigo-700 transition-colors font-semibold"
        >
          Cart ({itemCount})
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/30" />

          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Your Cart</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Expiry */}
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
              <CartExpiryTimer />
            </div>

            {isExpired && (
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <p className="text-sm text-red-700 font-medium">
                  Your cart has expired. Please add items again.
                </p>
              </div>
            )}

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cartSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {session.name}
                      </p>

                      {/* Date + Time */}
                      <p className="text-xs text-gray-500 mt-1">
                        {session.availableDays?.[0]?.dayOfWeek}{" "}
                        {session.availableDays?.[0]?.date}
                        {session.startTime &&
                          ` • ${session.startTime}–${session.endTime}`}
                      </p>
                    </div>

                    <button
                      onClick={() => remove(session.id)}
                      className="text-gray-300 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-200 space-y-3">
              <Link
                href={preview ? `/preview/semester/${semester.id}/cart` : "/cart"}
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
