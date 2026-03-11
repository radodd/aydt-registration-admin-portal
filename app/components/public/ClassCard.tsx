"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCart } from "@/app/providers/CartProvider";
import { SessionAddButton } from "./SessionAddButton";
import { GroupedClass } from "./SessionGrid";

export function ClassCard({ group }: { group: GroupedClass }) {
  const { sessionIds } = useCart();
  const cartCount = group.sessions.filter((s) =>
    sessionIds.includes(s.id),
  ).length;

  const [isOpen, setIsOpen] = useState(cartCount > 0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header — clickable toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full text-left px-6 py-5 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <h3 className="text-base font-semibold text-gray-900">
              {group.name}
            </h3>
            {cartCount > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {cartCount} in cart
              </span>
            )}
          </div>

          {group.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
              {group.description}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-gray-400">
            {group.location && <span>{group.location}</span>}
            {(group.minAge != null || group.maxAge != null) && (
              <span>
                Ages{" "}
                {group.minAge != null && group.maxAge != null
                  ? `${group.minAge}–${group.maxAge}`
                  : group.minAge != null
                    ? `${group.minAge}+`
                    : `up to ${group.maxAge}`}
              </span>
            )}
            {(group.minGrade != null || group.maxGrade != null) && (
              <span>
                Grade{" "}
                {group.minGrade != null && group.maxGrade != null
                  ? `${group.minGrade}–${group.maxGrade}`
                  : group.minGrade != null
                    ? `${group.minGrade}+`
                    : `up to ${group.maxGrade}`}
              </span>
            )}
          </div>

          {!isOpen && (
            <p className="text-xs text-gray-400 mt-1.5">
              {group.sessions.length} session
              {group.sessions.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <span className="shrink-0 mt-0.5 text-gray-400">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      {/* Session rows */}
      {isOpen && (
        <div className="px-6 pb-5 space-y-2 border-t border-gray-100 pt-4">
          {group.sessions.map((session) => {
            const day = session.scheduleDate;

            return (
              <div
                key={session.id}
                className="flex items-center justify-between border rounded-lg px-4 py-2"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{day}</div>
                  <div className="text-xs text-gray-500">
                    {session.startTime} – {session.endTime}
                  </div>
                  <div className="text-xs text-gray-500">
                    {session.instructorName}
                  </div>
                </div>

                <SessionAddButton session={session} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
