"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronRight, ChevronLeft, Check, AlertCircle, MapPin, Calendar, Users, X, Search } from "lucide-react";
import {
  fetchSemesterClasses,
  type AdminClassGroup,
  type AdminSessionInfo,
} from "../actions/fetchSemesterClasses";
import { fetchActiveSemesters, type SemesterOption } from "../actions/fetchActiveSemesters";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import type { PricingQuote, LineItem } from "@/types";

/** Per-row state in the fee editor */
type FeeRowState = {
  included: boolean;
  amountStr: string; // string for controlled input; parsed on use
};

export type ClassesStepResult = {
  semesterId: string;
  semesterName: string;
  sessionIds: string[];
  sessionInfos: AdminSessionInfo[];
  priceOverride?: number;
};

type Props = {
  dancerName: string;
  dancerId: string | null;
  familyId: string | null;
  isNewDancer: boolean;
  initialSemesterId: string;
  initialSemesterName: string;
  initialSessionIds: string[];
  onNext: (result: ClassesStepResult) => void;
  onBack: () => void;
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function fmt$$(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const DIVISION_ORDER = ["junior", "senior", "early_childhood", "competition", "technique", "pointe"];

export default function ClassesStep({
  dancerName,
  dancerId,
  familyId,
  isNewDancer,
  initialSemesterId,
  initialSemesterName,
  initialSessionIds,
  onNext,
  onBack,
}: Props) {
  const [semesterId, setSemesterId] = useState(initialSemesterId);
  const [semesterName, setSemesterName] = useState(initialSemesterName);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [classes, setClasses] = useState<AdminClassGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  // Class-level selection (classId → Set of sessionIds are auto-selected)
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(() => {
    // Restore previously selected classes from initialSessionIds
    return new Set<string>();
  });

  // Pricing preview
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // Per-line-item fee editor state (index-aligned with filteredLineItems derived from quote)
  const [feeRows, setFeeRows] = useState<FeeRowState[]>([]);

  // Load semester list if no pre-selected semester
  useEffect(() => {
    if (!initialSemesterId) {
      fetchActiveSemesters().then(setSemesters);
    }
  }, [initialSemesterId]);

  // Load classes when semesterId is set; restore prior selections
  useEffect(() => {
    if (!semesterId) return;
    setLoading(true);
    fetchSemesterClasses(semesterId).then((data) => {
      setClasses(data);
      // Restore selections from initialSessionIds
      if (initialSessionIds.length > 0) {
        const restoredClassIds = new Set<string>();
        data.forEach((cls) => {
          if (cls.sessions.some((s) => initialSessionIds.includes(s.sessionId))) {
            restoredClassIds.add(cls.classId);
          }
        });
        setSelectedClassIds(restoredClassIds);
      }
      setLoading(false);
    });
  }, [semesterId]);

  // Compute pricing preview whenever class selection changes
  useEffect(() => {
    const sessionIds = getSelectedSessionIds();
    if (sessionIds.length === 0 || !semesterId) {
      setQuote(null);
      setFeeRows([]);
      return;
    }
    setPricingLoading(true);
    computePricingQuote({
      semesterId,
      familyId: familyId ?? undefined,
      enrollments: [
        {
          dancerId: dancerId ?? NIL_UUID,
          dancerName: isNewDancer ? dancerName : undefined,
          sessionIds,
        },
      ],
      paymentPlanType: "pay_in_full",
    })
      .then((q) => {
        setQuote(q);
        // Initialise fee rows aligned with the non-zero line items
        setFeeRows(
          q.lineItems
            .filter((li) => li.amount !== 0)
            .map((li) => ({
              included: true,
              amountStr: Math.abs(li.amount).toFixed(2),
            }))
        );
      })
      .catch(() => { setQuote(null); setFeeRows([]); })
      .finally(() => setPricingLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassIds, semesterId, dancerId, familyId]);

  function getSelectedSessionIds(): string[] {
    const ids: string[] = [];
    for (const cls of classes) {
      if (selectedClassIds.has(cls.classId)) {
        cls.sessions.forEach((s) => ids.push(s.sessionId));
      }
    }
    return ids;
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  }

  /** The non-zero line items that populate the fee editor */
  const filteredLineItems: LineItem[] = quote
    ? quote.lineItems.filter((li) => li.amount !== 0)
    : [];

  /** Computed custom total from feeRows; null = use server grandTotal */
  function computeCustomTotal(): number | null {
    if (!quote || feeRows.length === 0) return null;
    const isModified = feeRows.some(
      (row, i) =>
        !row.included ||
        parseFloat(row.amountStr) !== Math.abs(filteredLineItems[i]?.amount ?? 0)
    );
    if (!isModified) return null; // no changes — use server total
    let total = 0;
    feeRows.forEach((row, i) => {
      if (!row.included) return;
      const li = filteredLineItems[i];
      if (!li) return;
      const amt = parseFloat(row.amountStr) || 0;
      total += li.amount < 0 ? -amt : amt; // preserve sign direction
    });
    return Math.max(0, total);
  }

  function handleNext() {
    if (!semesterId || selectedClassIds.size === 0) return;
    const sessionIds = getSelectedSessionIds();
    const sessionInfos = classes
      .filter((c) => selectedClassIds.has(c.classId))
      .flatMap((c) => c.sessions);

    const customTotal = computeCustomTotal();

    onNext({
      semesterId,
      semesterName,
      sessionIds,
      sessionInfos,
      priceOverride: customTotal ?? undefined,
    });
  }

  // Filter + group classes by division
  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.discipline ?? "").toLowerCase().includes(q) ||
        (c.division ?? "").toLowerCase().replace("_", " ").includes(q)
    );
  }, [classes, searchQuery]);

  const grouped = filteredClasses.reduce<Record<string, AdminClassGroup[]>>((acc, c) => {
    const key = c.division ?? "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const sortedDivisions = Object.keys(grouped).sort((a, b) => {
    const ai = DIVISION_ORDER.indexOf(a);
    const bi = DIVISION_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const selectedClasses = classes.filter((c) => selectedClassIds.has(c.classId));
  const canProceed = semesterId !== "" && selectedClassIds.size > 0;
  const customTotal = computeCustomTotal();
  const displayTotal = customTotal !== null ? customTotal : (quote?.grandTotal ?? 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
      {/* Main content */}
      <div className="space-y-5">
        {/* Semester picker (only when not pre-selected) */}
        {!initialSemesterId && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Semester
            </label>
            <select
              value={semesterId}
              onChange={(e) => {
                const id = e.target.value;
                const s = semesters.find((s) => s.id === id);
                setSemesterId(id);
                setSemesterName(s?.name ?? "");
                setSelectedClassIds(new Set());
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select a semester…</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === "draft" && " (Draft)"}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Class list */}
        {loading ? (
          <div className="text-sm text-slate-400 py-8 text-center">Loading classes…</div>
        ) : !semesterId ? (
          <div className="text-sm text-slate-400 py-8 text-center">
            Select a semester to see available classes.
          </div>
        ) : classes.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center">
            No classes found for this semester.
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, discipline, or division…"
                className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {filteredClasses.length === 0 ? (
              <div className="text-sm text-slate-400 py-8 text-center">
                No classes match &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <div className="max-h-[580px] overflow-y-auto space-y-5 pr-0.5">
                {sortedDivisions.map((division) => (
                  <div key={division}>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      {capitalizeFirst(division.replace("_", " "))}
                    </p>
                    <div className="space-y-2">
                      {grouped[division].map((cls) => (
                        <ClassCard
                          key={cls.classId}
                          cls={cls}
                          isSelected={selectedClassIds.has(cls.classId)}
                          onToggle={toggleClass}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-3 lg:sticky lg:top-6">
        {/* Selected classes */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Selected for {dancerName || "dancer"}
          </p>

          {selectedClassIds.size === 0 ? (
            <p className="text-sm text-slate-400">No classes selected yet.</p>
          ) : (
            <ul className="space-y-3">
              {selectedClasses.map((cls) => (
                <li key={cls.classId} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-700 leading-snug">{cls.name}</p>
                    <button
                      onClick={() => toggleClass(cls.classId)}
                      className="shrink-0 text-slate-300 hover:text-red-400 transition mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 capitalize mt-0.5">{cls.discipline}</p>
                  {cls.location && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {cls.location}
                    </p>
                  )}
                  {(cls.startDate || cls.endDate) && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {fmtDate(cls.startDate)} – {fmtDate(cls.endDate)}
                    </p>
                  )}
                  {cls.sessions.length > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3 shrink-0" />
                      {cls.sessions.reduce((n, s) => n + s.enrolled, 0)}/
                      {cls.sessions[0]?.capacity ?? "?"} enrolled
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {selectedClassIds.size > 0 && (
            <p className="text-xs text-slate-500 pt-1 border-t border-gray-100">
              {selectedClassIds.size} class{selectedClassIds.size !== 1 ? "es" : ""} selected
            </p>
          )}
        </div>

        {/* Pricing — per-line-item editor */}
        {selectedClassIds.size > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Fees &amp; Pricing
              </p>
              {customTotal !== null && (
                <span className="text-xs text-amber-600 font-medium">Customized</span>
              )}
            </div>

            {pricingLoading ? (
              <p className="text-xs text-slate-400">Calculating…</p>
            ) : filteredLineItems.length > 0 ? (
              <div className="space-y-2">
                {filteredLineItems.map((li, i) => {
                  const row = feeRows[i];
                  if (!row) return null;
                  const isDiscount = li.amount < 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) =>
                          setFeeRows((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], included: e.target.checked };
                            return next;
                          })
                        }
                        className="w-3.5 h-3.5 rounded accent-blue-600 shrink-0"
                      />
                      {/* Label */}
                      <span
                        className={`flex-1 text-xs truncate ${
                          row.included ? "text-slate-600" : "text-slate-300 line-through"
                        }`}
                      >
                        {li.label}
                      </span>
                      {/* Amount — editable */}
                      <div className="relative shrink-0 w-20">
                        <span
                          className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${
                            isDiscount ? "text-green-500" : "text-slate-400"
                          }`}
                        >
                          {isDiscount ? "-$" : "$"}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!row.included}
                          value={row.amountStr}
                          onChange={(e) =>
                            setFeeRows((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], amountStr: e.target.value };
                              return next;
                            })
                          }
                          className={`w-full pl-6 pr-1.5 py-1 border rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40 disabled:bg-gray-50 ${
                            isDiscount
                              ? "border-green-200 text-green-700"
                              : "border-gray-200 text-slate-700"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Total row */}
                <div
                  className={`flex justify-between gap-3 pt-2 border-t font-semibold ${
                    customTotal !== null ? "border-amber-200" : "border-gray-100"
                  }`}
                >
                  <span className="text-xs text-slate-700">Total</span>
                  <span
                    className={`text-xs ${
                      customTotal !== null ? "text-amber-700" : "text-slate-800"
                    }`}
                  >
                    {fmt$$(displayTotal)}
                  </span>
                </div>

                {customTotal !== null && (
                  <p className="text-xs text-amber-600">
                    Custom total carries into checkout.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Pricing unavailable.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassCard({
  cls,
  isSelected,
  onToggle,
}: {
  cls: AdminClassGroup;
  isSelected: boolean;
  onToggle: (classId: string) => void;
}) {
  const totalCapacity = cls.sessions.reduce(
    (sum, s) => (s.capacity != null ? sum + s.capacity : sum),
    0
  );
  const totalEnrolled = cls.sessions.reduce((sum, s) => sum + s.enrolled, 0);
  const isFull =
    cls.sessions.length > 0 &&
    cls.sessions.every(
      (s) => s.capacity !== null && s.enrolled >= s.capacity
    );

  return (
    <button
      onClick={() => !isFull && onToggle(cls.classId)}
      disabled={isFull && !isSelected}
      className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left border transition ${
        isSelected
          ? "bg-blue-50 border-blue-300"
          : isFull
          ? "opacity-50 cursor-not-allowed bg-white border-gray-200"
          : "bg-white border-gray-200 hover:bg-slate-50 hover:border-gray-300"
      }`}
    >
      {/* Checkbox */}
      <div
        className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border transition ${
          isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* Class info */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{cls.name}</p>
        <p className="text-xs text-slate-400 capitalize">{cls.discipline}</p>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {/* Age range */}
          {(cls.minAge || cls.maxAge) && (
            <span className="text-xs text-slate-500">
              Ages {cls.minAge ?? "?"}–{cls.maxAge ?? "?"}
            </span>
          )}
          {/* Location */}
          {cls.location && (
            <span className="text-xs text-slate-500 flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {cls.location}
            </span>
          )}
          {/* Date range */}
          {(cls.startDate || cls.endDate) && (
            <span className="text-xs text-slate-500 flex items-center gap-0.5">
              <Calendar className="w-3 h-3" />
              {fmtDate(cls.startDate)} – {fmtDate(cls.endDate)}
            </span>
          )}
        </div>
      </div>

      {/* Capacity / full badge */}
      <div className="shrink-0 text-right self-center">
        {isFull ? (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3 h-3" />
            Full
          </span>
        ) : totalCapacity > 0 ? (
          <span className="text-xs text-slate-400">
            {totalEnrolled}/{totalCapacity}
          </span>
        ) : null}
      </div>
    </button>
  );
}
