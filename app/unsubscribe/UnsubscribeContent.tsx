"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { publicUnsubscribe } from "./actions";

type Status = "loading" | "success" | "error" | "invalid";

export default function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const [status, setStatus] = useState<Status>(uid ? "loading" : "invalid");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    publicUnsubscribe(uid)
      .then(() => setStatus("success"))
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      });
  }, [uid]);

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-2xl">⚠️</p>
          <h1 className="text-lg font-semibold text-gray-900">Invalid link</h1>
          <p className="text-sm text-gray-500">This unsubscribe link is missing required information.</p>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Processing…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-2xl">✗</p>
          <h1 className="text-lg font-semibold text-gray-900">Unsubscribe failed</h1>
          <p className="text-sm text-gray-500">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
        <p className="text-2xl">✓</p>
        <h1 className="text-lg font-semibold text-gray-900">You&apos;ve been unsubscribed</h1>
        <p className="text-sm text-gray-500">
          You will no longer receive broadcast emails from AYDT. If this was a
          mistake, contact your studio administrator to re-subscribe.
        </p>
      </div>
    </div>
  );
}
