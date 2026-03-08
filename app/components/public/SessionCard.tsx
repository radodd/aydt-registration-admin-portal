"use client";

import { useCart } from "@/app/providers/CartProvider";
import type { PublicSession } from "@/types/public";

interface SessionCardProps {
  session: PublicSession;
  groupName?: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents);
}

export function SessionCard({ session, groupName }: SessionCardProps) {
  const { add, remove, sessionIds } = useCart();

  const inCart = sessionIds.includes(session.id);
  const price = session.dropInPrice ?? 0;
  const isFull = session.spotsRemaining === 0 && !session.waitlistEnabled;

  function handleAddToCart() {
    add(session.id);
  }

  function handleRemove() {
    remove(session.id);
  }

  return (
    <div
      className={`bg-white border rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${
        inCart ? "border-indigo-300 shadow-sm" : "border-gray-200"
      }`}
    >
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {groupName && (
              <p className="text-xs font-medium text-indigo-500 mb-1">
                {groupName}
              </p>
            )}
            <h3 className="text-base font-semibold text-gray-900 leading-tight">
              {session.name}
            </h3>
            {session.category && (
              <p className="text-xs text-gray-400 mt-0.5">{session.category}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Competition track badge */}
            {session.isCompetitionTrack && (
              <span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
                Competition
              </span>
            )}

            {/* In-cart badge */}
            {inCart && (
              <span className="bg-indigo-50 text-indigo-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                In cart
              </span>
            )}
          </div>
        </div>

        {/* Date + time row */}
        {(session.scheduleDate || session.startTime) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {session.scheduleDate && (
              <span className="bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full capitalize">
                {fmtDate(session.scheduleDate)}
              </span>
            )}
            {session.startTime && (
              <span className="text-xs text-gray-500">
                {fmtTime(session.startTime)}
                {session.endTime ? ` – ${fmtTime(session.endTime)}` : ""}
              </span>
            )}
          </div>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-3">
          {session.location && (
            <span className="flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {session.location}
            </span>
          )}


          {/* Age range */}
          {(session.minAge != null || session.maxAge != null) && (
            <span>
              Ages{" "}
              {session.minAge != null && session.maxAge != null
                ? `${session.minAge}–${session.maxAge}`
                : session.minAge != null
                  ? `${session.minAge}+`
                  : `up to ${session.maxAge}`}
            </span>
          )}

          {/* Grade range */}
          {(session.minGrade != null || session.maxGrade != null) && (
            <span>
              Grade{" "}
              {session.minGrade != null && session.maxGrade != null
                ? `${session.minGrade}–${session.maxGrade}`
                : session.minGrade != null
                  ? `${session.minGrade}+`
                  : `up to ${session.maxGrade}`}
            </span>
          )}
        </div>

        {/* Description */}
        {session.description && (
          <p className="text-sm text-gray-600 mb-3 leading-relaxed">
            {session.description}
          </p>
        )}

        {/* Availability */}
        <div className="flex items-center justify-between text-sm mb-4">
          <span
            className={`font-medium ${
              isFull
                ? "text-red-600"
                : session.spotsRemaining <= 5
                  ? "text-amber-600"
                  : "text-green-600"
            }`}
          >
            {isFull
              ? "Full"
              : session.waitlistEnabled && session.spotsRemaining === 0
                ? "Waitlist available"
                : `${session.spotsRemaining} spot${session.spotsRemaining !== 1 ? "s" : ""} remaining`}
          </span>

          {price > 0 && (
            <span className="font-semibold text-gray-900">
              {formatCurrency(price)}
            </span>
          )}
        </div>

        {/* Registration close notice */}
        {session.registrationCloseAt && (
          <p className="text-xs text-amber-600 mb-4">
            Registration closes{" "}
            {new Date(session.registrationCloseAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
          </p>
        )}

        {/* Competition track notice */}
        {session.isCompetitionTrack && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
            <p className="text-xs font-semibold text-amber-800 mb-0.5">
              Competition Track
            </p>
            <p className="text-xs text-amber-700">
              Audition or director approval required. Concurrent enrollment in
              required technique classes may be needed. Contact the studio for
              eligibility.
            </p>
          </div>
        )}

        {/* CTA */}
        {inCart ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRemove}
              className="flex-1 text-sm py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
            >
              Remove
            </button>
            <a
              href="/cart"
              className="flex-1 text-sm py-2.5 rounded-xl bg-indigo-600 text-white text-center hover:bg-indigo-700 transition-colors font-semibold"
            >
              View Cart
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isFull}
            className="w-full text-sm py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFull
              ? session.waitlistEnabled
                ? "Join Waitlist"
                : "Full"
              : "Add to Cart"}
          </button>
        )}
      </div>
    </div>
  );
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0
    ? `${hour} ${period}`
    : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}
