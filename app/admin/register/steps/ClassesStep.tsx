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
  amountStr: string;
};

export type ClassInfo = {
  classId: string;
  scheduleId: string;
  className: string;
  discipline: string;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type ClassesStepResult = {
  semesterId: string;
  semesterName: string;
  scheduleIds: string[];
  /** class_meetings.id for drop-in (per_session) registrations. */
  sessionIds: string[];
  classInfos: ClassInfo[];
  priceOverride?: number;
  /** Phase 3a: classTierId chosen per selected schedule (tiered classes only). */
  classTierIdsBySchedule?: Record<string, string>;
};

type Props = {
  dancerName: string;
  dancerId: string | null;
  familyId: string | null;
  isNewDancer: boolean;
  initialSemesterId: string;
  initialSemesterName: string;
  initialScheduleIds: string[];
  initialSessionIds?: string[];
  onNext: (result: ClassesStepResult) => void;
  onBack: () => void;
};

function isDropInClass(cls: AdminClassGroup): boolean {
  // Phase 3a: prefer the new per-schedule flag, fall back to legacy pricing_model.
  if (cls.isDropIn) return true;
  return cls.sessions.some((s) => s.pricingModel === "per_session");
}

/** Distinct schedule IDs for a class (one per `class_sections` row). */
function classScheduleIds(cls: AdminClassGroup): string[] {
  const ids = new Set<string>();
  for (const s of cls.sessions) {
    if (s.scheduleId) ids.add(s.scheduleId);
  }
  return [...ids];
}

/** A non-drop-in class with >1 schedule needs a per-schedule sub-picker. */
function isMultiScheduleClass(cls: AdminClassGroup): boolean {
  if (isDropInClass(cls)) return false;
  return classScheduleIds(cls).length > 1;
}

/** Pick a representative session for a schedule (used to render its label). */
function representativeSession(cls: AdminClassGroup, scheduleId: string): AdminSessionInfo | undefined {
  return cls.sessions.find((s) => s.scheduleId === scheduleId);
}

const DOW_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function fmtScheduleLabel(rep: AdminSessionInfo | undefined): string {
  if (!rep) return "Schedule";
  const dow = rep.dayOfWeek ? (DOW_SHORT[rep.dayOfWeek.toLowerCase()] ?? rep.dayOfWeek) : "";
  const start = rep.startTime ? rep.startTime.slice(0, 5) : "";
  const end = rep.endTime ? rep.endTime.slice(0, 5) : "";
  const time = start ? `${start}${end ? `–${end}` : ""}` : "";
  return [dow, time].filter(Boolean).join(" · ") || "Schedule";
}

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
  initialScheduleIds,
  initialSessionIds = [],
  onNext,
  onBack,
}: Props) {
  const [semesterId, setSemesterId] = useState(initialSemesterId);
  const [semesterName, setSemesterName] = useState(initialSemesterName);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [classes, setClasses] = useState<AdminClassGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(() => {
    return new Set<string>();
  });
  /** Drop-in (per-session) selection — class_meetings.id values. */
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    () => new Set<string>(initialSessionIds),
  );
  /** Per-schedule selection for multi-schedule (multi-tier) classes. */
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(
    () => new Set<string>(initialScheduleIds),
  );
  /** Phase 3a: chosen class_tiers.id per tiered class. Keyed by classId. */
  const [selectedTierIdByClass, setSelectedTierIdByClass] = useState<Record<string, string>>({});

  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  const [feeRows, setFeeRows] = useState<FeeRowState[]>([]);

  useEffect(() => {
    if (!initialSemesterId) {
      fetchActiveSemesters().then(setSemesters);
    }
  }, [initialSemesterId]);

  useEffect(() => {
    if (!semesterId) return;
    setLoading(true);
    fetchSemesterClasses(semesterId).then((data) => {
      setClasses(data);
      const restoredClassIds = new Set<string>();
      if (initialScheduleIds.length > 0) {
        data.forEach((cls) => {
          if (cls.sessions.some((s) => initialScheduleIds.includes(s.scheduleId))) {
            restoredClassIds.add(cls.classId);
          }
        });
      }
      // Drop-in classes: restore selection if any session id matches.
      if (initialSessionIds && initialSessionIds.length > 0) {
        data.forEach((cls) => {
          if (isDropInClass(cls) && cls.sessions.some((s) => initialSessionIds.includes(s.sessionId))) {
            restoredClassIds.add(cls.classId);
          }
        });
      }
      if (restoredClassIds.size > 0) setSelectedClassIds(restoredClassIds);
      setLoading(false);
    });
  }, [semesterId]);

  useEffect(() => {
    const scheduleIds = getSelectedScheduleIds();
    if (scheduleIds.length === 0 || !semesterId) {
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
          scheduleIds,
        },
      ],
      paymentPlanType: "pay_in_full",
    })
      .then((q) => {
        setQuote(q);
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

  function getSelectedScheduleIds(): string[] {
    const ids = new Set<string>();
    for (const cls of classes) {
      if (!selectedClassIds.has(cls.classId)) continue;
      // Drop-in classes use per-session selection (sessionIds), not scheduleIds.
      if (isDropInClass(cls)) continue;
      // Multi-schedule classes: only include the schedules the admin explicitly picked.
      if (isMultiScheduleClass(cls)) {
        for (const sid of classScheduleIds(cls)) {
          if (selectedScheduleIds.has(sid)) ids.add(sid);
        }
        continue;
      }
      // Single-schedule class: include its sole schedule.
      cls.sessions.forEach((s) => {
        if (s.scheduleId) ids.add(s.scheduleId);
      });
    }
    return [...ids];
  }

  function toggleScheduleSelection(cls: AdminClassGroup, scheduleId: string) {
    setSelectedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) {
        next.delete(scheduleId);
      } else {
        // Mutual exclusivity within a class: only one schedule per multi-schedule class.
        for (const sid of classScheduleIds(cls)) next.delete(sid);
        next.add(scheduleId);
      }
      return next;
    });
  }

  function getSelectedSessionIds(): string[] {
    const ids: string[] = [];
    for (const cls of classes) {
      if (!selectedClassIds.has(cls.classId)) continue;
      if (!isDropInClass(cls)) continue;
      cls.sessions.forEach((s) => {
        if (selectedSessionIds.has(s.sessionId)) ids.push(s.sessionId);
      });
    }
    return ids;
  }

  /** Sum drop-in prices across selected per-session sessions. */
  function getDropInPriceTotal(): number {
    let total = 0;
    for (const cls of classes) {
      if (!selectedClassIds.has(cls.classId) || !isDropInClass(cls)) continue;
      for (const s of cls.sessions) {
        if (selectedSessionIds.has(s.sessionId) && s.dropInPrice != null) {
          total += s.dropInPrice;
        }
      }
    }
    return total;
  }

  function toggleClass(classId: string) {
    const cls = classes.find((c) => c.classId === classId);
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
        // Clear any drop-in date selections under this class.
        if (cls && isDropInClass(cls)) {
          setSelectedSessionIds((p) => {
            const n = new Set(p);
            cls.sessions.forEach((s) => n.delete(s.sessionId));
            return n;
          });
        }
        // Clear any multi-schedule selections under this class.
        if (cls && isMultiScheduleClass(cls)) {
          setSelectedScheduleIds((p) => {
            const n = new Set(p);
            for (const sid of classScheduleIds(cls)) n.delete(sid);
            return n;
          });
        }
        // Clear tier choice (Phase 3a) when deselecting a tiered class.
        if (cls && cls.isTiered) {
          setSelectedTierIdByClass((prev) => {
            const next = { ...prev };
            delete next[classId];
            return next;
          });
        }
      } else {
        next.add(classId);
        // Auto-select default/first tier when picking a tiered class (Phase 3a).
        if (cls && cls.isTiered && cls.tiers.length > 0) {
          const defaultTier = cls.tiers.find((t) => t.isDefault) ?? cls.tiers[0];
          setSelectedTierIdByClass((prev) => ({ ...prev, [classId]: defaultTier.id }));
        }
      }
      return next;
    });
  }

  function toggleSession(sessionId: string) {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  const filteredLineItems: LineItem[] = quote
    ? quote.lineItems.filter((li) => li.amount !== 0)
    : [];

  function computeCustomTotal(): number | null {
    if (!quote || feeRows.length === 0) return null;
    const isModified = feeRows.some(
      (row, i) =>
        !row.included ||
        parseFloat(row.amountStr) !== Math.abs(filteredLineItems[i]?.amount ?? 0)
    );
    if (!isModified) return null;
    let total = 0;
    feeRows.forEach((row, i) => {
      if (!row.included) return;
      const li = filteredLineItems[i];
      if (!li) return;
      const amt = parseFloat(row.amountStr) || 0;
      total += li.amount < 0 ? -amt : amt;
    });
    return Math.max(0, total);
  }

  function handleNext() {
    if (!semesterId || selectedClassIds.size === 0) return;
    const scheduleIds = getSelectedScheduleIds();
    const sessionIds = getSelectedSessionIds();
    if (scheduleIds.length === 0 && sessionIds.length === 0) return;

    const classInfos: ClassInfo[] = classes
      .filter((c) => selectedClassIds.has(c.classId))
      .map((c) => {
        const rep = c.sessions[0];
        return {
          classId: c.classId,
          scheduleId: rep?.scheduleId ?? "",
          className: c.name,
          discipline: c.discipline,
          dayOfWeek: rep?.dayOfWeek ?? null,
          startTime: rep?.startTime ?? null,
          endTime: rep?.endTime ?? null,
        };
      });

    const customTotal = computeCustomTotal();
    const dropInTotal = getDropInPriceTotal();
    // Mixed totals: if there are drop-in selections, override the engine total to
    // include them. Pure drop-in: priceOverride = drop-in sum.
    let priceOverride: number | undefined = customTotal ?? undefined;
    if (sessionIds.length > 0) {
      const engineTotal = customTotal ?? quote?.grandTotal ?? 0;
      priceOverride = engineTotal + dropInTotal;
    }

    // Phase 3a: build per-schedule tier map for tiered classes.
    const classTierIdsBySchedule: Record<string, string> = {};
    for (const sid of scheduleIds) {
      const owner = classes.find((c) =>
        c.sessions.some((s) => s.scheduleId === sid),
      );
      if (!owner || !owner.isTiered) continue;
      const tierId = selectedTierIdByClass[owner.classId];
      if (tierId) classTierIdsBySchedule[sid] = tierId;
    }

    onNext({
      semesterId,
      semesterName,
      scheduleIds,
      sessionIds,
      classInfos,
      priceOverride,
      classTierIdsBySchedule:
        Object.keys(classTierIdsBySchedule).length > 0 ? classTierIdsBySchedule : undefined,
    });
  }

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
  // Drop-in classes require at least one session selected before continuing.
  const allSelectedDropInsHaveDates = selectedClasses
    .filter(isDropInClass)
    .every((cls) => cls.sessions.some((s) => selectedSessionIds.has(s.sessionId)));
  // Multi-schedule classes require exactly one schedule selected.
  const allSelectedMultiSchedulesHaveTier = selectedClasses
    .filter(isMultiScheduleClass)
    .every((cls) => classScheduleIds(cls).some((sid) => selectedScheduleIds.has(sid)));
  const canProceed =
    semesterId !== "" &&
    selectedClassIds.size > 0 &&
    allSelectedDropInsHaveDates &&
    allSelectedMultiSchedulesHaveTier;
  const customTotal = computeCustomTotal();
  const displayTotal = customTotal !== null ? customTotal : (quote?.grandTotal ?? 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
      {/* Main content */}
      <div className="space-y-5">
        {/* Semester picker (only when not pre-selected) */}
        {!initialSemesterId && (
          <div className="bg-white border border-[#DDD9D2] rounded-xl p-5">
            <label className="block text-sm font-semibold text-[#201D18] mb-2">
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
              className="w-full px-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23] bg-white"
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
          <div className="text-sm text-[#9E9890] py-8 text-center">Loading classes…</div>
        ) : !semesterId ? (
          <div className="text-sm text-[#9E9890] py-8 text-center">
            Select a semester to see available classes.
          </div>
        ) : classes.length === 0 ? (
          <div className="text-sm text-[#9E9890] py-8 text-center">
            No classes found for this semester.
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9890] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, discipline, or division…"
                className="w-full pl-9 pr-9 py-2.5 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23] bg-white placeholder:text-[#9E9890]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9890] hover:text-[#736D65] transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {filteredClasses.length === 0 ? (
              <div className="text-sm text-[#9E9890] py-8 text-center">
                No classes match &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <div className="max-h-[580px] overflow-y-auto space-y-5 pr-0.5">
                {sortedDivisions.map((division) => (
                  <div key={division}>
                    <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide mb-2">
                      {capitalizeFirst(division.replace("_", " "))}
                    </p>
                    <div className="space-y-2">
                      {grouped[division].map((cls) => (
                        <ClassCard
                          key={cls.classId}
                          cls={cls}
                          isSelected={selectedClassIds.has(cls.classId)}
                          selectedSessionIds={selectedSessionIds}
                          selectedScheduleIds={selectedScheduleIds}
                          selectedTierId={selectedTierIdByClass[cls.classId] ?? null}
                          onToggle={toggleClass}
                          onToggleSession={toggleSession}
                          onToggleSchedule={toggleScheduleSelection}
                          onSelectTier={(classId, tierId) =>
                            setSelectedTierIdByClass((prev) => ({ ...prev, [classId]: tierId }))
                          }
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
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#736D65] hover:text-[#201D18] transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#8E2A23] text-white rounded-xl text-sm font-medium hover:bg-[#7A2420] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-3 lg:sticky lg:top-6">
        {/* Selected classes */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide">
            Selected for {dancerName || "dancer"}
          </p>

          {selectedClassIds.size === 0 ? (
            <p className="text-sm text-[#9E9890]">No classes selected yet.</p>
          ) : (
            <ul className="space-y-3">
              {selectedClasses.map((cls) => (
                <li key={cls.classId} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-[#201D18] leading-snug">{cls.name}</p>
                    <button
                      onClick={() => toggleClass(cls.classId)}
                      className="shrink-0 text-[#9E9890] hover:text-red-400 transition mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[#9E9890] capitalize mt-0.5">{cls.discipline}</p>
                  {cls.location && (
                    <p className="text-xs text-[#9E9890] mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {cls.location}
                    </p>
                  )}
                  {(cls.startDate || cls.endDate) && (
                    <p className="text-xs text-[#9E9890] mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {fmtDate(cls.startDate)} – {fmtDate(cls.endDate)}
                    </p>
                  )}
                  {cls.sessions.length > 0 && (
                    <p className="text-xs text-[#9E9890] mt-0.5 flex items-center gap-1">
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
            <p className="text-xs text-[#736D65] pt-1 border-t border-[#DDD9D2]">
              {selectedClassIds.size} class{selectedClassIds.size !== 1 ? "es" : ""} selected
            </p>
          )}
        </div>

        {/* Pricing — per-line-item editor */}
        {selectedClassIds.size > 0 && (
          <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide">
                Fees &amp; Pricing
              </p>
              {customTotal !== null && (
                <span className="text-xs text-mauve-text font-medium">Customized</span>
              )}
            </div>

            {pricingLoading ? (
              <p className="text-xs text-[#9E9890]">Calculating…</p>
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
                        className="w-3.5 h-3.5 rounded accent-[#8E2A23] shrink-0"
                      />
                      {/* Label */}
                      <span
                        className={`flex-1 text-xs truncate ${
                          row.included ? "text-[#736D65]" : "text-[#9E9890] line-through"
                        }`}
                      >
                        {li.label}
                      </span>
                      {/* Amount — editable */}
                      <div className="relative shrink-0 w-20">
                        <span
                          className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${
                            isDiscount ? "text-green-500" : "text-[#9E9890]"
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
                          className={`w-full pl-6 pr-1.5 py-1 border rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#8E2A23] disabled:opacity-40 disabled:bg-[#F7F5F2] ${
                            isDiscount
                              ? "border-mint text-mint-text"
                              : "border-[#DDD9D2] text-[#201D18]"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Total row */}
                <div
                  className={`flex justify-between gap-3 pt-2 border-t font-semibold ${
                    customTotal !== null ? "border-mauve" : "border-[#DDD9D2]"
                  }`}
                >
                  <span className="text-xs text-[#201D18]">Total</span>
                  <span
                    className={`text-xs ${
                      customTotal !== null ? "text-mauve-text" : "text-[#201D18]"
                    }`}
                  >
                    {fmt$$(displayTotal)}
                  </span>
                </div>

                {customTotal !== null && (
                  <p className="text-xs text-mauve-text">
                    Custom total carries into checkout.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#9E9890]">Pricing unavailable.</p>
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
  selectedSessionIds,
  selectedScheduleIds,
  selectedTierId,
  onToggle,
  onToggleSession,
  onToggleSchedule,
  onSelectTier,
}: {
  cls: AdminClassGroup;
  isSelected: boolean;
  selectedSessionIds: Set<string>;
  selectedScheduleIds: Set<string>;
  selectedTierId: string | null;
  onToggle: (classId: string) => void;
  onToggleSession: (sessionId: string) => void;
  onToggleSchedule: (cls: AdminClassGroup, scheduleId: string) => void;
  onSelectTier: (classId: string, tierId: string) => void;
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
  const isDropIn = isDropInClass(cls);
  const isMulti = isMultiScheduleClass(cls);

  // Sort drop-in dates chronologically.
  const dropInSessions = isDropIn
    ? [...cls.sessions]
        .filter((s) => s.scheduleDate)
        .sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""))
    : [];

  // For multi-tier classes, list each schedule once.
  const tierSchedules = isMulti ? classScheduleIds(cls) : [];

  return (
    <div
      className={`w-full rounded-xl border transition ${
        isSelected
          ? "bg-[#FDF0EF] border-[#C8A09D]"
          : isFull
          ? "opacity-50 bg-white border-[#DDD9D2]"
          : "bg-white border-[#DDD9D2] hover:bg-[#F7F5F2] hover:border-[#9E9890]"
      }`}
    >
      <button
        type="button"
        onClick={() => !isFull && onToggle(cls.classId)}
        disabled={isFull && !isSelected}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left disabled:cursor-not-allowed"
      >
        {/* Checkbox */}
        <div
          className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border transition ${
            isSelected ? "bg-[#8E2A23] border-[#8E2A23]" : "border-[#DDD9D2] bg-white"
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>

        {/* Class info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#201D18] leading-snug">{cls.name}</p>
            {isDropIn && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#FBE6D8] text-[#8E5A23]">
                Drop-in
              </span>
            )}
            {cls.isTiered && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#E8E1F5] text-[#5A3A80]">
                Tiered
              </span>
            )}
            {isMulti && !cls.isTiered && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#E8E1F5] text-[#5A3A80]">
                Multi-schedule
              </span>
            )}
          </div>
          <p className="text-xs text-[#9E9890] capitalize">{cls.discipline}</p>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {(cls.minAge || cls.maxAge) && (
              <span className="text-xs text-[#736D65]">
                Ages {cls.minAge ?? "?"}–{cls.maxAge ?? "?"}
              </span>
            )}
            {cls.location && (
              <span className="text-xs text-[#736D65] flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />
                {cls.location}
              </span>
            )}
            {!isDropIn && (cls.startDate || cls.endDate) && (
              <span className="text-xs text-[#736D65] flex items-center gap-0.5">
                <Calendar className="w-3 h-3" />
                {fmtDate(cls.startDate)} – {fmtDate(cls.endDate)}
              </span>
            )}
          </div>
        </div>

        {/* Capacity / full badge */}
        <div className="shrink-0 text-right self-center">
          {isFull ? (
            <span className="flex items-center gap-1 text-xs text-mauve-text">
              <AlertCircle className="w-3 h-3" />
              Full
            </span>
          ) : !isDropIn && totalCapacity > 0 ? (
            <span className="text-xs text-[#9E9890]">
              {totalEnrolled}/{totalCapacity}
            </span>
          ) : null}
        </div>
      </button>

      {/* Drop-in date selector — shown when class is selected */}
      {isSelected && isDropIn && (
        <div className="border-t border-[#DDD9D2] px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide mb-1">
            Pick dates ({selectedSessionIds && cls.sessions.filter((s) => selectedSessionIds.has(s.sessionId)).length} selected)
          </p>
          {dropInSessions.length === 0 ? (
            <p className="text-xs text-[#9E9890] italic">No dates available.</p>
          ) : (
            <div className="space-y-1">
              {dropInSessions.map((s) => {
                const sessionFull = s.capacity != null && s.enrolled >= s.capacity;
                const checked = selectedSessionIds.has(s.sessionId);
                const remaining = s.capacity != null ? Math.max(0, s.capacity - s.enrolled) : null;
                return (
                  <label
                    key={s.sessionId}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                      sessionFull
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={sessionFull && !checked}
                      onChange={() => onToggleSession(s.sessionId)}
                      className="w-3.5 h-3.5 rounded accent-[#8E2A23] shrink-0"
                    />
                    <span className="flex-1 text-[#201D18]">
                      {fmtDate(s.scheduleDate)}
                      {s.startTime && (
                        <span className="text-[#9E9890] ml-1">
                          · {s.startTime.slice(0, 5)}
                          {s.endTime ? `–${s.endTime.slice(0, 5)}` : ""}
                        </span>
                      )}
                    </span>
                    {s.dropInPrice != null && (
                      <span className="text-[#736D65] tabular-nums">
                        {fmt$$(s.dropInPrice)}
                      </span>
                    )}
                    {sessionFull ? (
                      <span className="text-mauve-text">Full</span>
                    ) : remaining != null ? (
                      <span className="text-[#9E9890]">{remaining} left</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Multi-tier schedule selector — one schedule per class, mutually exclusive */}
      {isSelected && isMulti && (
        <div className="border-t border-[#DDD9D2] px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide mb-1">
            Pick one option
          </p>
          <div className="space-y-1">
            {tierSchedules.map((sid) => {
              const rep = representativeSession(cls, sid);
              const checked = selectedScheduleIds.has(sid);
              const cap = rep?.capacity ?? null;
              const enrolled = rep?.enrolled ?? 0;
              const scheduleFull = cap != null && enrolled >= cap;
              const remaining = cap != null ? Math.max(0, cap - enrolled) : null;
              return (
                <label
                  key={sid}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                    scheduleFull && !checked
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name={`tier-${cls.classId}`}
                    checked={checked}
                    disabled={scheduleFull && !checked}
                    onChange={() => onToggleSchedule(cls, sid)}
                    className="w-3.5 h-3.5 accent-[#8E2A23] shrink-0"
                  />
                  <span className="flex-1 text-[#201D18]">{fmtScheduleLabel(rep)}</span>
                  {rep?.location && (
                    <span className="text-[#9E9890]">{rep.location}</span>
                  )}
                  {scheduleFull ? (
                    <span className="text-mauve-text">Full</span>
                  ) : remaining != null ? (
                    <span className="text-[#9E9890]">{remaining} left</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Phase 3a: tier picker — shown when class is tiered */}
      {isSelected && cls.isTiered && cls.tiers.length > 0 && (
        <div className="border-t border-[#DDD9D2] px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide mb-1">
            Pick a tier
          </p>
          <div className="space-y-1">
            {cls.tiers.map((tier) => {
              const checked = selectedTierId === tier.id;
              const timeLabel =
                tier.startTime && tier.endTime
                  ? `${tier.startTime}–${tier.endTime}`
                  : null;
              return (
                <label
                  key={tier.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-white"
                >
                  <input
                    type="radio"
                    name={`class-tier-${cls.classId}`}
                    checked={checked}
                    onChange={() => onSelectTier(cls.classId, tier.id)}
                    className="w-3.5 h-3.5 accent-primary-600 shrink-0"
                  />
                  <span className="flex-1 text-[#201D18] font-medium">{tier.label}</span>
                  {timeLabel && <span className="text-[#9E9890]">{timeLabel}</span>}
                  {tier.price != null && (
                    <span className="text-[#736D65] tabular-nums">{fmt$$(tier.price)}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
