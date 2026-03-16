"use client";

import type { PublicAvailableDay } from "@/types/public";

interface DayPickerProps {
  days: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

function formatDay(day: PublicAvailableDay): string {
  const date = new Date(day.date + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function DayPicker({
  days,
  selectedIds,
  onChange,
  disabled = false,
}: DayPickerProps) {
  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((d) => d !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    if (disabled) return;
    onChange(days.map((d) => d.id));
  }

  function clearAll() {
    if (disabled) return;
    onChange([]);
  }

  if (days.length === 0) {
    return (
      <p className="text-sm text-neutral-400 italic">
        No individual days available — full session enrollment.
      </p>
    );
  }

  const allSelected = selectedIds.length === days.length;

  return (
    <div className="space-y-2">
      {/* Bulk controls */}
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={allSelected ? clearAll : selectAll}
          disabled={disabled}
          className="text-xs text-primary-600 hover:text-primary-800 font-medium disabled:opacity-40"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="text-xs text-neutral-400">
          {selectedIds.length} / {days.length} selected
        </span>
      </div>

      {/* Day chips */}
      <div className="flex flex-wrap gap-2">
        {days.map((day) => {
          const isSelected = selectedIds.includes(day.id);
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => toggle(day.id)}
              disabled={disabled}
              className={`
                px-3 py-2 rounded-xl border text-xs font-medium transition-colors text-left
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  isSelected
                    ? "bg-primary-600 border-primary-600 text-white"
                    : "bg-white border-neutral-200 text-neutral-700 hover:border-primary-400 hover:bg-primary-50"
                }
              `}
            >
              {/* <span className="block">{formatDay(day)}</span>
              {(day.startTime || day.endTime) && (
                <span
                  className={`block mt-0.5 ${
                    isSelected ? "text-primary-100" : "text-neutral-400"
                  }`}
                >
                  {formatTime(day.startTime)}
                  {day.endTime ? ` – ${formatTime(day.endTime)}` : ""}
                </span> */}
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
