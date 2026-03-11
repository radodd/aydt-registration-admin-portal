"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/providers/CartProvider";
import { CartExpiryTimer } from "@/app/components/public/CartExpiryTimer";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import type { PublicSession } from "@/types/public";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function sessionPrice(session: PublicSession): number {
  if (session.pricingModel === "per_session") {
    return session.dropInPrice ?? 0;
  }
  const defaultTier =
    session.priceTiers?.find((t) => t.isDefault) ?? session.priceTiers?.[0];

  console.log("DEFAULT TIERS", defaultTier);
  return defaultTier?.amount ?? 0;
}

export function CartPageContent() {
  const router = useRouter();

  const {
    sessionIds,
    semesterId,
    remove,
    isExpired,
    clear,
    itemCount,
    hydrated,
    secondsRemaining,
    preview,
  } = useCart();

  // All sessions for the semester — fetched once on hydration.
  // Filtering to cart sessionIds happens in a useMemo so it reacts to
  // sessionIds changes (e.g. removing an item) without re-fetching.
  const [semesterSessions, setSemesterSessions] = useState<PublicSession[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------------------------------------------------------------- */
  /* Fetch semester data once (on hydration + semesterId)             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!hydrated) return;

    if (!semesterId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log("[CartPage] Fetching semester:", semesterId);

    getSemesterForDisplay(semesterId, preview ? "preview" : "live").then(
      (semester) => {
        console.log(
          "[CartPage] Semester fetched:",
          semester.sessions.length,
          "sessions",
        );
        setSemesterSessions(semester.sessions);
        setLoading(false);
      },
    );
  }, [hydrated, semesterId]);

  /* ---------------------------------------------------------------- */
  /* Derive cart sessions reactively (no extra fetch)                 */
  /* ---------------------------------------------------------------- */

  const enrichedSessions = useMemo(
    () => semesterSessions.filter((s) => sessionIds.includes(s.id)),
    [semesterSessions, sessionIds],
  );

  /* ---------------------------------------------------------------- */
  /* Expiry logic                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    console.log(
      `[CartPage] expiry check: isExpired=${isExpired} secondsRemaining=${secondsRemaining} hydrated=${hydrated} itemCount=${itemCount}`,
    );
    if (isExpired) {
      console.warn("[CartPage] Cart expired — clearing and redirecting");
      clear();
      router.push(
        preview ? `/preview/semester/${semesterId}` : `/semester/${semesterId}`,
      );
    }
  }, [
    isExpired,
    clear,
    router,
    semesterId,
    secondsRemaining,
    hydrated,
    itemCount,
  ]);

  const subtotal = enrichedSessions.reduce(
    (acc, s) => acc + sessionPrice(s),
    0,
  );

  /* ---------------------------------------------------------------- */
  /* UI guards                                                        */
  /* ---------------------------------------------------------------- */

  if (!hydrated) {
    return <div className="max-w-3xl mx-auto px-6 py-10">Loading cart…</div>;
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-4 animate-pulse">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-2xl h-28"
          />
        ))}
      </div>
    );
  }

  if (!loading && enrichedSessions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Your cart is empty
        </h1>
        <p className="text-gray-500 mb-8">
          Browse available semesters to add sessions.
        </p>
        <Link
          href="/"
          className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
        >
          Browse Semesters
        </Link>
      </div>
    );
  }

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
        {enrichedSessions.map((session) => {
          const price = sessionPrice(session);
          return (
            <div
              key={session.id}
              className="bg-white border border-gray-200 rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {session.name}
                  </h3>
                  {session.startTime && (
                    <p className="text-sm text-gray-500">
                      {session.startTime}–{session.endTime}
                      {session.location ? ` · ${session.location}` : ""}
                    </p>
                  )}
                  {session.pricingModel === "full_schedule" &&
                    session.priceTiers &&
                    session.priceTiers.length > 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Pricing at checkout
                      </p>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {price > 0 ? (
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(price)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">
                      Priced at checkout
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(session.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link
                  href={
                    preview
                      ? `/preview/semester/${semesterId}`
                      : `/semester/${semesterId}`
                  }
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  ← Add more sessions
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-2 text-sm">
          {subtotal > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Discounts</span>
            <span className="text-green-600">Calculated at checkout</span>
          </div>
          <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-bold text-gray-900 text-base">
            <span>Estimated Total</span>
            <span>
              {subtotal > 0
                ? formatCurrency(subtotal)
                : "Calculated at checkout"}
            </span>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={
            preview
              ? `/preview/semester/${semesterId}`
              : `/semester/${semesterId}`
          }
          className="flex-1 text-center py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          ← Add more sessions
        </Link>
        <Link
          href={
            preview
              ? `/preview/semester/${semesterId}/register`
              : `/register?semester=${semesterId}`
          }
          className="flex-1 text-center py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-semibold"
        >
          Continue to Registration
        </Link>
      </div>
    </div>
  );
}
