"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import { sendPhoneVerification } from "@/app/actions/sendPhoneVerification";
import { confirmPhoneVerification } from "@/app/actions/confirmPhoneVerification";
import { smsOptOut } from "@/app/actions/smsOptOut";

type State = "idle" | "code_sent" | "verified";

interface Props {
  user: User;
}

export function SmsOptInCard({ user }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const alreadyVerified = !!(user.sms_opt_in && user.sms_verified);

  const [state, setState] = useState<State>("idle");
  const [phone, setPhone] = useState(user.phone_number ?? "");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSendCode() {
    if (!consent) {
      setError("Please check the consent box before continuing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await sendPhoneVerification(phone);
      if (result.error) {
        setError(result.error);
      } else {
        setState("code_sent");
      }
    });
  }

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await confirmPhoneVerification(phone, code);
      if (result.error) {
        setError(result.error);
      } else {
        setState("verified");
        router.refresh();
      }
    });
  }

  function handleResend() {
    setCode("");
    setError(null);
    startTransition(async () => {
      const result = await sendPhoneVerification(phone);
      if (result.error) setError(result.error);
    });
  }

  function handleOptOut() {
    setError(null);
    startTransition(async () => {
      const result = await smsOptOut();
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">SMS Notifications</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Receive urgent alerts for class cancellations, waitlist openings, and overdue payments.
          </p>
        </div>
        {alreadyVerified && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            SMS Active
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Already opted in */}
      {alreadyVerified && state === "idle" && (
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            SMS notifications are active for{" "}
            <span className="font-medium text-gray-900">{user.phone_number}</span>.
          </p>
          <button
            onClick={handleOptOut}
            disabled={isPending}
            className="text-red-600 hover:text-red-700 underline underline-offset-2 text-sm disabled:opacity-50"
          >
            {isPending ? "Opting out…" : "Opt out of SMS"}
          </button>
        </div>
      )}

      {/* Not opted in — idle state */}
      {!alreadyVerified && state === "idle" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mobile phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(212) 555-1234"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-gray-900"
            />
            <span className="text-sm text-gray-600 leading-snug">
              I agree to receive SMS notifications from AYDT about registration updates,
              waitlist invitations, and payment reminders. Message and data rates may apply.
              Reply STOP to opt out.
            </span>
          </label>

          <button
            onClick={handleSendCode}
            disabled={isPending || !phone.trim()}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Sending code…" : "Send Verification Code"}
          </button>
        </div>
      )}

      {/* Code entry state */}
      {state === "code_sent" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A 6-digit code was sent to{" "}
            <span className="font-medium text-gray-900">{phone}</span>.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Verification code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={isPending || code.length < 6}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Verifying…" : "Verify"}
          </button>

          <button
            onClick={handleResend}
            disabled={isPending}
            className="w-full text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Resend code
          </button>
        </div>
      )}

      {/* Success state */}
      {state === "verified" && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Phone verified. You will now receive SMS notifications for urgent updates.
        </div>
      )}
    </section>
  );
}
