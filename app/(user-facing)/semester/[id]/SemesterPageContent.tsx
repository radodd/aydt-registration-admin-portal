"use client";

import { useState, useEffect } from "react";
import type { PublicSemester } from "@/types/public";
import { SemesterDataProvider } from "@/app/providers/SemesterDataProvider";
import { CartProvider } from "@/app/providers/CartProvider";
import { SessionGrid } from "@/app/components/public/SessionGrid";
import { CartDrawer } from "@/app/components/public/CartDrawer";
import { CartExpiryTimer } from "@/app/components/public/CartExpiryTimer";
import { PreRegistrationLanding } from "@/app/components/public/PreRegistrationLanding";

interface Props {
  semester: PublicSemester;
  paymentType?: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
  /** Computed server-side to avoid Date.now() hydration mismatch. */
  initialIsOpen: boolean;
}

export function SemesterPageContent({ semester, paymentType, initialIsOpen }: Props) {
  const [open, setOpen] = useState(initialIsOpen);

  // Safety-net timeout: if the page is still open when the scheduled time
  // arrives, swap to the class catalog. The countdown's onOpen handles the
  // normal case; this covers the tab-left-open scenario.
  // We do NOT call setOpen(true) immediately if msUntilOpen <= 0 —
  // initialIsOpen (server-computed) is the authority for past times.
  useEffect(() => {
    console.log("[SemesterPageContent] mount", {
      registrationOpenAt: semester.registrationOpenAt,
      clientNow: new Date().toISOString(),
      initialIsOpen,
      open,
    });

    if (open || !semester.registrationOpenAt) return;

    const msUntilOpen =
      new Date(semester.registrationOpenAt).getTime() - Date.now();

    console.log("[SemesterPageContent] msUntilOpen:", msUntilOpen);

    if (msUntilOpen <= 0) {
      console.log("[SemesterPageContent] open time already past — waiting for countdown onOpen()");
      return;
    }

    // setTimeout uses a 32-bit signed integer internally — delays > ~24.8 days
    // (2^31 - 1 ms) overflow and fire immediately. For long waits, skip the
    // safety-net and rely solely on the countdown interval in PreRegistrationLanding.
    const MAX_TIMEOUT_MS = 2_147_483_647;
    if (msUntilOpen > MAX_TIMEOUT_MS) {
      console.log("[SemesterPageContent] delay too large for setTimeout — countdown interval will handle it");
      return;
    }

    const id = setTimeout(() => {
      console.log("[SemesterPageContent] safety-net timeout fired → opening");
      setOpen(true);
    }, msUntilOpen);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) {
    return (
      <PreRegistrationLanding
        semester={semester}
        onOpen={() => setOpen(true)}
      />
    );
  }

  return (
    <SemesterDataProvider semester={semester} mode="live">
      <CartProvider semesterId={semester.id}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Hero */}
          <div className="mb-10">
            <p className="text-sm text-indigo-600 font-medium mb-2">
              {semester.startDate && semester.endDate
                ? `${fmtDate(semester.startDate)} – ${fmtDate(semester.endDate)}`
                : "Enrollment open"}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              {semester.name}
            </h1>
            {semester.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-2xl">
                {semester.description}
              </p>
            )}

            {/* Payment plan badge */}
            {paymentType && (
              <div className="mt-4">
                <span className="inline-block text-xs font-medium bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full">
                  {paymentPlanLabel(paymentType)}
                </span>
              </div>
            )}
          </div>

          {/* Cart expiry */}
          <div className="mb-4">
            <CartExpiryTimer />
          </div>

          {/* Session grid */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Available Sessions
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Select sessions and choose your preferred days. Add to cart to
              continue.
            </p>

            {semester.sessions.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
                <p className="text-gray-500">
                  No sessions are available for this semester yet.
                </p>
              </div>
            ) : (
              <SessionGrid
                sessions={semester.sessions}
                groups={semester.sessionGroups}
              />
            )}
          </div>
        </div>

        <CartDrawer />
      </CartProvider>
    </SemesterDataProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function paymentPlanLabel(
  type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments",
): string {
  switch (type) {
    case "pay_in_full":
      return "Pay in full";
    case "deposit_flat":
    case "deposit_percent":
      return "Deposit + balance";
    case "installments":
      return "Installment plan available";
  }
}
