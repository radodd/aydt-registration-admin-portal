"use client";

import {
  DraftClass,
  DraftClassRequirement,
  DraftClassSchedule,
  DraftSchedulePriceTier,
  DraftSessionExcludedDate,
  DraftSessionOption,
  SessionsStepProps,
} from "@/types";
import { useState } from "react";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DISCIPLINES = [
  { value: "ballet", label: "Ballet" },
  { value: "tap", label: "Tap" },
  { value: "broadway", label: "Broadway" },
  { value: "hip_hop", label: "Hip Hop" },
  { value: "contemporary", label: "Contemporary" },
  { value: "technique", label: "Technique" },
  { value: "pointe", label: "Pointe" },
  { value: "jazz", label: "Jazz" },
  { value: "lyrical", label: "Lyrical" },
  { value: "acro", label: "Acro" },
];

const DIVISIONS = [
  { value: "early_childhood", label: "Early Childhood" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "competition", label: "Competition" },
];

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

/* -------------------------------------------------------------------------- */
/* Empty scaffolds                                                            */
/* -------------------------------------------------------------------------- */

function emptySchedule(): DraftClassSchedule {
  return {
    _clientKey: Date.now().toString() + Math.random(),
    daysOfWeek: [],
    startTime: "",
    endTime: "",
    startDate: "",
    endDate: "",
    location: "",
    instructorName: "",
    capacity: undefined,
    registrationCloseAt: null,
    registrationOpenAt: null,
    genderRestriction: null,
    urgencyThreshold: null,
    pricingModel: "full_schedule",
    priceTiers: [],
    dropInPrice: null,
    options: [],
    excludedDates: [],
  };
}

function emptyClass(): DraftClass {
  return {
    name: "",
    displayName: "",
    discipline: "ballet",
    division: "junior",
    level: "",
    description: "",
    minAge: undefined,
    maxAge: undefined,
    minGrade: undefined,
    maxGrade: undefined,
    isCompetitionTrack: false,
    requiresTeacherRec: false,
    schedules: [emptySchedule()],
  };
}

/* -------------------------------------------------------------------------- */
/* Generated sessions preview helper                                          */
/* -------------------------------------------------------------------------- */

