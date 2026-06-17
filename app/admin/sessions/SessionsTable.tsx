"use client";

import { useState, useTransition, useMemo } from "react";
import { cancelClass, type EnrolledFamily } from "@/app/admin/semesters/actions/cancelClass";
import { issueBulkCredits } from "@/app/admin/credits/actions/issueBulkCredits";
import { useToast } from "@/app/components/Toast";

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

function formatDate(d: string | null): string {
  if (!d) return "";
  const [, m, day] = d.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${day}`;
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: SortDir }) {
  if (sortCol !== col) return <span className="ml-1 text-neutral-300">↕</span>;
  return <span className="ml-1 text-neutral-600">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export function SessionsTable({ sessions, registrationCounts, filterOptions }: Props) {
  const [rows, setRows] = useState<SessionRow[]>(sessions);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Bulk credit modal — shown after cancellation when families are enrolled
  const [bulkCreditData, setBulkCreditData] = useState<{
    enrolledFamilies: EnrolledFamily[];
    className: string;
  } | null>(null);
  const [bulkCreditAmount, setBulkCreditAmount] = useState("");
  const [bulkCreditReason, setBulkCreditReason] = useState("");
  const [bulkCreditError, setBulkCreditError] = useState("");
  const [bulkCreditSubmitting, setBulkCreditSubmitting] = useState(false);

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
      toast.success(
        `Session cancelled. ${result.notified ?? 0} famil${(result.notified ?? 0) === 1 ? "y" : "ies"} notified.`
      );
      closeModal();

      // Offer bulk credit issuance if there were enrolled families
      if (result.enrolledFamilies && result.enrolledFamilies.length > 0) {
        setBulkCreditData({
          enrolledFamilies: result.enrolledFamilies,
          className: result.className ?? "the cancelled class",
        });
        setBulkCreditAmount("");
        setBulkCreditReason(`Cancelled class: ${result.className ?? "class"}`);
        setBulkCreditError("");
      }
    });
  }

  async function handleBulkCredit() {
    if (!bulkCreditData) return;
    const amount = parseFloat(bulkCreditAmount);
    if (isNaN(amount) || amount <= 0) {
      setBulkCreditError("Please enter a valid amount greater than $0.");
      return;
    }
    setBulkCreditSubmitting(true);
    setBulkCreditError("");
    const result = await issueBulkCredits(
      bulkCreditData.enrolledFamilies.map((f) => ({
        familyId: f.family_id,
        amount,
        reason: bulkCreditReason || undefined,
      }))
    );
    setBulkCreditSubmitting(false);
    if (result.error) {
      setBulkCreditError(result.error);
      return;
    }
    const n = result.count ?? bulkCreditData.enrolledFamilies.length;
    setBulkCreditData(null);
    toast.success(`Credits issued to ${n} famil${n === 1 ? "y" : "ies"}.`);
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
      {/* Bulk Credit Modal — shown after class cancellation */}
      {bulkCreditData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Issue Credits to Affected Families</h2>
            <p className="text-sm text-neutral-500">
              Issue an account credit to all{" "}
              <strong>{bulkCreditData.enrolledFamilies.length} affected {bulkCreditData.enrolledFamilies.length === 1 ? "family" : "families"}</strong>.
              Credits can be applied toward any future registration.
            </p>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Credit amount per family <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={bulkCreditAmount}
                  onChange={(e) => { setBulkCreditAmount(e.target.value); setBulkCreditError(""); }}
                  className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Reason <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={bulkCreditReason}
                onChange={(e) => setBulkCreditReason(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            {bulkCreditError && <p className="text-sm text-red-600">{bulkCreditError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setBulkCreditData(null)}
                disabled={bulkCreditSubmitting}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={handleBulkCredit}
                disabled={bulkCreditSubmitting || !bulkCreditAmount}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {bulkCreditSubmitting ? "Issuing…" : `Issue Credits`}
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="admin-card px-5 py-10 text-center text-sm" style={{ color: "var(--admin-text-faint)" }}>
          No active classes found.
        </div>
      ) : (
        <div className="admin-card overflow-hidden">
          {/* Filter bar — responsive flex-wrap row above the table */}
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
            <input
              type="text"
              placeholder="Search class…"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="admin-input text-[12px] flex-1 min-w-[140px]"
              style={{ maxWidth: "200px" }}
            />
            <select
              value={filterDiscipline}
              onChange={(e) => setFilterDiscipline(e.target.value)}
              className="admin-select text-[12px] flex-1 min-w-[130px]"
              style={{ maxWidth: "180px" }}
            >
              <option value="">All disciplines</option>
              {filterOptions.disciplines.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="admin-select text-[12px] flex-1 min-w-[130px]"
              style={{ maxWidth: "200px" }}
            >
              <option value="">All semesters</option>
              {filterOptions.semesters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="admin-select text-[12px] flex-1 min-w-[110px]"
              style={{ maxWidth: "160px" }}
            >
              <option value="">All days</option>
              {filterOptions.days.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="admin-btn-neutral admin-btn-sm shrink-0"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Table — horizontal scroll on mobile */}
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ background: "var(--admin-table-header-bg)" }}>
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("class")}
                    className="flex items-center text-[10.5px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--admin-table-header-text)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    Class <SortIcon col="class" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("discipline")}
                    className="flex items-center text-[10.5px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--admin-table-header-text)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    Discipline <SortIcon col="discipline" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("semester")}
                    className="flex items-center text-[10.5px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--admin-table-header-text)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    Semester <SortIcon col="semester" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("day")}
                    className="flex items-center text-[10.5px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--admin-table-header-text)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    Schedule <SortIcon col="day" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSortClick("enrolled")}
                    className="flex items-center text-[10.5px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--admin-table-header-text)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    Enrolled / Cap <SortIcon col="enrolled" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "var(--admin-text-faint)" }}>
                    No classes match your filters.
                  </td>
                </tr>
              ) : (
                filteredSorted.map((session, i) => {
                  const enrolledCount = registrationCounts[session.id] ?? 0;
                  const cap = session.capacity ?? "—";
                  const isFull =
                    session.capacity !== null && enrolledCount >= session.capacity;
                  const className = (session.classes as any)?.name ?? "—";
                  const discipline = (session.classes as any)?.discipline ?? "—";
                  const semesterName = (session.semesters as any)?.name ?? "—";

                  return (
                    <tr
                      key={session.id}
                      style={{ background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)")}
                    >
                      <td className="px-4 py-3 text-[13px] font-medium whitespace-nowrap" style={{ color: "var(--admin-text)", borderBottom: "0.5px solid var(--admin-table-border)" }}>{className}</td>
                      <td className="px-4 py-3 text-[12px] capitalize whitespace-nowrap" style={{ color: "var(--admin-text-muted)", borderBottom: "0.5px solid var(--admin-table-border)" }}>{discipline}</td>
                      <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: "var(--admin-text-muted)", borderBottom: "0.5px solid var(--admin-table-border)" }}>{semesterName}</td>
                      <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: "var(--admin-text-muted)", borderBottom: "0.5px solid var(--admin-table-border)" }}>
                        <div>
                          {session.day_of_week}{" "}
                          {formatTime(session.start_time)}
                          {session.end_time ? ` – ${formatTime(session.end_time)}` : ""}
                        </div>
                        {(session.start_date || session.end_date) && (
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                            {formatDate(session.start_date)}
                            {session.end_date ? ` – ${formatDate(session.end_date)}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ borderBottom: "0.5px solid var(--admin-table-border)" }}>
                        <span className={isFull ? "font-semibold" : ""} style={{ color: isFull ? "#802818" : "var(--admin-text-muted)" }}>
                          {enrolledCount} / {cap}
                        </span>
                        {isFull && (
                          <span className="ml-2 badge badge-error">Full</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" style={{ borderBottom: "0.5px solid var(--admin-table-border)" }}>
                        <button
                          onClick={() => openModal(session.id)}
                          className="text-[12px] font-medium"
                          style={{ color: "#C0392B", background: "none", border: "none", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>{/* end overflow-x-auto */}

          {/* Result count */}
          {hasFilters && (
            <div className="px-5 py-2.5 border-t text-[11px]" style={{ borderColor: "var(--admin-border-sub)", color: "var(--admin-text-faint)" }}>
              Showing {filteredSorted.length} of {rows.length} classes
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {cancellingId && cancellingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Cancel Class</h2>

            {/* Session details */}
            <div className="bg-neutral-50 rounded-lg px-4 py-3 text-sm text-neutral-700 space-y-1">
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
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Cancellation reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Instructor illness, facility issue, low enrollment…"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
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
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || !reason.trim()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Cancelling…" : "Cancel Class & Notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
