import Link from "next/link";
import type { Metadata } from "next";
import { ConfirmationCleanup } from "./ConfirmationCleanup";

export const metadata: Metadata = {
  title: "Registration Confirmed — AYDT",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; semester?: string }>;
}) {
  const { preview, semester } = await searchParams;
  const isPreview = preview === "1";
  const semesterId = semester ?? "";

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <ConfirmationCleanup semesterId={semesterId} isPreview={isPreview} />
      {isPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium mb-8">
          Preview mode — this is a simulated confirmation.
        </div>
      )}

      <div className="text-5xl mb-6">🎉</div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">
        You&apos;re registered!
      </h1>
      <p className="text-gray-500 text-lg mb-2">
        Your registration has been confirmed.
      </p>
      <p className="text-gray-400 text-sm mb-10">
        A confirmation email has been sent to your inbox. Please check your spam
        folder if you don&apos;t see it within a few minutes.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/family"
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-sm"
        >
          View My Registrations
        </Link>
        <Link
          href="/"
          className="border border-gray-200 text-gray-600 px-6 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
