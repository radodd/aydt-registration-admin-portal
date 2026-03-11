"use client";

import {
  DraftClass,
  DraftClassRequirement,
  DraftClassSchedule,
  DraftSchedulePriceTier,
  DraftSessionExcludedDate,
  DraftSessionOption,
  DraftSpecialProgramTuition,
  DraftTuitionRateBand,
  SessionsStepProps,
} from "@/types";
import { useState } from "react";
import { calculateClassTuition } from "@/utils/tuitionEngine";

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
/* Tuition auto-fill helper                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Looks up the configured semester total for this class via the tuition engine
 * and returns a ready-to-insert default price tier, or null if no rate exists.
 * Used to auto-populate pricing when division or days-of-week changes.
 */
function buildDefaultPriceTierFromState(
  division: string,
  weeklyCount: number,
  discipline: string,
  rateBands: DraftTuitionRateBand[],
  specialRates: DraftSpecialProgramTuition[],
): DraftSchedulePriceTier | null {
  const result = calculateClassTuition({
    division,
    weeklyClassCount: Math.max(1, weeklyCount),
    discipline,
    rateBands,
    specialRates,
  });
  if (result.source === "unresolved" || result.semesterTotal === 0) return null;
  return {
    _clientKey: Date.now().toString() + Math.random(),
    label: "Regular",
    amount: result.semesterTotal,
    sortOrder: 0,
    isDefault: true,
  };
}

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

/** Standard class scaffold — public visibility, no schedule invariants. */
function emptyStandardClass(): DraftClass {
  return {
    offeringType: "standard",
    name: "",
    displayName: "",
    discipline: "ballet",
    division: "junior",

    description: "",
    minAge: undefined,
    maxAge: undefined,
    minGrade: undefined,
    maxGrade: undefined,
    isCompetitionTrack: false,
    requiresTeacherRec: false,
    visibility: "public",
    enrollmentType: "standard",
    schedules: [emptySchedule()],
  };
}

/**
 * Competition track scaffold — identity fields are fixed by archetype:
 *   isCompetitionTrack=true, visibility=invite_only, enrollmentType=audition, schedules=[]
 *
 * INVARIANT: competition tracks never have class_sessions. Audition slots are
 * managed exclusively in the Competition Invites page (InviteManagerClient).
 */
