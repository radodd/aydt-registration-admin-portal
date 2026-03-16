"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type BatchStatus = "confirmed" | "pending_payment" | "failed" | "unknown";

/**
 * BatchConfirmationGuard
 *
 * Handles the race between the EPG payment webhook and the returnUrl redirect.
 * EPG fires the webhook and redirects the user roughly simultaneously — the
 * redirect can arrive before the webhook has been processed.
 *
 * When the batch is still `pending_payment` on page load, this component polls
 * GET /api/register/batch-status every 2 seconds for up to 30 seconds.
 * Once the webhook confirms the batch, we show the success UI.
 *
 * If the batch is already confirmed on load (webhook beat the redirect),
 * we render the success UI immediately without polling.
 */
export function BatchConfirmationGuard({
  batchId,
  semesterId,
  initialStatus,
  isPreview,
}: {
  batchId: string;
  semesterId: string;
  initialStatus: BatchStatus;
  isPreview: boolean;
}) {
  const [status, setStatus] = useState<BatchStatus>(initialStatus);
  const [timedOut, setTimedOut] = useState(false);
  const pollCount = useRef(0);
  const MAX_POLLS = 15; // 15 × 2s = 30s

  useEffect(() => {
    // No polling needed if already confirmed or in preview mode
    if (status === "confirmed" || isPreview) return;

    const interval = setInterval(async () => {
      pollCount.current++;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/register/batch-status?id=${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "confirmed") {
          clearInterval(interval);
          setStatus("confirmed");
        }
      } catch {
        // network blip — retry next tick
      }
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirmed — render normal success UI
  if (status === "confirmed" || isPreview) {
    return <SuccessContent semesterId={semesterId} isPreview={isPreview} />;
  }

  // Timed out — payment was received but webhook took too long
  if (timedOut) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-6">📬</div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-3">
          Payment received — your registration is being confirmed
        </h1>
        <p className="text-neutral-500 text-base mb-2">
          This is taking a little longer than usual. Your registration will be
          confirmed shortly and you&apos;ll receive a confirmation email.
        </p>
        <p className="text-neutral-400 text-sm mb-10">
          If you don&apos;t receive an email within 10 minutes, please contact
          AYDT support.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/family"
            className="bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors text-sm"
          >
            View My Registrations
          </Link>
          <Link
            href="/"
            className="border border-neutral-200 text-neutral-600 px-6 py-3 rounded-xl font-medium hover:bg-neutral-50 transition-colors text-sm"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Polling — webhook hasn't fired yet
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <div className="flex justify-center mb-6">
        <div className="h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-3">
        Confirming your registration…
      </h1>
      <p className="text-neutral-500 text-base">
        Your payment was received. Please wait while we confirm your
        registration.
      </p>
    </div>
  );
}

function SuccessContent({
  semesterId,
  isPreview,
}: {
  semesterId: string;
  isPreview: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      {isPreview && (
        <div className="bg-mauve/10 border border-mauve rounded-xl px-4 py-3 text-sm text-mauve-text font-medium mb-8">
          Preview mode — this is a simulated confirmation.
        </div>
      )}

      <div className="text-5xl mb-6">🎉</div>

      <h1 className="text-3xl font-bold text-neutral-900 mb-3">
        You&apos;re registered!
      </h1>
      <p className="text-neutral-500 text-lg mb-2">
        Your registration has been confirmed.
      </p>
      <p className="text-neutral-400 text-sm mb-10">
        A confirmation email has been sent to your inbox. Please check your spam
        folder if you don&apos;t see it within a few minutes.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/family"
          className="bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors text-sm"
        >
          View My Registrations
        </Link>
        <Link
          href="/"
          className="border border-neutral-200 text-neutral-600 px-6 py-3 rounded-xl font-medium hover:bg-neutral-50 transition-colors text-sm"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
