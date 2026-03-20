"use client";

import { useState, useEffect, useRef } from "react";

const CAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CAL_DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function InlineDatePicker({
  value,
  onChange,
  disabled = false,
  placement = "bottom",
  timeTitle,
  timeLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placement?: "top" | "bottom";
  timeTitle?: string;
  timeLabel?: string;
}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const base = value || todayStr;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [viewYear, setViewYear] = useState(() => parseInt(base.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => parseInt(base.slice(5, 7)) - 1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleOpen() {
    if (disabled) return;
    const b = value || todayStr;
    setDraft(value);
    setViewYear(parseInt(b.slice(0, 4)));
    setViewMonth(parseInt(b.slice(5, 7)) - 1);
    setOpen(true);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else { setViewMonth((m) => m - 1); }
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else { setViewMonth((m) => m + 1); }
  }

  type CalCell = { date: string; day: number; inMonth: boolean };
  const cells: CalCell[] = [];
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthTotal = new Date(viewYear, viewMonth, 0).getDate();

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = prevMonthTotal - i;
    const m = viewMonth === 0 ? 12 : viewMonth;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, inMonth: true });
  }
  let nextD = 1;
  while (cells.length < 42) {
    const m = viewMonth === 11 ? 1 : viewMonth + 2;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(nextD).padStart(2, "0")}`, day: nextD, inMonth: false });
    nextD++;
  }

  function fmtDisplay(dateStr: string) {
    if (!dateStr) return "";
    const [y, mo, d] = dateStr.split("-");
    return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-left bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
      >
        {value ? fmtDisplay(value) : <span className="text-neutral-400">Pick a date</span>}
      </button>

      {open && (
        <div className={`absolute z-50 left-0 w-72 bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden ${placement === "top" ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {/* Time banner */}
          {timeLabel && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600 shrink-0">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-xs text-neutral-500">{timeTitle ?? "Time"}</span>
                <span className="text-sm font-semibold text-neutral-900">{timeLabel}</span>
              </div>
              <span className="text-xs text-neutral-400">from above</span>
            </div>
          )}

          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-3">
            <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-neutral-100 transition text-neutral-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-sm font-semibold text-neutral-900">{CAL_MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-neutral-100 transition text-neutral-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-3 pb-1">
            {CAL_DAY_HEADERS.map((h) => (
              <div key={h} className="text-center text-xs font-medium text-neutral-400 py-1">{h}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
            {cells.map((cell, i) => {
              const isSelected = cell.date === draft;
              const isToday = cell.date === todayStr;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDraft(cell.date)}
                  className={`h-9 w-full flex items-center justify-center text-sm rounded-full transition
                    ${isSelected
                      ? "bg-primary-600 text-white font-semibold"
                      : isToday
                        ? "bg-primary-50 text-primary-700 font-semibold ring-1 ring-primary-300"
                        : !cell.inMonth
                          ? "text-neutral-300"
                          : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-sm text-neutral-500 hover:text-neutral-800 transition"
            >
              Clear
            </button>
            <span className="text-sm text-neutral-600 mx-1">
              {draft
                ? `${fmtDisplay(draft)}${timeLabel ? ` · ${timeLabel}` : ""}`
                : <span className="text-neutral-400">—</span>}
            </span>
            <button
              type="button"
              onClick={() => { onChange(draft); setOpen(false); }}
              className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-4 py-1.5 rounded-lg transition"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
