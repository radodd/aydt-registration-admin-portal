"use client";

import { useState } from "react";
import { useCart } from "@/app/providers/CartProvider";
import { DayPicker } from "./DayPicker";
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
  const { addItem, removeItem, hasSession, updateDays, items } = useCart();

  const inCart = hasSession(session.id);
  const cartItem = items.find((i) => i.sessionId === session.id);

  const [selectedDayIds, setSelectedDayIds] = useState<string[]>(
    cartItem?.selectedDayIds ?? [],
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const pricePerDay = session.pricePerDay ?? 0;
  const hasDays = session.availableDays.length > 0;
  const subtotal = pricePerDay * selectedDayIds.length;

  const isFull =
    session.spotsRemaining === 0 && !session.waitlistEnabled;

  function handleAddToCart() {
    if (hasDays && selectedDayIds.length === 0) return;
    addItem(
      session.id,
      session.name,
      hasDays ? selectedDayIds : [],
      pricePerDay,
    );
  }

  function handleRemove() {
    removeItem(session.id);
    setSelectedDayIds([]);
  }

  function handleDayChange(ids: string[]) {
    setSelectedDayIds(ids);
    if (inCart) {
      updateDays(session.id, ids, pricePerDay);
    }
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

          {/* In-cart badge */}
          {inCart && (
            <span className="shrink-0 bg-indigo-50 text-indigo-600 text-xs font-semibold px-2.5 py-1 rounded-full">
              In cart
            </span>
          )}
        </div>

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

          {session.startDate && session.endDate && (
            <span>
              {fmtDate(session.startDate)} – {fmtDate(session.endDate)}
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

          {pricePerDay > 0 && (
            <span className="font-semibold text-gray-900">
              {formatCurrency(pricePerDay)}{hasDays ? " / day" : ""}
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

        {/* Day picker (toggle) */}
        {hasDays && (
          <div>
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-3 flex items-center gap-1"
            >
              {isExpanded ? "Hide" : "Choose"} days
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isExpanded && (
              <div className="mb-4">
                <DayPicker
                  days={session.availableDays}
                  selectedIds={selectedDayIds}
                  onChange={handleDayChange}
                  disabled={isFull && !inCart}
                />
                {selectedDayIds.length > 0 && (
                  <p className="mt-3 text-sm font-semibold text-gray-900">
                    Subtotal: {formatCurrency(subtotal)}
                  </p>
                )}
              </div>
            )}
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
            disabled={
              isFull ||
              (hasDays && selectedDayIds.length === 0 && isExpanded)
            }
            className="w-full text-sm py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFull
              ? session.waitlistEnabled
                ? "Join Waitlist"
                : "Full"
              : hasDays && !isExpanded
                ? "Select Days & Add to Cart"
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
