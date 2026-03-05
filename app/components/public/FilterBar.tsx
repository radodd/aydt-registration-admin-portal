"use client";

import { useState } from "react";
import type { PublicSession, PublicSessionGroup } from "@/types/public";

export interface FilterState {
  groupId: string;
  dayOfWeek: string;
  spotsOnly: boolean;
}

interface FilterBarProps {
  sessions: PublicSession[];
  groups: PublicSessionGroup[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function applyFilters(
  sessions: PublicSession[],
  filters: FilterState,
): PublicSession[] {
  return sessions.filter((s) => {
    if (filters.groupId && s.groupId !== filters.groupId) return false;
    if (filters.dayOfWeek && s.scheduleDate) {
      const dayIndex = new Date(s.scheduleDate + "T00:00:00").getDay();
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const sessionDay = dayNames[dayIndex] ?? "";
      if (sessionDay !== filters.dayOfWeek.toLowerCase()) return false;
    }
    if (filters.spotsOnly && s.spotsRemaining === 0) return false;
    return true;
  });
}

export function FilterBar({
  sessions: _sessions,
  groups,
  filters,
  onChange,
}: FilterBarProps) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.groupId,
    filters.dayOfWeek,
    filters.spotsOnly,
  ].filter(Boolean).length;

  function reset() {
    onChange({ groupId: "", dayOfWeek: "", spotsOnly: false });
  }

  return (
    <div className="mb-6">
      {/* Toggle button (mobile) */}
      <div className="flex items-center gap-3 sm:hidden mb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707l-6.414 6.414A1 1 0 0014 13.828V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.172a1 1 0 00-.293-.707L1.293 6.707A1 1 0 011 6V4z"
            />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter controls */}
      <div
        className={`${open ? "block" : "hidden"} sm:flex flex-wrap gap-3 items-center`}
      >
        {/* Group filter */}
        {groups.length > 0 && (
          <select
            value={filters.groupId}
            onChange={(e) => onChange({ ...filters, groupId: e.target.value })}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        {/* Day of week filter */}
        <select
          value={filters.dayOfWeek}
          onChange={(e) =>
            onChange({ ...filters, dayOfWeek: e.target.value })
          }
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
        >
          <option value="">Any Day</option>
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Available spots toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.spotsOnly}
            onChange={(e) =>
              onChange({ ...filters, spotsOnly: e.target.checked })
            }
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
          />
          Available spots only
        </label>

        {/* Clear */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="hidden sm:block text-sm text-gray-400 hover:text-gray-600"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