function computeGeneratedCount(schedule: DraftClassSchedule): number {
  if (
    !schedule.startDate ||
    !schedule.endDate ||
    schedule.daysOfWeek.length === 0
  )
    return 0;
  const start = new Date(schedule.startDate + "T00:00:00");
  const end = new Date(schedule.endDate + "T00:00:00");
  if (end < start) return 0;

  const excludedSet = new Set(
    (schedule.excludedDates ?? []).map((d) => d.date),
  );
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dayName = dayNames[cur.getDay()];
    if (schedule.daysOfWeek.includes(dayName)) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (!excludedSet.has(dateStr)) count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SessionsStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
}: SessionsStepProps) {
  const [classes, setClasses] = useState<DraftClass[]>(
    state.sessions?.classes ?? [],
  );
  const [expandedClassIdx, setExpandedClassIdx] = useState<number | null>(
    classes.length > 0 ? 0 : null,
  );

  /* ---------------------------------------------------------------------- */
  /* Class-level handlers                                                    */
  /* ---------------------------------------------------------------------- */

  function handleAddClass() {
    const updated = [...classes, emptyClass()];
    setClasses(updated);
    setExpandedClassIdx(updated.length - 1);
  }

  function handleRemoveClass(idx: number) {
    const updated = classes.filter((_, i) => i !== idx);
    setClasses(updated);
    if (expandedClassIdx === idx) setExpandedClassIdx(null);
  }

  function handleUpdateClass(idx: number, patch: Partial<DraftClass>) {
    setClasses((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Schedule-level handlers                                                 */
  /* ---------------------------------------------------------------------- */

  function handleAddSchedule(classIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? { ...c, schedules: [...(c.schedules ?? []), emptySchedule()] }
          : c,
      ),
    );
  }

  function handleRemoveSchedule(classIdx: number, scheduleIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? {
              ...c,
              schedules: (c.schedules ?? []).filter(
                (_, si) => si !== scheduleIdx,
              ),
            }
          : c,
      ),
    );
  }

  function handleUpdateSchedule(
    classIdx: number,
    scheduleIdx: number,
    patch: Partial<DraftClassSchedule>,
  ) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? {
              ...c,
              schedules: (c.schedules ?? []).map((s, si) =>
                si === scheduleIdx ? { ...s, ...patch } : s,
              ),
            }
          : c,
      ),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Submit                                                                  */
  /* ---------------------------------------------------------------------- */

  function handleSubmit() {
    dispatch({ type: "SET_SESSIONS", payload: { classes } });
    onNext();
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Classes &amp; Schedules
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Create the classes offered this semester. Each class can have one or
          more schedule blocks (day/time/date range). The system generates
          individual sessions for each calendar date automatically.
        </p>
      </div>

      {isLocked && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This semester has active registrations. Classes and schedules are
          locked.
        </div>
      )}

      {/* Class list */}
      <div className="space-y-4">
        {classes.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">
              No classes yet. Click &ldquo;Add Class&rdquo; to get started.
            </p>
          </div>
        )}

        {classes.map((cls, classIdx) => (
          <ClassCard
            key={classIdx}
            cls={cls}
            classIdx={classIdx}
            isExpanded={expandedClassIdx === classIdx}
            isLocked={isLocked}
            onToggle={() =>
              setExpandedClassIdx(
                expandedClassIdx === classIdx ? null : classIdx,
              )
            }
            onUpdateClass={(patch) => handleUpdateClass(classIdx, patch)}
            onRemoveClass={() => handleRemoveClass(classIdx)}
            onAddSchedule={() => handleAddSchedule(classIdx)}
            onUpdateSchedule={(scheduleIdx, patch) =>
              handleUpdateSchedule(classIdx, scheduleIdx, patch)
            }
            onRemoveSchedule={(scheduleIdx) =>
              handleRemoveSchedule(classIdx, scheduleIdx)
            }
            onAddRequirement={(req) =>
              handleUpdateClass(classIdx, {
                requirements: [...(cls.requirements ?? []), req],
              })
            }
            onRemoveRequirement={(reqIdx) =>
              handleUpdateClass(classIdx, {
                requirements: (cls.requirements ?? []).filter(
                  (_, i) => i !== reqIdx,
                ),
              })
            }
          />
        ))}
      </div>

      {/* Add class button */}
      {!isLocked && (
        <button
          type="button"
          onClick={handleAddClass}
          className="w-full py-3 rounded-xl border-2 border-dashed border-indigo-300 text-sm font-medium text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition"
        >
          + Add Class
        </button>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ClassCard                                                                   */
/* -------------------------------------------------------------------------- */

function ClassCard({
  cls,
  classIdx,
  isExpanded,
  isLocked,
  onToggle,
  onUpdateClass,
  onRemoveClass,
  onAddSchedule,
  onUpdateSchedule,
  onRemoveSchedule,
  onAddRequirement,
  onRemoveRequirement,
}: {
  cls: DraftClass;
  classIdx: number;
  isExpanded: boolean;
  isLocked: boolean;
  onToggle: () => void;
  onUpdateClass: (patch: Partial<DraftClass>) => void;
  onRemoveClass: () => void;
  onAddSchedule: () => void;
  onUpdateSchedule: (idx: number, patch: Partial<DraftClassSchedule>) => void;
  onRemoveSchedule: (idx: number) => void;
  onAddRequirement: (req: DraftClassRequirement) => void;
  onRemoveRequirement: (idx: number) => void;
}) {
  const schedules = cls.schedules ?? [];
  const scheduleCount = schedules.length;
  const disciplineLabel =
    DISCIPLINES.find((d) => d.value === cls.discipline)?.label ??
    cls.discipline;
  const divisionLabel =
    DIVISIONS.find((d) => d.value === cls.division)?.label ?? cls.division;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Card header — always visible */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg
            className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {cls.name || (
                <span className="text-gray-400 font-normal italic">
                  Untitled class
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {disciplineLabel} · {divisionLabel}
              {cls.level ? ` · Level ${cls.level}` : ""}
              {" · "}
              {scheduleCount} schedule block{scheduleCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {!isLocked && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveClass();
            }}
            className="shrink-0 text-sm text-red-500 hover:text-red-700 transition ml-4"
          >
            Remove
          </button>
        )}
      </div>

      {/* Expanded form */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-6 py-6 space-y-6">
          {/* Class identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Class name *
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={cls.name}
                onChange={(e) => onUpdateClass({ name: e.target.value })}
                placeholder="e.g. Ballet 1A"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Display name
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={cls.displayName ?? ""}
                onChange={(e) =>
                  onUpdateClass({ displayName: e.target.value || undefined })
                }
                placeholder="Public-facing name (defaults to class name if blank)"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Discipline *
              </label>
              <select
                disabled={isLocked}
                value={cls.discipline}
                onChange={(e) => onUpdateClass({ discipline: e.target.value })}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Division *
              </label>
              <select
                disabled={isLocked}
                value={cls.division}
                onChange={(e) => onUpdateClass({ division: e.target.value })}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {DIVISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Level
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={cls.level ?? ""}
                onChange={(e) =>
                  onUpdateClass({ level: e.target.value || undefined })
                }
                placeholder="e.g. 1A, 2, Advanced"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div className="flex items-end gap-6">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                  Min age
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={isLocked}
                  value={cls.minAge ?? ""}
                  onChange={(e) =>
                    onUpdateClass({
                      minAge: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                  Max age
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={isLocked}
                  value={cls.maxAge ?? ""}
                  onChange={(e) =>
                    onUpdateClass({
                      maxAge: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>

            <div className="flex items-end gap-6">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                  Min grade
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={isLocked}
                  value={cls.minGrade ?? ""}
                  onChange={(e) =>
                    onUpdateClass({
                      minGrade: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="K=0"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                  Max grade
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={isLocked}
                  value={cls.maxGrade ?? ""}
                  onChange={(e) =>
                    onUpdateClass({
                      maxGrade: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="12"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
              Description
            </label>
            <textarea
              disabled={isLocked}
              value={cls.description ?? ""}
              onChange={(e) =>
                onUpdateClass({ description: e.target.value || undefined })
              }
              rows={2}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={isLocked}
                checked={cls.isCompetitionTrack ?? false}
                onChange={(e) =>
                  onUpdateClass({ isCompetitionTrack: e.target.checked })
                }
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Competition track</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={isLocked}
                checked={cls.requiresTeacherRec ?? false}
                onChange={(e) =>
                  onUpdateClass({ requiresTeacherRec: e.target.checked })
                }
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">
                Requires teacher recommendation
              </span>
            </label>
          </div>

          {/* Schedule blocks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">
                Schedule Blocks
              </h4>
              {!isLocked && (
                <button
                  type="button"
                  onClick={onAddSchedule}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
                >
                  + Add schedule block
                </button>
              )}
            </div>

            {schedules.length === 0 && (
              <p className="text-xs text-gray-400 italic">
                No schedule blocks yet.
              </p>
            )}

            {schedules.map((schedule, scheduleIdx) => (
              <ScheduleEditor
                key={schedule._clientKey ?? scheduleIdx}
                schedule={schedule}
                isLocked={isLocked}
                canRemove={schedules.length > 0}
                onChange={(patch) => onUpdateSchedule(scheduleIdx, patch)}
                onRemove={() => onRemoveSchedule(scheduleIdx)}
              />
            ))}
          </div>

          {/* Enrollment Requirements */}
          <RequirementsSection
            requirements={cls.requirements ?? []}
            isLocked={isLocked}
            onAdd={onAddRequirement}
            onRemove={onRemoveRequirement}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ScheduleEditor                                                              */
/* -------------------------------------------------------------------------- */

function ScheduleEditor({
  schedule,
  isLocked,
  canRemove,
  onChange,
  onRemove,
}: {
  schedule: DraftClassSchedule;
  isLocked: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<DraftClassSchedule>) => void;
  onRemove: () => void;
}) {
  const [newExcludedDate, setNewExcludedDate] = useState("");
  const [newExcludedReason, setNewExcludedReason] = useState("");
  const [showTierForm, setShowTierForm] = useState(false);
  const [draftTier, setDraftTier] = useState<{
    label: string;
    amount: string;
    isDefault: boolean;
  }>({
    label: "",
    amount: "",
    isDefault: (schedule.priceTiers ?? []).length === 0,
  });
  const [showOptionForm, setShowOptionForm] = useState(false);
  const [draftOption, setDraftOption] = useState<{
    name: string;
    description: string;
    price: string;
    isRequired: boolean;
  }>({
    name: "",
    description: "",
    price: "0",
    isRequired: false,
  });

  const pricingModel = schedule.pricingModel ?? "full_schedule";
  const priceTiers = schedule.priceTiers ?? [];
  const options = schedule.options ?? [];
  const excludedDates = schedule.excludedDates ?? [];
  const generatedCount = computeGeneratedCount(schedule);

  /* ---------------------------------------------------------------------- */
  /* Day-of-week toggle                                                      */
  /* ---------------------------------------------------------------------- */

  function handleToggleDay(day: string) {
    const current = schedule.daysOfWeek ?? [];
    const updated = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    onChange({ daysOfWeek: updated });
  }

  /* ---------------------------------------------------------------------- */
  /* Excluded dates                                                          */
  /* ---------------------------------------------------------------------- */

  function handleAddExcludedDate() {
    if (!newExcludedDate) return;
    if (excludedDates.some((d) => d.date === newExcludedDate)) return;
    onChange({
      excludedDates: [
        ...excludedDates,
        { date: newExcludedDate, reason: newExcludedReason || undefined },
      ],
    });
    setNewExcludedDate("");
    setNewExcludedReason("");
  }

  function handleRemoveExcludedDate(date: string) {
    onChange({ excludedDates: excludedDates.filter((d) => d.date !== date) });
  }

  /* ---------------------------------------------------------------------- */
  /* Price tiers (Mode A — full_schedule)                                   */
  /* ---------------------------------------------------------------------- */

  function handleAddTier() {
    if (!draftTier.label.trim() || draftTier.amount === "") return;
    const amount = parseFloat(draftTier.amount);
    if (isNaN(amount) || amount < 0) return;
    const newTier: DraftSchedulePriceTier = {
      _clientKey: Date.now().toString(),
      label: draftTier.label.trim(),
      amount,
      sortOrder: priceTiers.length,
      isDefault: draftTier.isDefault || priceTiers.length === 0,
    };
    const updated = draftTier.isDefault
      ? priceTiers.map((t) => ({ ...t, isDefault: false }))
      : [...priceTiers];
    onChange({ priceTiers: [...updated, newTier] });
    setDraftTier({ label: "", amount: "", isDefault: false });
    setShowTierForm(false);
  }

  function handleSetDefaultTier(clientKey: string) {
    onChange({
      priceTiers: priceTiers.map((t) => ({
        ...t,
        isDefault: t._clientKey === clientKey,
      })),
    });
  }

  function handleRemoveTier(clientKey: string) {
    const updated = priceTiers.filter((t) => t._clientKey !== clientKey);
    if (updated.length > 0 && !updated.some((t) => t.isDefault)) {
      updated[0] = { ...updated[0], isDefault: true };
    }
    onChange({ priceTiers: updated });
  }

  /* ---------------------------------------------------------------------- */
  /* Session options                                                         */
  /* ---------------------------------------------------------------------- */

  function handleAddOption() {
    if (!draftOption.name.trim()) return;
    const price = parseFloat(draftOption.price);
    if (isNaN(price) || price < 0) return;
    const newOpt: DraftSessionOption = {
      _clientKey: Date.now().toString(),
      name: draftOption.name.trim(),
      description: draftOption.description || undefined,
      price,
      isRequired: draftOption.isRequired,
      sortOrder: options.length,
    };
    onChange({ options: [...options, newOpt] });
    setDraftOption({
      name: "",
      description: "",
      price: "0",
      isRequired: false,
    });
    setShowOptionForm(false);
  }

  function handleRemoveOption(clientKey: string) {
    onChange({ options: options.filter((o) => o._clientKey !== clientKey) });
  }

  const TIME_OPTIONS = [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
  ];

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-4 bg-gray-50/50">
      {/* Days of week — multi-select checkboxes */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Days *</p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OF_WEEK.map((d) => {
            const active = (schedule.daysOfWeek ?? []).includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                disabled={isLocked}
                onClick={() => handleToggleDay(d.value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition
                  ${
                    active
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                  }
                  disabled:opacity-50 disabled:cursor-default`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Start/End time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start time</label>
          <select
            // type="time"
            disabled={isLocked}
            value={schedule.startTime ?? ""}
            onChange={(e) =>
              onChange({ startTime: e.target.value || undefined })
            }
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">Select Time</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End time</label>
          <select
            // type="time"
            disabled={isLocked}
            value={schedule.endTime ?? ""}
            onChange={(e) => onChange({ endTime: e.target.value || undefined })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">Select End Time</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start date</label>
          <input
            type="date"
            disabled={isLocked}
            value={schedule.startDate ?? ""}
            onChange={(e) =>
              onChange({ startDate: e.target.value || undefined })
            }
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End date</label>
          <input
            type="date"
            disabled={isLocked}
            value={schedule.endDate ?? ""}
            onChange={(e) => onChange({ endDate: e.target.value || undefined })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
      </div>

      {/* Location + Instructor */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Location</label>
          <input
            type="text"
            disabled={isLocked}
            value={schedule.location ?? ""}
            onChange={(e) =>
              onChange({ location: e.target.value || undefined })
            }
            placeholder="Studio A"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Instructor</label>
          <input
            type="text"
            disabled={isLocked}
            value={schedule.instructorName ?? ""}
            onChange={(e) =>
              onChange({ instructorName: e.target.value || undefined })
            }
            placeholder="e.g. Ms. Johnson"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
      </div>

      {/* Capacity + Reg opens + Reg closes */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Capacity</label>
          <input
            type="number"
            min={1}
            disabled={isLocked}
            value={schedule.capacity ?? ""}
            onChange={(e) =>
              onChange({
                capacity: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Registration opens
          </label>
          <input
            type="datetime-local"
            disabled={isLocked}
            value={
              schedule.registrationOpenAt
                ? schedule.registrationOpenAt.slice(0, 16)
                : ""
            }
            onChange={(e) =>
              onChange({
                registrationOpenAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Registration closes
          </label>
          <input
            type="datetime-local"
            disabled={isLocked}
            value={
              schedule.registrationCloseAt
                ? schedule.registrationCloseAt.slice(0, 16)
                : ""
            }
            onChange={(e) =>
              onChange({
                registrationCloseAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
      </div>

      {/* Gender restriction + Urgency threshold */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Gender restriction
          </label>
          <select
            disabled={isLocked}
            value={schedule.genderRestriction ?? "no_restriction"}
            onChange={(e) =>
              onChange({
                genderRestriction:
                  e.target.value === "no_restriction"
                    ? null
                    : (e.target.value as "male" | "female"),
              })
            }
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="no_restriction">No restriction</option>
            <option value="male">Male only</option>
            <option value="female">Female only</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Urgency threshold
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              disabled={isLocked}
              value={schedule.urgencyThreshold ?? ""}
              onChange={(e) =>
                onChange({
                  urgencyThreshold: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="e.g. 5"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <span className="text-xs text-gray-400 shrink-0">spots left</span>
          </div>
        </div>
      </div>

      {/* Excluded dates */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Excluded dates
        </p>
        {excludedDates.length === 0 && (
          <p className="text-xs text-gray-400 italic">No excluded dates.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {excludedDates.map((d) => (
            <span
              key={d.date}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
            >
              {d.date}
              {d.reason && <span className="text-gray-400">({d.reason})</span>}
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => handleRemoveExcludedDate(d.date)}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {!isLocked && (
          <div className="flex gap-2 items-end">
            <div>
              <input
                type="date"
                value={newExcludedDate}
                onChange={(e) => setNewExcludedDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <input
                type="text"
                value={newExcludedReason}
                onChange={(e) => setNewExcludedReason(e.target.value)}
                placeholder="Reason (optional)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={handleAddExcludedDate}
              disabled={!newExcludedDate}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition"
            >
              + Add
            </button>
          </div>
        )}
      </div>

      {/* Generated sessions preview */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 flex items-center gap-2">
        <svg
          className="w-4 h-4 text-indigo-400 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-xs text-indigo-700">
          {generatedCount > 0 ? (
            <>
              This schedule will generate{" "}
              <span className="font-semibold">{generatedCount}</span> session
              {generatedCount !== 1 ? "s" : ""}.
            </>
          ) : (
            "Configure days and date range to preview session count."
          )}
        </p>
      </div>

      {/* Pricing model toggle + pricing config */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Pricing model
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2">
          {(
            [
              {
                value: "full_schedule",
                label: "Full Schedule",
                desc: "One price, entire enrollment",
              },
              {
                value: "per_session",
                label: "Per Session (Drop-in)",
                desc: "Priced per class date",
              },
            ] as const
          ).map((mode) => (
            <button
              key={mode.value}
              type="button"
              disabled={isLocked}
              onClick={() =>
                onChange({
                  pricingModel: mode.value,
                  // Clear the other mode's data to avoid stale values
                  ...(mode.value === "full_schedule"
                    ? { dropInPrice: null }
                    : { priceTiers: [] }),
                })
              }
              className={`flex-1 rounded-xl border px-3 py-2 text-left transition
                ${
                  pricingModel === mode.value
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                    : "border-gray-200 hover:border-gray-300"
                }
                disabled:opacity-50 disabled:cursor-default`}
            >
              <p
                className={`text-xs font-medium ${pricingModel === mode.value ? "text-indigo-700" : "text-gray-700"}`}
              >
                {mode.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{mode.desc}</p>
            </button>
          ))}
        </div>

        {/* Mode A: schedule-level price tiers */}
        {pricingModel === "full_schedule" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Price tiers — user selects one at checkout
              </p>
              {!isLocked && !showTierForm && (
                <button
                  type="button"
                  onClick={() => setShowTierForm(true)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
                >
                  + Add tier
                </button>
              )}
            </div>
            {priceTiers.length === 0 && !showTierForm && (
              <p className="text-xs text-gray-400 italic">
                No tiers — falls back to semester tuition rate bands.
              </p>
            )}
            {priceTiers.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">
                        Label
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        Amount
                      </th>
                      <th className="px-3 py-1.5 text-center font-medium">
                        Default
                      </th>
                      {!isLocked && <th className="px-3 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {priceTiers.map((tier) => (
                      <tr key={tier._clientKey} className="bg-white">
                        <td className="px-3 py-1.5 text-gray-700">
                          {tier.label}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700">
                          ${tier.amount.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {tier.isDefault ? (
                            <span className="text-indigo-600 font-medium">
                              ✓
                            </span>
                          ) : !isLocked ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleSetDefaultTier(tier._clientKey)
                              }
                              className="text-gray-400 hover:text-indigo-600 transition"
                            >
                              Set
                            </button>
                          ) : null}
                        </td>
                        {!isLocked && (
                          <td className="px-3 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveTier(tier._clientKey)}
                              className="text-red-400 hover:text-red-600 transition"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showTierForm && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Label *
                    </label>
                    <input
                      type="text"
                      value={draftTier.label}
                      onChange={(e) =>
                        setDraftTier((d) => ({ ...d, label: e.target.value }))
                      }
                      placeholder="e.g. Regular"
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Amount ($) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draftTier.amount}
                      onChange={(e) =>
                        setDraftTier((d) => ({ ...d, amount: e.target.value }))
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draftTier.isDefault}
                    onChange={(e) =>
                      setDraftTier((d) => ({
                        ...d,
                        isDefault: e.target.checked,
                      }))
                    }
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-700">
                    Set as default tier
                  </span>
                </label>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTierForm(false);
                      setDraftTier({ label: "", amount: "", isDefault: false });
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 transition px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTier}
                    disabled={
                      !draftTier.label.trim() || draftTier.amount === ""
                    }
                    className="text-xs font-medium bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    Add tier
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode B: single drop-in price per session */}
        {pricingModel === "per_session" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Drop-in price per session ($)
            </label>
            <div className="flex items-center gap-2 max-w-xs">
              <span className="text-sm text-gray-500">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={isLocked}
                value={schedule.dropInPrice ?? ""}
                onChange={(e) =>
                  onChange({
                    dropInPrice: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  })
                }
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-xs text-gray-400 shrink-0">per date</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              This price is applied to each generated session. Users may enroll
              in any subset of individual dates.
            </p>
          </div>
        )}
      </div>

      {/* Session options (add-ons) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Session options
          </p>
          {!isLocked && !showOptionForm && (
            <button
              type="button"
              onClick={() => setShowOptionForm(true)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
            >
              + Add option
            </button>
          )}
        </div>
        {options.length === 0 && !showOptionForm && (
          <p className="text-xs text-gray-400 italic">
            No add-ons for this schedule.
          </p>
        )}
        {options.map((opt) => (
          <div
            key={opt._clientKey}
            className="flex items-start justify-between rounded-lg border border-gray-200 px-3 py-2 bg-white"
          >
            <div>
              <p className="text-xs font-medium text-gray-700">
                {opt.name}
                {opt.isRequired && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                    Required
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                ${opt.price.toFixed(2)}
                {opt.description ? ` · ${opt.description}` : ""}
              </p>
            </div>
            {!isLocked && (
              <button
                type="button"
                onClick={() => handleRemoveOption(opt._clientKey)}
                className="ml-3 shrink-0 text-xs text-red-500 hover:text-red-700 transition"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {showOptionForm && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Option name *
                </label>
                <input
                  type="text"
                  value={draftOption.name}
                  onChange={(e) =>
                    setDraftOption((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="e.g. Recital Ticket"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Price ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draftOption.price}
                  onChange={(e) =>
                    setDraftOption((d) => ({ ...d, price: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={draftOption.description}
                onChange={(e) =>
                  setDraftOption((d) => ({ ...d, description: e.target.value }))
                }
                placeholder="e.g. One ticket included per dancer"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draftOption.isRequired}
                onChange={(e) =>
                  setDraftOption((d) => ({
                    ...d,
                    isRequired: e.target.checked,
                  }))
                }
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-700">
                Required (auto-added at checkout)
              </span>
            </label>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowOptionForm(false);
                  setDraftOption({
                    name: "",
                    description: "",
                    price: "0",
                    isRequired: false,
                  });
                }}
                className="text-xs text-gray-500 hover:text-gray-700 transition px-2 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddOption}
                disabled={!draftOption.name.trim()}
                className="text-xs font-medium bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              >
                Add option
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Remove schedule */}
      {!isLocked && canRemove && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700 transition"
          >
            Remove schedule block
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RequirementsSection                                                         */
/* -------------------------------------------------------------------------- */

const REQUIREMENT_TYPES: {
  value: DraftClassRequirement["requirement_type"];
  label: string;
}[] = [
  { value: "prerequisite_completed", label: "Prerequisite completed" },
  { value: "concurrent_enrollment", label: "Concurrent enrollment" },
  { value: "teacher_recommendation", label: "Teacher recommendation" },
  { value: "skill_qualification", label: "Skill qualification" },
  { value: "audition_required", label: "Audition required" },
];

function emptyRequirement(): DraftClassRequirement {
  return {
    requirement_type: "concurrent_enrollment",
    description: "",
    enforcement: "hard_block",
    is_waivable: false,
  };
}

function RequirementsSection({
  requirements,
  isLocked,
  onAdd,
  onRemove,
}: {
  requirements: DraftClassRequirement[];
  isLocked: boolean;
  onAdd: (req: DraftClassRequirement) => void;
  onRemove: (idx: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftClassRequirement>(emptyRequirement());

  function handleAdd() {
    if (!draft.description.trim()) return;
    onAdd({ ...draft });
    setDraft(emptyRequirement());
    setShowForm(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">
          Enrollment Requirements
        </h4>
        {!isLocked && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
          >
            + Add requirement
          </button>
        )}
      </div>

      {requirements.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 italic">
          No requirements. Competition classes typically need audition +
          concurrent technique.
        </p>
      )}

      {requirements.map((req, i) => (
        <div
          key={i}
          className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2 bg-gray-50/50"
        >
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-700">
              {REQUIREMENT_TYPES.find((t) => t.value === req.requirement_type)
                ?.label ?? req.requirement_type}
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  req.enforcement === "hard_block"
                    ? "bg-red-50 text-red-600"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                {req.enforcement === "hard_block" ? "Hard block" : "Soft warn"}
              </span>
              {req.is_waivable && (
                <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                  Waivable
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">{req.description}</p>
          </div>
          {!isLocked && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="ml-3 shrink-0 text-xs text-red-500 hover:text-red-700 transition"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {showForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type *</label>
              <select
                value={draft.requirement_type}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    requirement_type: e.target
                      .value as DraftClassRequirement["requirement_type"],
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {REQUIREMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Enforcement *
              </label>
              <select
                value={draft.enforcement}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    enforcement: e.target.value as "soft_warn" | "hard_block",
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="hard_block">
                  Hard block (prevents enrollment)
                </option>
                <option value="soft_warn">Soft warning (shows message)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Message shown to user *
            </label>
            <input
              type="text"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="e.g. Must be concurrently enrolled in Technique 1"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Required discipline (optional)
              </label>
              <input
                type="text"
                value={draft.required_discipline ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    required_discipline: e.target.value || null,
                  }))
                }
                placeholder="e.g. ballet, technique"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Required level (optional)
              </label>
              <input
                type="text"
                value={draft.required_level ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    required_level: e.target.value || null,
                  }))
                }
                placeholder="e.g. 1, 2, Advanced"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.is_waivable}
              onChange={(e) =>
                setDraft((d) => ({ ...d, is_waivable: e.target.checked }))
              }
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-700">
              Admin can grant waivers for individual dancers
            </span>
          </label>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setDraft(emptyRequirement());
              }}
              className="text-xs text-gray-500 hover:text-gray-700 transition px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.description.trim()}
              className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
            >
              Add Requirement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