function emptyCompetitionTrackClass(): DraftClass {
  return {
    offeringType: "competition_track",
    name: "",
    displayName: "",
    discipline: "ballet",
    division: "competition",

    description: "",
    minAge: undefined,
    maxAge: undefined,
    minGrade: undefined,
    maxGrade: undefined,
    isCompetitionTrack: true,
    requiresTeacherRec: false,
    visibility: "invite_only",
    enrollmentType: "audition",
    schedules: [], // competition tracks have no class_sessions
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

  // Tuition engine config — pulled from state so SessionsStep auto-fills from
  // whatever the admin configured in PaymentStep.
  const rateBands: DraftTuitionRateBand[] = state.tuitionRateBands ?? [];
  const specialRates: DraftSpecialProgramTuition[] = state.specialProgramTuition ?? [];
  const [rangeErrors, setRangeErrors] = useState<Map<number, string[]>>(
    new Map(),
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");

  /* ---------------------------------------------------------------------- */
  /* Class-level handlers                                                    */
  /* ---------------------------------------------------------------------- */

  function handleAddStandardClass() {
    const updated = [...classes, emptyStandardClass()];
    setClasses(updated);
    setExpandedClassIdx(updated.length - 1);
  }

  function handleAddCompetitionTrack() {
    const updated = [...classes, emptyCompetitionTrackClass()];
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
      prev.map((c, i) => {
        if (i !== idx) return c;
        const merged = { ...c, ...patch };
        // Enforce competition track invariants: identity fields are derived from offeringType.
        // This prevents illegal combinations regardless of what the UI sends.
        if (merged.offeringType === "competition_track") {
          merged.isCompetitionTrack = true;
          merged.visibility = "invite_only";
          merged.enrollmentType = "audition";
          merged.schedules = []; // competition tracks have no class_sessions
        }
        return merged;
      }),
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

  function validateClasses(cls: DraftClass[]): Map<number, string[]> {
    const errors = new Map<number, string[]>();
    cls.forEach((c, idx) => {
      const msgs: string[] = [];
      if (c.minAge != null && c.maxAge != null) {
        if (c.minAge === 0 && c.maxAge === 0)
          msgs.push(
            "Age range 0–0 is meaningless — disable the age restriction toggle instead.",
          );
        else if (c.minAge >= c.maxAge)
          msgs.push("Min age must be less than max age.");
      }
      if (c.minGrade != null && c.maxGrade != null) {
        if (c.minGrade === 0 && c.maxGrade === 0)
          msgs.push(
            "Grade range 0–0 is meaningless — disable the grade restriction toggle instead.",
          );
        else if (c.minGrade >= c.maxGrade)
          msgs.push("Min grade must be less than max grade.");
      }
      if (msgs.length > 0) errors.set(idx, msgs);
    });
    return errors;
  }

  function handleSubmit() {
    const errors = validateClasses(classes);
    if (errors.size > 0) {
      setRangeErrors(errors);
      return;
    }
    setRangeErrors(new Map());
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

      {/* Sort control — shown when either section has more than 1 item */}
      {classes.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 transition"
          >
            <span>A–Z</span>
            <span className="inline-flex flex-col leading-none text-[10px]">
              <span className={sortDir === "asc" ? "text-indigo-600" : "text-gray-300"}>▲</span>
              <span className={sortDir === "desc" ? "text-indigo-600" : "text-gray-300"}>▼</span>
            </span>
          </button>
        </div>
      )}

      {/* Search bar */}
      {classes.length > 0 && (
        <div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search classes..."
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Standard Classes section                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Standard Classes</h3>
        </div>

        {[...classes.entries()]
          .filter(([, c]) => c.offeringType !== "competition_track")
          .filter(([, c]) =>
            searchQuery === "" ||
            c.name.toLowerCase().includes(searchQuery.toLowerCase()),
          )
          .sort(([, a], [, b]) =>
            sortDir === "asc"
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name),
          )
          .map(([classIdx, cls]) => (
            <ClassCard
              key={classIdx}
              cls={cls}
              classIdx={classIdx}
              semesterId={state.id}
              isExpanded={expandedClassIdx === classIdx}
              isLocked={isLocked}
              rateBands={rateBands}
              specialRates={specialRates}
              onToggle={() =>
                setExpandedClassIdx(
                  expandedClassIdx === classIdx ? null : classIdx,
                )
              }
              onUpdateClass={(patch) => handleUpdateClass(classIdx, patch)}
              onUpdateSchedule={(scheduleIdx, patch) =>
                handleUpdateSchedule(classIdx, scheduleIdx, patch)
              }
              onRemoveClass={() => handleRemoveClass(classIdx)}
              onAddSchedule={() => handleAddSchedule(classIdx)}
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
              rangeErrors={rangeErrors.get(classIdx) ?? []}
            />
          ))}

        {classes.filter((c) => c.offeringType !== "competition_track").length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-500">
              No standard classes yet. Click &ldquo;+ Add Standard Class&rdquo; to get started.
            </p>
          </div>
        )}

        {!isLocked && (
          <button
            type="button"
            onClick={handleAddStandardClass}
            className="w-full py-3 rounded-xl border-2 border-dashed border-indigo-300 text-sm font-medium text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition"
          >
            + Add Standard Class
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Competition Tracks section                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Competition Tracks</h3>
        </div>

        {[...classes.entries()]
          .filter(([, c]) => c.offeringType === "competition_track")
          .filter(([, c]) =>
            searchQuery === "" ||
            c.name.toLowerCase().includes(searchQuery.toLowerCase()),
          )
          .sort(([, a], [, b]) =>
            sortDir === "asc"
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name),
          )
          .map(([classIdx, cls]) => (
            <ClassCard
              key={classIdx}
              cls={cls}
              classIdx={classIdx}
              semesterId={state.id}
              isExpanded={expandedClassIdx === classIdx}
              isLocked={isLocked}
              rateBands={rateBands}
              specialRates={specialRates}
              onToggle={() =>
                setExpandedClassIdx(
                  expandedClassIdx === classIdx ? null : classIdx,
                )
              }
              onUpdateClass={(patch) => handleUpdateClass(classIdx, patch)}
              onUpdateSchedule={(scheduleIdx, patch) =>
                handleUpdateSchedule(classIdx, scheduleIdx, patch)
              }
              onRemoveClass={() => handleRemoveClass(classIdx)}
              onAddSchedule={() => handleAddSchedule(classIdx)}
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
              rangeErrors={rangeErrors.get(classIdx) ?? []}
            />
          ))}

        {classes.filter((c) => c.offeringType === "competition_track").length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-500">
              No competition tracks yet. Click &ldquo;+ Add Competition Track&rdquo; to add one.
            </p>
          </div>
        )}

        {!isLocked && (
          <button
            type="button"
            onClick={handleAddCompetitionTrack}
            className="w-full py-3 rounded-xl border-2 border-dashed border-violet-300 text-sm font-medium text-violet-600 hover:border-violet-500 hover:bg-violet-50 transition"
          >
            + Add Competition Track
          </button>
        )}
      </div>

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
  semesterId,
  isExpanded,
  isLocked,
  rateBands,
  specialRates,
  onToggle,
  onUpdateClass,
  onUpdateSchedule,
  onRemoveClass,
  onAddSchedule,
  onRemoveSchedule,
  onAddRequirement,
  onRemoveRequirement,
  rangeErrors,
}: {
  cls: DraftClass;
  classIdx: number;
  semesterId?: string;
  isExpanded: boolean;
  isLocked: boolean;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
  onToggle: () => void;
  onUpdateClass: (patch: Partial<DraftClass>) => void;
  onUpdateSchedule: (idx: number, patch: Partial<DraftClassSchedule>) => void;
  onRemoveClass: () => void;
  onAddSchedule: () => void;
  onRemoveSchedule: (idx: number) => void;
  onAddRequirement: (req: DraftClassRequirement) => void;
  onRemoveRequirement: (idx: number) => void;
  rangeErrors: string[];
}) {
  const isCompetitionTrack = cls.offeringType === "competition_track";
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
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 truncate">
                {cls.name || (
                  <span className="text-gray-400 font-normal italic">
                    Untitled {isCompetitionTrack ? "competition track" : "class"}
                  </span>
                )}
              </p>
              {isCompetitionTrack && (
                <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  Competition Track
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {disciplineLabel} · {divisionLabel}
              {isCompetitionTrack
                ? " · Invite Only · Audition"
                : ` · ${scheduleCount} schedule block${scheduleCount !== 1 ? "s" : ""}`}
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
                onChange={(e) => {
                  const newDivision = e.target.value;
                  onUpdateClass({ division: newDivision });
                  // Auto-fill tuition on each schedule that has no price tiers yet.
                  (cls.schedules ?? []).forEach((sched, idx) => {
                    if ((sched.priceTiers ?? []).length === 0) {
                      const weeklyCount = Math.max(1, sched.daysOfWeek.length);
                      const tier = buildDefaultPriceTierFromState(
                        newDivision, weeklyCount, cls.discipline,
                        rateBands, specialRates,
                      );
                      if (tier) {
                        onUpdateSchedule(idx, {
                          pricingModel: "full_schedule",
                          priceTiers: [tier],
                        });
                      }
                    }
                  });
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {DIVISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Age restriction toggle */}
            {(() => {
              const ageEnabled = cls.minAge != null || cls.maxAge != null;
              const ageErrors = rangeErrors.filter(
                (e) => e.toLowerCase().includes("age"),
                console.log(ageEnabled),
              );
              return (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={ageEnabled}
                      // onChange={(e) => {
                      //   if (!e.target.checked)
                      //     onUpdateClass({
                      //       minAge: undefined,
                      //       maxAge: undefined,
                      //     });
                      // }}
                      onChange={() => {
                        const nextEnabled = !ageEnabled;

                        onUpdateClass(
                          nextEnabled
                            ? {
                                minAge: cls.minAge ?? 1,
                                maxAge: cls.maxAge ?? undefined,
                              }
                            : {
                                minAge: undefined,
                                maxAge: undefined,
                              },
                        );
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      Age restriction
                    </span>
                  </label>
                  {ageEnabled && (
                    <div className="flex items-end gap-6">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">
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
                        <label className="block text-xs text-gray-500 mb-1">
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
                  )}
                  {ageErrors.map((msg, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {msg}
                    </p>
                  ))}
                </div>
              );
            })()}

            {/* Grade restriction toggle */}
            {(() => {
              const gradeEnabled = cls.minGrade != null || cls.maxGrade != null;
              const gradeErrors = rangeErrors.filter((e) =>
                e.toLowerCase().includes("grade"),
              );
              return (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={gradeEnabled}
                      // onChange={(e) => {
                      //   if (!e.target.checked)
                      //     onUpdateClass({
                      //       minGrade: undefined,
                      //       maxGrade: undefined,
                      //     });
                      // }}
                      onChange={() => {
                        const nextEnabled = !gradeEnabled;

                        onUpdateClass(
                          nextEnabled
                            ? {
                                minGrade: cls.minGrade ?? 0,
                                maxGrade: cls.maxAge ?? undefined,
                              }
                            : {
                                minGrade: undefined,
                                maxGrade: undefined,
                              },
                        );
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      Grade restriction
                    </span>
                  </label>
                  {gradeEnabled && (
                    <div className="flex items-end gap-6">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">
                          Min grade (K=0)
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
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">
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
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>
                    </div>
                  )}
                  {gradeErrors.map((msg, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {msg}
                    </p>
                  ))}
                </div>
              );
            })()}
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

          {isCompetitionTrack ? (
            /* Competition track: identity fields are fixed — show info banner */
            <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-violet-800">Competition Track</p>
              <p className="text-xs text-violet-700">
                Visibility: <strong>Invite Only</strong> · Enrollment: <strong>Audition</strong>
              </p>
              <p className="text-xs text-violet-600">
                These settings are fixed for competition tracks. Manage audition slots and invitations in the{" "}
                {semesterId ? (
                  <a
                    href={`/admin/semesters/${semesterId}/invites`}
                    className="underline hover:text-violet-800"
                  >
                    Competition Invites
                  </a>
                ) : (
                  "Competition Invites"
                )}{" "}
                page.
              </p>
            </div>
          ) : (
            /* Standard class: show visibility select (public/hidden only) */
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Catalog Visibility
                </label>
                <select
                  disabled={isLocked}
                  value={cls.visibility ?? "public"}
                  onChange={(e) =>
                    onUpdateClass({
                      visibility: e.target.value as "public" | "hidden",
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="public">Public — appears in catalog</option>
                  <option value="hidden">Hidden — not in catalog, direct link only</option>
                </select>
              </div>
            </div>
          )}

          {/* Requires teacher rec — available for all class types */}
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

          {/* Schedule blocks — standard classes only */}
          {!isCompetitionTrack && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">
                  Schedule Offerings
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
                  division={cls.division}
                  discipline={cls.discipline}
                  rateBands={rateBands}
                  specialRates={specialRates}
                />
              ))}
            </div>
          )}

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
  division,
  discipline,
  rateBands,
  specialRates,
}: {
  schedule: DraftClassSchedule;
  isLocked: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<DraftClassSchedule>) => void;
  onRemove: () => void;
  division: string;
  discipline: string;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
}) {
  const [newExcludedDate, setNewExcludedDate] = useState("");
  const [newExcludedReason, setNewExcludedReason] = useState("");
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
    const patch: Partial<DraftClassSchedule> = { daysOfWeek: updated };
    // Auto-fill tuition if no tiers are set yet and at least one day is selected.
    if ((schedule.priceTiers ?? []).length === 0 && updated.length > 0) {
      const tier = buildDefaultPriceTierFromState(
        division, updated.length, discipline, rateBands, specialRates,
      );
      if (tier) {
        patch.pricingModel = "full_schedule";
        patch.priceTiers = [tier];
      }
    }
    onChange(patch);
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
  /* Division base price (Mode A — full_schedule)                          */
  /* ---------------------------------------------------------------------- */

  function handleAmountChange(raw: string) {
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount < 0) return;
    const existing = (schedule.priceTiers ?? [])[0];
    const tier: DraftSchedulePriceTier = existing
      ? { ...existing, amount }
      : {
          _clientKey: Date.now().toString() + Math.random(),
          label: "Regular",
          amount,
          sortOrder: 0,
          isDefault: true,
        };
    onChange({ priceTiers: [tier] });
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

        {/* Mode A: division-based price */}
        {pricingModel === "full_schedule" && (() => {
          const weeklyCount = Math.max(1, (schedule.daysOfWeek ?? []).length);
          const engineResult = calculateClassTuition({
            division, weeklyClassCount: weeklyCount, discipline,
            rateBands, specialRates,
          });
          const existingTier = priceTiers[0] ?? null;
          const defaultTierFromEngine = buildDefaultPriceTierFromState(
            division, weeklyCount, discipline, rateBands, specialRates,
          );
          const isUnresolved = engineResult.source === "unresolved" && !engineResult.validationError;
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Division Base Price
                </p>
                {!isLocked && defaultTierFromEngine && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        pricingModel: "full_schedule",
                        priceTiers: [defaultTierFromEngine],
                      })
                    }
                    className="text-xs text-gray-400 hover:text-indigo-600 transition"
                  >
                    Reset to division default
                  </button>
                )}
              </div>
              {isUnresolved ? (
                <p className="text-xs text-amber-600 italic">
                  No tuition rate configured for this division. Set up rates in Payment → Tuition Rates.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 max-w-xs">
                    <span className="text-sm text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isLocked}
                      value={existingTier ? existingTier.amount.toFixed(2) : ""}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder={defaultTierFromEngine ? defaultTierFromEngine.amount.toFixed(2) : "0.00"}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                  {defaultTierFromEngine && (
                    <p className="text-xs text-gray-400">
                      Base rate: ${defaultTierFromEngine.amount.toFixed(2)}
                    </p>
                  )}
                  {existingTier &&
                    engineResult.autoPayInstallmentAmount &&
                    existingTier.amount === engineResult.semesterTotal && (
                      <p className="text-xs text-gray-400">
                        Auto-pay: 5× ${engineResult.autoPayInstallmentAmount.toFixed(2)}/mo
                      </p>
                    )}
                </>
              )}
            </div>
          );
        })()}

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
