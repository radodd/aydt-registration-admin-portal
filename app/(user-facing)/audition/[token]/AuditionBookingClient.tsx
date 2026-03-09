"use client";

import { useState } from "react";
import type { ClassInvite, AuditionSession } from "@/types";
import { createAuditionBooking } from "@/app/actions/competition/createAuditionBooking";

interface Props {
  token: string;
  invite: ClassInvite;
  danceClass: {
    id: string;
    name: string;
    discipline: string;
    division: string;
    description: string | null;
  };
  auditionSessions: AuditionSession[];
}

type BookingStep = "select_session" | "identity" | "confirmed";

export default function AuditionBookingClient({
  invite,
  danceClass,
  auditionSessions,
}: Props) {
  const [step, setStep] = useState<BookingStep>("select_session");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const selectedSession = auditionSessions.find(
    (s) => s.id === selectedSessionId,
  );

  async function handleBook() {
    if (!selectedSessionId || !guestName.trim() || !guestEmail.trim()) return;
    setSubmitting(true);
    setError(null);

    const result = await createAuditionBooking({
      auditionSessionId: selectedSessionId,
      classId: danceClass.id,
      inviteId: invite.id,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
    });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setBookingId(result.bookingId);
    setStep("confirmed");
  }

  if (step === "confirmed") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Audition Booked!
          </h1>
          <p className="text-sm text-gray-500">
            Your spot for{" "}
            <span className="font-medium text-gray-700">{danceClass.name}</span>{" "}
            is confirmed.
            {selectedSession && (
              <>
                {" "}
                See you on{" "}
                <span className="font-medium text-gray-700">
                  {new Date(selectedSession.start_at).toLocaleDateString(
                    "en-US",
                    { weekday: "long", month: "long", day: "numeric" },
                  )}
                </span>{" "}
                at{" "}
                {new Date(selectedSession.start_at).toLocaleTimeString(
                  "en-US",
                  { hour: "numeric", minute: "2-digit" },
                )}
                .
              </>
            )}
          </p>
          <p className="text-xs text-gray-400">Booking ID: {bookingId}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider mb-1">
            Competition Track Audition
          </p>
          <h1 className="text-2xl font-semibold text-gray-900">
            {danceClass.name}
          </h1>
          {danceClass.description && (
            <p className="mt-2 text-sm text-gray-500">{danceClass.description}</p>
          )}
          <div className="mt-3 flex gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
              {danceClass.discipline.replace(/_/g, " ")}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
              {danceClass.division.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {/* Step: Select session */}
        {step === "select_session" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-medium text-gray-900">
              Select an Audition Slot
            </h2>
            {auditionSessions.length === 0 ? (
              <p className="text-sm text-gray-500">
                No audition slots are currently available. Please check back
                later or contact the studio.
              </p>
            ) : (
              <div className="space-y-2">
                {auditionSessions.map((session) => {
                  const start = new Date(session.start_at);
                  const end = new Date(session.end_at);
                  const isSelected = selectedSessionId === session.id;

                  return (
                    <button
                      key={session.id}
                      onClick={() => setSelectedSessionId(session.id)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <p className="font-medium text-sm text-gray-900">
                        {session.label ??
                          start.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {start.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        &ndash;{" "}
                        {end.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {session.location && ` · ${session.location}`}
                      </p>
                      {session.price !== null && (
                        <p className="text-xs font-medium text-indigo-600 mt-1">
                          ${session.price.toFixed(2)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setStep("identity")}
              disabled={!selectedSessionId}
              className="w-full mt-2 rounded-xl bg-indigo-600 text-white text-sm font-medium py-2.5 disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: Identity */}
        {step === "identity" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-medium text-gray-900">Your Information</h2>
            <p className="text-xs text-gray-500">
              Enter the name and email for the student auditioning.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep("select_session")}
                className="flex-1 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium py-2.5 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleBook}
                disabled={
                  submitting ||
                  !guestName.trim() ||
                  !guestEmail.trim()
                }
                className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-medium py-2.5 disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                {submitting ? "Booking…" : "Confirm Booking"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
