"use client";

import { useState, useTransition, useMemo } from "react";
import { cancelClass } from "@/app/admin/semesters/actions/cancelClass";

interface SessionRow {
  id: string;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  classes: { name: string; discipline: string } | null;
  semesters: { name: string } | null;
}

interface FilterOptions {
  semesters: string[];
  disciplines: string[];
  days: string[];
}

interface Props {
  sessions: SessionRow[];
  registrationCounts: Record<string, number>;
  filterOptions: FilterOptions;
}

type SortCol = "class" | "discipline" | "semester" | "day" | "enrolled";
type SortDir = "asc" | "desc";

const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function formatTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: SortDir }) {
  if (sortCol !== col) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-gray-600">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export function SessionsTable({ sessions, registrationCounts, filterOptions }: Props) {
  const [rows, setRows] = useState<SessionRow[]>(sessions);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [filterClass, setFilterClass] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterDay, setFilterDay] = useState("");

  // Sort state
  const [sortCol, setSortCol] = useState<SortCol>("day");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSortClick(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const filteredSorted = useMemo(() => {
    let result = rows.filter((s) => {
      const className = (s.classes as any)?.name ?? "";
      const discipline = (s.classes as any)?.discipline ?? "";
      const semesterName = (s.semesters as any)?.name ?? "";

      if (filterClass && !className.toLowerCase().includes(filterClass.toLowerCase())) return false;
      if (filterDiscipline && discipline !== filterDiscipline) return false;
      if (filterSemester && semesterName !== filterSemester) return false;
      if (filterDay && s.day_of_week !== filterDay) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      let av = 0, bv = 0;
      let as_ = "", bs_ = "";

      switch (sortCol) {
        case "class":
          as_ = (a.classes as any)?.name ?? "";
          bs_ = (b.classes as any)?.name ?? "";
          return sortDir === "asc" ? as_.localeCompare(bs_) : bs_.localeCompare(as_);
        case "discipline":
          as_ = (a.classes as any)?.discipline ?? "";
          bs_ = (b.classes as any)?.discipline ?? "";
          return sortDir === "asc" ? as_.localeCompare(bs_) : bs_.localeCompare(as_);
        case "semester":
          as_ = (a.semesters as any)?.name ?? "";
          bs_ = (b.semesters as any)?.name ?? "";
          return sortDir === "asc" ? as_.localeCompare(bs_) : bs_.localeCompare(as_);
        case "day":
          av = DAY_ORDER.indexOf(a.day_of_week);
          bv = DAY_ORDER.indexOf(b.day_of_week);
          if (av !== bv) return sortDir === "asc" ? av - bv : bv - av;
          // secondary sort by start_time within same day
          return sortDir === "asc"
            ? (a.start_time ?? "").localeCompare(b.start_time ?? "")
            : (b.start_time ?? "").localeCompare(a.start_time ?? "");
        case "enrolled":
          av = registrationCounts[a.id] ?? 0;
          bv = registrationCounts[b.id] ?? 0;
          return sortDir === "asc" ? av - bv : bv - av;
      }
    });

    return result;
  }, [rows, filterClass, filterDiscipline, filterSemester, filterDay, sortCol, sortDir, registrationCounts]);

  function openModal(id: string) {
    setCancellingId(id);
    setReason("");
    setError(null);
  }

  function closeModal() {
    setCancellingId(null);
    setReason("");
    setError(null);
  }

  function handleConfirm() {
    if (!cancellingId) return;
    if (!reason.trim()) {
      setError("Please enter a cancellation reason.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelClass(cancellingId, reason.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows((prev) => prev.filter((s) => s.id !== cancellingId));
      setToast(
        `Session cancelled. ${result.notified ?? 0} famil${(result.notified ?? 0) === 1 ? "y" : "ies"} notified.`
      );
      closeModal();
      setTimeout(() => setToast(null), 5000);
    });
  }

  const cancellingSession = rows.find((s) => s.id === cancellingId) ?? null;
  const enrolled = cancellingId ? (registrationCounts[cancellingId] ?? 0) : 0;

  const hasFilters = filterClass || filterDiscipline || filterSemester || filterDay;

  function clearFilters() {
    setFilterClass("");
    setFilterDiscipline("");
    setFilterSemester("");
    setFilterDay("");
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          No active sessions found.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              {/* Sortable column headers */}
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("class")}
                    className="flex items-center font-medium text-gray-600 hover:text-gray-900"
                  >
                    Class <SortIcon col="class" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("discipline")}
                    className="flex items-center font-medium text-gray-600 hover:text-gray-900"
                  >
                    Discipline <SortIcon col="discipline" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("semester")}
                    className="flex items-center font-medium text-gray-600 hover:text-gray-900"
                  >
                    Semester <SortIcon col="semester" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("day")}
                    className="flex items-center font-medium text-gray-600 hover:text-gray-900"
                  >
                    Schedule <SortIcon col="day" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("enrolled")}
                    className="flex items-center font-medium text-gray-600 hover:text-gray-900"
                  >
                    Enrolled / Cap <SortIcon col="enrolled" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-blue-600 hover:underline font-normal"
                    >
                      Clear filters
                    </button>
                  )}
                </th>
              </tr>
              {/* Filter row */}
              <tr className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Search class…"
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={filterDiscipline}
                    onChange={(e) => setFilterDiscipline(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">All disciplines</option>
                    {filterOptions.disciplines.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={filterSemester}
                    onChange={(e) => setFilterSemester(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">All semesters</option>
                    {filterOptions.semesters.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={filterDay}
                    onChange={(e) => setFilterDay(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">All days</option>
                    {filterOptions.days.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    No sessions match your filters.
                  </td>
                </tr>
              ) : (
                filteredSorted.map((session) => {
                  const enrolledCount = registrationCounts[session.id] ?? 0;
                  const cap = session.capacity ?? "—";
                  const isFull =
                    session.capacity !== null && enrolledCount >= session.capacity;
                  const className = (session.classes as any)?.name ?? "—";
                  const discipline = (session.classes as any)?.discipline ?? "—";
                  const semesterName = (session.semesters as any)?.name ?? "—";

                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{className}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{discipline}</td>
                      <td className="px-4 py-3 text-gray-600">{semesterName}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {session.day_of_week}{" "}
                        {formatTime(session.start_time)}
                        {session.end_time ? ` – ${formatTime(session.end_time)}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className={isFull ? "font-semibold text-red-600" : "text-gray-600"}>
                          {enrolledCount} / {cap}
                        </span>
                        {isFull && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                            Full
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openModal(session.id)}
                          className="text-red-600 hover:text-red-700 font-medium text-sm"
                        >
                          Cancel Session
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Result count */}
          {hasFilters && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              Showing {filteredSorted.length} of {rows.length} sessions
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {cancellingId && cancellingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Cancel Session</h2>

            {/* Session details */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 space-y-1">
              <p>
                <span className="font-medium">Class:</span>{" "}
                {(cancellingSession.classes as any)?.name ?? "—"}
              </p>
              <p>
                <span className="font-medium">Schedule:</span>{" "}
                {cancellingSession.day_of_week}{" "}
                {formatTime(cancellingSession.start_time)}
                {cancellingSession.end_time
                  ? ` – ${formatTime(cancellingSession.end_time)}`
                  : ""}
              </p>
              <p>
                <span className="font-medium">Enrolled families:</span>{" "}
                {enrolled}
              </p>
            </div>

            {/* Warning */}
            <div className="flex gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
              <span className="text-red-500 text-base mt-0.5">⚠️</span>
              <p>
                This will immediately send a cancellation notice to all{" "}
                <strong>{enrolled} enrolled {enrolled === 1 ? "family" : "families"}</strong> via email and SMS.{" "}
                <strong>This action cannot be undone.</strong>
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cancellation reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Instructor illness, facility issue, low enrollment…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={isPending}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || !reason.trim()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Cancelling…" : "Cancel Session & Notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
