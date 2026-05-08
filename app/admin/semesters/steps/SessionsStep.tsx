"use client";

import {
  Division,
  DraftClass,
  DraftClassRequirement,
  DraftClassSchedule,
  DraftSchedulePriceTier,
  DraftSessionOption,
  DraftSpecialProgramTuition,
  DraftTuitionRateBand,
  SessionsStepProps,
} from "@/types";
import { useState, useEffect, useRef, useTransition } from "react";
import { calculateClassTuition } from "@/utils/tuitionEngine";
import { getRequirementWaivers, type RequirementWaiverRow } from "@/app/admin/semesters/actions/getRequirementWaivers";
import { grantRequirementWaiver } from "@/app/admin/semesters/actions/grantRequirementWaiver";
import { revokeRequirementWaiver } from "@/app/admin/semesters/actions/revokeRequirementWaiver";
import { getDivisions } from "@/queries/admin/getDivisions";
import { getInstructors, type InstructorOption } from "@/queries/admin/getInstructors";
import { createDivision } from "@/app/admin/semesters/actions/createDivision";
import { parseTimeInput } from "@/utils/parseTimeInput";
import { InlineDatePicker } from "@/app/components/ui/InlineDatePicker";

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

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon", short: "M" },
  { value: "tuesday", label: "Tue", short: "T" },
  { value: "wednesday", label: "Wed", short: "W" },
  { value: "thursday", label: "Thu", short: "Th" },
  { value: "friday", label: "Fri", short: "F" },
  { value: "saturday", label: "Sat", short: "Sa" },
  { value: "sunday", label: "Sun", short: "Su" },
];

const DISCIPLINE_COLORS: Record<string, { bg: string; text: string }> = {
  ballet: { bg: "bg-pink-100", text: "text-pink-700" },
  tap: { bg: "bg-teal-100", text: "text-teal-700" },
  broadway: { bg: "bg-orange-100", text: "text-orange-700" },
  hip_hop: { bg: "bg-green-100", text: "text-green-700" },
  contemporary: { bg: "bg-purple-100", text: "text-purple-700" },
  technique: { bg: "bg-blue-100", text: "text-blue-700" },
  pointe: { bg: "bg-rose-100", text: "text-rose-700" },
  jazz: { bg: "bg-yellow-100", text: "text-yellow-700" },
  lyrical: { bg: "bg-indigo-100", text: "text-indigo-700" },
  acro: { bg: "bg-cyan-100", text: "text-cyan-700" },
};

const LOCATIONS = ["Upper East Side", "Washington Heights"] as const;

/** 15-minute interval time options from 7:00 AM through 11:00 PM (inclusive). */
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 7; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 23 && m > 0) break;
      const value = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      const period = h >= 12 ? "PM" : "AM";
      const hour = h % 12 || 12;
      const label = `${hour}:${m.toString().padStart(2, "0")} ${period}`;
      opts.push({ value, label });
    }
  }
  return opts;
})();

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

/** Convert 24h "HH:MM" → "h:MM AM/PM" */
function fmt12(time: string): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m} ${period}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/* -------------------------------------------------------------------------- */
/* Tuition auto-fill helper                                                   */
/* -------------------------------------------------------------------------- */

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
    schedules: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Session count preview helper                                               */
/* -------------------------------------------------------------------------- */

function computeGeneratedDates(schedule: DraftClassSchedule): string[] {
  if (!schedule.startDate || !schedule.endDate || schedule.daysOfWeek.length === 0) return [];
  const start = new Date(schedule.startDate + "T00:00:00");
  const end = new Date(schedule.endDate + "T00:00:00");
  if (end < start) return [];
  const excludedSet = new Set((schedule.excludedDates ?? []).map((d) => d.date));
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dayName = dayNames[cur.getDay()];
    if (schedule.daysOfWeek.includes(dayName)) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (!excludedSet.has(dateStr)) dates.push(dateStr);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function computeGeneratedCount(schedule: DraftClassSchedule): number {
  return computeGeneratedDates(schedule).length;
}

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

type PanelTab = "details" | "schedule" | "requirements";

export default function SessionsStep({
  state,
  dispatch,
  isLocked = false,
}: SessionsStepProps) {
  const [classes, setClasses] = useState<DraftClass[]>(state.sessions?.classes ?? []);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("details");
  const [searchQuery, setSearchQuery] = useState("");
  const [rangeErrors, setRangeErrors] = useState<Map<number, string[]>>(new Map());
  const [classesExpanded, setClassesExpanded] = useState(false);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const rateBands: DraftTuitionRateBand[] = state.tuitionRateBands ?? [];
  const specialRates: DraftSpecialProgramTuition[] = state.specialProgramTuition ?? [];

  useEffect(() => {
    getDivisions().then(setDivisions);
  }, []);

  async function handleCreateDivision(label: string, isDropIn: boolean): Promise<Division> {
    const created = await createDivision({ label, isDropIn });
    setDivisions((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
    return created;
  }

  // Sync to global state on every classes change so SemesterForm footer can navigate safely
  useEffect(() => {
    dispatch({ type: "SET_SESSIONS", payload: { classes } });
    // Validate on change to keep error indicators fresh
    const errors = new Map<number, string[]>();
    classes.forEach((c, idx) => {
      const msgs: string[] = [];
      if (c.minAge != null && c.maxAge != null && c.minAge >= c.maxAge)
        msgs.push("Min age must be less than max age.");
      if (c.minGrade != null && c.maxGrade != null && c.minGrade >= c.maxGrade)
        msgs.push("Min grade must be less than max grade.");
      if (msgs.length) errors.set(idx, msgs);
    });
    setRangeErrors(errors);
  }, [classes]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------------- */
  /* Class-level handlers                                                    */
  /* ---------------------------------------------------------------------- */

  function addAndSelect(cls: DraftClass) {
    setClasses((prev) => {
      const updated = [...prev, cls];
      setSelectedIdx(updated.length - 1);
      setActiveTab("details");
      return updated;
    });
  }

  function handleUpdateClass(idx: number, patch: Partial<DraftClass>) {
    setClasses((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const merged = { ...c, ...patch };
        if (merged.offeringType === "competition_track") {
          merged.isCompetitionTrack = true;
          merged.visibility = "invite_only";
          merged.enrollmentType = "audition";
          merged.schedules = [];
        }
        return merged;
      }),
    );
  }

  function handleRemoveClass(idx: number) {
    setClasses((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }

  /* ---------------------------------------------------------------------- */
  /* Schedule-level handlers                                                 */
  /* ---------------------------------------------------------------------- */

  function handleAddSchedule(classIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx ? { ...c, schedules: [...(c.schedules ?? []), emptySchedule()] } : c,
      ),
    );
  }

  function handleRemoveSchedule(classIdx: number, schedIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? { ...c, schedules: (c.schedules ?? []).filter((_, si) => si !== schedIdx) }
          : c,
      ),
    );
  }

  function handleUpdateSchedule(classIdx: number, schedIdx: number, patch: Partial<DraftClassSchedule>) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? {
              ...c,
              schedules: (c.schedules ?? []).map((s, si) =>
                si === schedIdx ? { ...s, ...patch } : s,
              ),
            }
          : c,
      ),
    );
  }

  function handleDuplicateSchedule(classIdx: number, schedIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) => {
        if (i !== classIdx) return c;
        const clone = { ...deepClone(c.schedules![schedIdx]), _clientKey: crypto.randomUUID() };
        const updated = [...(c.schedules ?? [])];
        updated.splice(schedIdx + 1, 0, clone);
        return { ...c, schedules: updated };
      }),
    );
  }

  function handleSplitSchedule(classIdx: number, schedIdx: number, groups: { days: string[] }[]) {
    setClasses((prev) =>
      prev.map((c, i) => {
        if (i !== classIdx) return c;
        const source = (c.schedules ?? [])[schedIdx];
        const splitBlocks = groups.map((g) => ({
          ...deepClone(source),
          _clientKey: crypto.randomUUID(),
          daysOfWeek: g.days,
        }));
        const updated = [
          ...(c.schedules ?? []).slice(0, schedIdx),
          ...splitBlocks,
          ...(c.schedules ?? []).slice(schedIdx + 1),
        ];
        return { ...c, schedules: updated };
      }),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Derived                                                                 */
  /* ---------------------------------------------------------------------- */

  const selectedClass = selectedIdx !== null ? classes[selectedIdx] : null;

  const filteredClasses = classes
    .map((cls, idx) => ({ cls, idx }))
    .filter(({ cls }) => {
      if (searchQuery === "") return true;
      const q = searchQuery.toLowerCase();
      const disciplineLabel = DISCIPLINES.find((d) => d.value === cls.discipline)?.label ?? cls.discipline;
      const divisionLabel = divisions.find((d) => d.id === cls.division)?.label ?? cls.division;
      const instructors = (cls.schedules ?? [])
        .map((s) => s.instructorName ?? "")
        .filter(Boolean)
        .join(" ");
      return (
        cls.name.toLowerCase().includes(q) ||
        disciplineLabel.toLowerCase().includes(q) ||
        divisionLabel.toLowerCase().includes(q) ||
        instructors.toLowerCase().includes(q)
      );
    });

  const standardCount = classes.filter((c) => c.offeringType !== "competition_track").length;
  const compCount = classes.filter((c) => c.offeringType === "competition_track").length;

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="flex flex-col md:flex-row gap-4 md:min-h-[560px]">
      {/* ------------------------------------------------------------------ */}
      {/* Left: class list                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`flex flex-col bg-white border border-neutral-200 rounded-2xl overflow-hidden transition-all sticky top-0 ${
          selectedClass ? "flex-1 min-w-0" : "w-full"
        }`}
        style={classesExpanded ? undefined : { maxHeight: "calc(100vh - 160px)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              Classes &amp; schedules
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Each class can have one or more schedule blocks. Sessions generate automatically.
            </p>
          </div>
          {!isLocked && (
            <div className="flex items-center gap-2 shrink-0 ml-4 mt-0.5">
              <button
                type="button"
                onClick={() => addAndSelect(emptyCompetitionTrackClass())}
                className="inline-flex items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition"
              >
                + Competition track
              </button>
              <button
                type="button"
                onClick={() => addAndSelect(emptyStandardClass())}
                className="inline-flex items-center rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition"
              >
                + Add class
              </button>
            </div>
          )}
        </div>

        {/* Search + count */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-neutral-200 bg-neutral-50/50">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search classes..."
            className="flex-1 max-w-xs rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <span className="text-sm text-neutral-400 shrink-0">
            {standardCount} standard class{standardCount !== 1 ? "es" : ""}
            {compCount > 0 && ` · ${compCount} competition track${compCount !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Table or empty state */}
        {classes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-neutral-500">No classes yet.</p>
            {!isLocked && (
              <button
                type="button"
                onClick={() => addAndSelect(emptyStandardClass())}
                className="text-sm font-medium text-primary-600 hover:text-primary-800 transition"
              >
                + Add first class
              </button>
            )}
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <p className="text-sm text-neutral-400">No classes match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        ) : (
          <div className="relative flex-1 min-h-0">
            <div
              className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" } as React.CSSProperties}
            >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: "var(--admin-table-header-bg)" }}>
                  <th className={`text-left ${selectedClass ? "px-3" : "px-6"} py-2.5 text-[11px] font-semibold uppercase tracking-wide`} style={{ color: "var(--admin-table-header-text)" }}>
                    Class
                  </th>
                  <th className={`text-left ${selectedClass ? "px-2" : "px-4"} py-2.5 text-[11px] font-semibold uppercase tracking-wide`} style={{ color: "var(--admin-table-header-text)" }}>
                    Division
                  </th>
                  <th className={`text-left ${selectedClass ? "px-2" : "px-4"} py-2.5 text-[11px] font-semibold uppercase tracking-wide`} style={{ color: "var(--admin-table-header-text)" }}>
                    Schedule
                  </th>
                  {!selectedClass && (
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>
                      Instructor
                    </th>
                  )}
                  {!selectedClass && (
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>
                      Cap
                    </th>
                  )}
                  <th className={`${selectedClass ? "px-2" : "px-4"} py-2.5 w-px`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredClasses.map(({ cls, idx }) => {
                  const disciplineLabel =
                    DISCIPLINES.find((d) => d.value === cls.discipline)?.label ?? cls.discipline;
                  const divisionLabel =
                    divisions.find((d) => d.id === cls.division)?.label ?? cls.division;
                  const color =
                    DISCIPLINE_COLORS[cls.discipline] ?? { bg: "bg-neutral-100", text: "text-neutral-600" };
                  const firstSched = cls.schedules?.[0];
                  const days = (firstSched?.daysOfWeek ?? [])
                    .map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label ?? d)
                    .join(", ");
                  const timeRange =
                    firstSched?.startTime && firstSched?.endTime
                      ? `${fmt12(firstSched.startTime)}–${fmt12(firstSched.endTime)}`
                      : "";
                  const extraBlocks =
                    (cls.schedules?.length ?? 0) > 1 ? ` +${cls.schedules!.length - 1}` : "";
                  const isSelected = selectedIdx === idx;
                  const hasErrors = (rangeErrors.get(idx)?.length ?? 0) > 0;

                  return (
                    <tr
                      key={idx}
                      onClick={() => {
                        setSelectedIdx(isSelected ? null : idx);
                        setActiveTab("details");
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary-50"
                          : "hover:bg-neutral-50"
                      }`}
                    >
                      <td className={`${selectedClass ? "px-3" : "px-6"} py-3`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-neutral-900 truncate">
                              {cls.name || (
                                <span className="italic text-neutral-400 font-normal">Untitled</span>
                              )}
                            </span>
                            {hasErrors && (
                              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" title="Validation error" />
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center mt-0.5 rounded-full px-2 py-0 text-xs font-medium ${color.bg} ${color.text}`}
                          >
                            {cls.offeringType === "competition_track" ? "Competition" : disciplineLabel}
                          </span>
                        </div>
                      </td>
                      <td className={`${selectedClass ? "px-2" : "px-4"} py-3 text-neutral-600 whitespace-nowrap`}>{divisionLabel}</td>
                      <td className={`${selectedClass ? "px-2" : "px-4"} py-3 text-neutral-600`}>
                        {cls.offeringType === "competition_track" ? (
                          <span className="text-neutral-400 italic text-xs">Invite only</span>
                        ) : days ? (
                          <div>
                            <p className="text-neutral-700 whitespace-nowrap">{days}{extraBlocks}</p>
                            {timeRange && <p className="text-xs text-neutral-400 whitespace-nowrap">{timeRange}</p>}
                          </div>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      {!selectedClass && (
                        <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                          {firstSched?.instructorName || <span className="text-neutral-300">—</span>}
                        </td>
                      )}
                      {!selectedClass && (
                        <td className="px-4 py-3 text-neutral-600">
                          {firstSched?.capacity ?? <span className="text-neutral-300">—</span>}
                        </td>
                      )}
                      <td className={`${selectedClass ? "px-2" : "px-4"} py-3 text-right w-px`}>
                        <svg
                          className={`w-4 h-4 ml-auto transition-transform ${isSelected ? "text-primary-600 rotate-180" : "text-neutral-300"}`}
                          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {/* Bottom fade — hidden when list is fully expanded */}
            {!classesExpanded && (
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-16"
                style={{ background: "linear-gradient(to top, white 0%, transparent 100%)" }}
              />
            )}
          </div>
        )}

        {/* View all classes footer */}
        {classes.length > 0 && (
          <div className="shrink-0 border-t border-neutral-100 px-6 py-2.5 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setClassesExpanded((v) => !v)}
              className="text-xs font-medium text-primary-600 hover:text-primary-800 transition flex items-center gap-1"
            >
              {classesExpanded ? "Collapse class list" : "View all classes"}
              <svg
                className={`w-3.5 h-3.5 transition-transform ${classesExpanded ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}

        {/* Locked banner */}
        {isLocked && (
          <div className="shrink-0 border-t border-amber-100 bg-amber-50 px-6 py-2.5 text-xs text-amber-700">
            This semester has active registrations. Classes and schedules are locked.
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right: class edit panel                                            */}
      {/* ------------------------------------------------------------------ */}
      {selectedClass !== null && selectedIdx !== null && (
        <ClassEditPanel
          cls={selectedClass}
          classIdx={selectedIdx}
          isLocked={isLocked}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          rateBands={rateBands}
          specialRates={specialRates}
          semesterId={state.id}
          allClasses={classes}
          divisions={divisions}
          onCreateDivision={handleCreateDivision}
          rangeErrors={rangeErrors.get(selectedIdx) ?? []}
          onClose={() => setSelectedIdx(null)}
          onRemoveClass={() => handleRemoveClass(selectedIdx)}
          onUpdateClass={(patch) => handleUpdateClass(selectedIdx, patch)}
          onAddSchedule={() => handleAddSchedule(selectedIdx)}
          onRemoveSchedule={(si) => handleRemoveSchedule(selectedIdx, si)}
          onUpdateSchedule={(si, patch) => handleUpdateSchedule(selectedIdx, si, patch)}
          onDuplicateSchedule={(si) => handleDuplicateSchedule(selectedIdx, si)}
          onSplitSchedule={(si, groups) => handleSplitSchedule(selectedIdx, si, groups)}
          onAddRequirement={(req) =>
            handleUpdateClass(selectedIdx, {
              requirements: [...(selectedClass.requirements ?? []), req],
            })
          }
          onRemoveRequirement={(ri) =>
            handleUpdateClass(selectedIdx, {
              requirements: (selectedClass.requirements ?? []).filter((_, i) => i !== ri),
            })
          }
          onUpdateRequirement={(ri, patch) =>
            handleUpdateClass(selectedIdx, {
              requirements: (selectedClass.requirements ?? []).map((r, i) =>
                i === ri ? { ...r, ...patch } : r,
              ),
            })
          }
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ClassEditPanel                                                             */
/* -------------------------------------------------------------------------- */

function ClassEditPanel({
  cls,
  classIdx: _classIdx,
  isLocked,
  activeTab,
  setActiveTab,
  rateBands,
  specialRates,
  semesterId,
  allClasses,
  divisions,
  onCreateDivision,
  rangeErrors,
  onClose,
  onRemoveClass,
  onUpdateClass,
  onAddSchedule,
  onRemoveSchedule,
  onUpdateSchedule,
  onDuplicateSchedule,
  onSplitSchedule,
  onAddRequirement,
  onRemoveRequirement,
  onUpdateRequirement,
}: {
  cls: DraftClass;
  classIdx: number;
  isLocked: boolean;
  activeTab: PanelTab;
  setActiveTab: (t: PanelTab) => void;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
  semesterId?: string;
  allClasses: DraftClass[];
  divisions: Division[];
  onCreateDivision: (label: string, isDropIn: boolean) => Promise<Division>;
  rangeErrors: string[];
  onClose: () => void;
  onRemoveClass: () => void;
  onUpdateClass: (patch: Partial<DraftClass>) => void;
  onAddSchedule: () => void;
  onRemoveSchedule: (idx: number) => void;
  onUpdateSchedule: (idx: number, patch: Partial<DraftClassSchedule>) => void;
  onDuplicateSchedule: (idx: number) => void;
  onSplitSchedule: (idx: number, groups: { days: string[] }[]) => void;
  onAddRequirement: (req: DraftClassRequirement) => void;
  onRemoveRequirement: (idx: number) => void;
  onUpdateRequirement: (idx: number, patch: Partial<DraftClassRequirement>) => void;
}) {
  const scheduleCount = cls.schedules?.length ?? 0;
  const isDropInDivision = divisions.find((d) => d.id === cls.division)?.is_drop_in ?? false;

  const TABS: { key: PanelTab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "schedule", label: `Schedule (${scheduleCount})` },
    { key: "requirements", label: "Requirements" },
  ];

  return (
    <div
      className="w-full md:w-[560px] md:shrink-0 flex flex-col bg-white border border-neutral-200 rounded-2xl overflow-hidden sticky top-0"
      style={{ maxHeight: "calc(100vh - 160px)" }}
    >
      {/* Panel header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-900 truncate pr-2">
          {cls.name || (
            <span className="italic font-normal text-neutral-400">
              {cls.offeringType === "competition_track" ? "New competition track" : "New class"}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 transition border border-neutral-200 rounded-lg px-2.5 py-1"
        >
          ✕ Close
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-neutral-200 px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === tab.key
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <DetailsTab
            cls={cls}
            isLocked={isLocked}
            rateBands={rateBands}
            specialRates={specialRates}
            semesterId={semesterId}
            divisions={divisions}
            isDropInDivision={isDropInDivision}
            onCreateDivision={onCreateDivision}
            rangeErrors={rangeErrors}
            onUpdateClass={onUpdateClass}
            onUpdateSchedule={onUpdateSchedule}
          />
        )}
        {activeTab === "schedule" && (
          <ScheduleTab
            cls={cls}
            isLocked={isLocked}
            rateBands={rateBands}
            specialRates={specialRates}
            isDropInDivision={isDropInDivision}
            onAddSchedule={onAddSchedule}
            onRemoveSchedule={onRemoveSchedule}
            onUpdateSchedule={onUpdateSchedule}
            onDuplicateSchedule={onDuplicateSchedule}
            onSplitSchedule={onSplitSchedule}
          />
        )}
        {activeTab === "requirements" && (
          <div className="p-4">
            <RequirementsSection
              requirements={cls.requirements ?? []}
              allClasses={allClasses.filter((c) => c !== cls)}
              isLocked={isLocked}
              onAdd={onAddRequirement}
              onRemove={onRemoveRequirement}
              onUpdate={onUpdateRequirement}
            />
          </div>
        )}
      </div>

      {/* Panel footer */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-neutral-200">
        {!isLocked ? (
          <button
            type="button"
            onClick={onRemoveClass}
            className="text-sm font-medium text-red-500 hover:text-red-700 transition"
          >
            Remove class
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-xl transition"
        >
          Save class
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DetailsTab                                                                 */
/* -------------------------------------------------------------------------- */

function DetailsTab({
  cls,
  isLocked,
  rateBands,
  specialRates,
  semesterId,
  divisions,
  isDropInDivision,
  onCreateDivision,
  rangeErrors,
  onUpdateClass,
  onUpdateSchedule,
}: {
  cls: DraftClass;
  isLocked: boolean;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
  semesterId?: string;
  divisions: Division[];
  isDropInDivision: boolean;
  onCreateDivision: (label: string, isDropIn: boolean) => Promise<Division>;
  rangeErrors: string[];
  onUpdateClass: (patch: Partial<DraftClass>) => void;
  onUpdateSchedule: (idx: number, patch: Partial<DraftClassSchedule>) => void;
}) {
  const isCompetitionTrack = cls.offeringType === "competition_track";

  // Inline "Create new division…" form state.
  const [showCreateDivision, setShowCreateDivision] = useState(false);
  const [newDivisionLabel, setNewDivisionLabel] = useState("");
  const [newDivisionIsDropIn, setNewDivisionIsDropIn] = useState(false);
  const [creatingDivision, setCreatingDivision] = useState(false);
  const [divisionError, setDivisionError] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-4">
      {/* Class name */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1.5">
          Class name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          disabled={isLocked}
          value={cls.name}
          onChange={(e) => onUpdateClass({ name: e.target.value })}
          placeholder="e.g. Ballet 1A"
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
        />
      </div>

      {/* Discipline + Division */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Discipline <span className="text-red-500">*</span>
          </label>
          <select
            disabled={isLocked}
            value={cls.discipline}
            onChange={(e) => onUpdateClass({ discipline: e.target.value })}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
          >
            {DISCIPLINES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Division <span className="text-red-500">*</span>
          </label>
          <select
            disabled={isLocked}
            value={cls.division}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "__create__") {
                setShowCreateDivision(true);
                setDivisionError(null);
                return;
              }
              onUpdateClass({ division: value });
              const selected = divisions.find((d) => d.id === value);
              const isDropIn = selected?.is_drop_in ?? false;
              // Auto-fill tuition on schedules with no tiers yet (skip for drop-in divisions)
              (cls.schedules ?? []).forEach((sched, idx) => {
                if (isDropIn) {
                  if (sched.pricingModel !== "per_session") {
                    onUpdateSchedule(idx, { pricingModel: "per_session" });
                  }
                  return;
                }
                if ((sched.priceTiers ?? []).length === 0) {
                  const tier = buildDefaultPriceTierFromState(
                    value, Math.max(1, sched.daysOfWeek.length),
                    cls.discipline, rateBands, specialRates,
                  );
                  if (tier) onUpdateSchedule(idx, { pricingModel: "full_schedule", priceTiers: [tier] });
                }
              });
            }}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
          >
            {!cls.division && <option value="">Select division…</option>}
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
            {!isLocked && <option value="__create__">+ Create new division…</option>}
          </select>
          {showCreateDivision && (
            <div className="mt-2 rounded-xl border border-primary-200 bg-primary-50/40 p-3 space-y-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">New division name</label>
                <input
                  type="text"
                  value={newDivisionLabel}
                  onChange={(e) => setNewDivisionLabel(e.target.value)}
                  placeholder="e.g. Drop-in, Teen Hip-Hop"
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={newDivisionIsDropIn}
                  onChange={(e) => setNewDivisionIsDropIn(e.target.checked)}
                />
                Drop-in division (per-date registration with capacity per session)
              </label>
              {divisionError && (
                <p className="text-xs text-red-600">{divisionError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={creatingDivision || !newDivisionLabel.trim()}
                  onClick={async () => {
                    setCreatingDivision(true);
                    setDivisionError(null);
                    try {
                      const created = await onCreateDivision(newDivisionLabel.trim(), newDivisionIsDropIn);
                      onUpdateClass({ division: created.id });
                      if (created.is_drop_in) {
                        (cls.schedules ?? []).forEach((sched, idx) => {
                          if (sched.pricingModel !== "per_session") {
                            onUpdateSchedule(idx, { pricingModel: "per_session" });
                          }
                        });
                      }
                      setShowCreateDivision(false);
                      setNewDivisionLabel("");
                      setNewDivisionIsDropIn(false);
                    } catch (err: unknown) {
                      setDivisionError(err instanceof Error ? err.message : "Failed to create division");
                    } finally {
                      setCreatingDivision(false);
                    }
                  }}
                  className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 px-3 py-1.5 rounded-lg transition"
                >
                  {creatingDivision ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateDivision(false);
                    setNewDivisionLabel("");
                    setNewDivisionIsDropIn(false);
                    setDivisionError(null);
                  }}
                  className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Min age + Max age */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Min age</label>
          <input
            type="number"
            min={0}
            disabled={isLocked}
            value={cls.minAge ?? ""}
            onChange={(e) =>
              onUpdateClass({ minAge: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="—"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Max age</label>
          <input
            type="number"
            min={0}
            disabled={isLocked}
            value={cls.maxAge ?? ""}
            onChange={(e) =>
              onUpdateClass({ maxAge: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="—"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
          />
        </div>
      </div>

      {/* Age errors */}
      {rangeErrors
        .filter((e) => e.toLowerCase().includes("age"))
        .map((msg, i) => (
          <p key={i} className="text-xs text-red-600 -mt-2">
            {msg}
          </p>
        ))}

      {/* Grade restriction (advanced — collapsible) */}
      {(cls.minGrade != null || cls.maxGrade != null) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Min grade (K=0)</label>
            <input
              type="number"
              min={0}
              disabled={isLocked}
              value={cls.minGrade ?? ""}
              onChange={(e) =>
                onUpdateClass({ minGrade: e.target.value ? Number(e.target.value) : undefined })
              }
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Max grade</label>
            <input
              type="number"
              min={0}
              disabled={isLocked}
              value={cls.maxGrade ?? ""}
              onChange={(e) =>
                onUpdateClass({ maxGrade: e.target.value ? Number(e.target.value) : undefined })
              }
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
            />
          </div>
        </div>
      )}
      {rangeErrors
        .filter((e) => e.toLowerCase().includes("grade"))
        .map((msg, i) => (
          <p key={i} className="text-xs text-red-600 -mt-2">
            {msg}
          </p>
        ))}

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1.5">Description</label>
        <textarea
          disabled={isLocked}
          value={cls.description ?? ""}
          onChange={(e) => onUpdateClass({ description: e.target.value || undefined })}
          rows={2}
          placeholder="Brief description shown to parents..."
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400 resize-none"
        />
      </div>

      {/* Competition track banner */}
      {isCompetitionTrack ? (
        <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 space-y-1">
          <p className="text-sm font-medium text-violet-800">Competition Track</p>
          <p className="text-xs text-violet-700">
            Visibility: <strong>Invite Only</strong> · Enrollment: <strong>Audition</strong>
          </p>
          <p className="text-xs text-violet-600">
            Manage audition slots and invitations in the{" "}
            {semesterId ? (
              <a href={`/admin/semesters/${semesterId}/invites`} className="underline hover:text-violet-800">
                Competition Invites
              </a>
            ) : (
              "Competition Invites"
            )}{" "}
            page.
          </p>
        </div>
      ) : (
        <>
          {/* Catalog visibility */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              Catalog visibility
            </label>
            <select
              disabled={isLocked}
              value={cls.visibility ?? "public"}
              onChange={(e) =>
                onUpdateClass({ visibility: e.target.value as "public" | "hidden" })
              }
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-50 disabled:text-neutral-400"
            >
              <option value="public">Public — appears in catalog</option>
              <option value="hidden">Hidden — direct link only</option>
            </select>
          </div>

        </>
      )}

      {/* Requires teacher rec — N/A for drop-in divisions */}
      {!isDropInDivision && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            disabled={isLocked}
            checked={cls.requiresTeacherRec ?? false}
            onChange={(e) => onUpdateClass({ requiresTeacherRec: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
          />
          <span className="text-sm text-neutral-700">Requires teacher recommendation</span>
        </label>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ScheduleTab                                                                */
/* -------------------------------------------------------------------------- */

function ScheduleTab({
  cls,
  isLocked,
  rateBands,
  specialRates,
  isDropInDivision,
  onAddSchedule,
  onRemoveSchedule,
  onUpdateSchedule,
  onDuplicateSchedule,
  onSplitSchedule,
}: {
  cls: DraftClass;
  isLocked: boolean;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
  isDropInDivision: boolean;
  onAddSchedule: () => void;
  onRemoveSchedule: (idx: number) => void;
  onUpdateSchedule: (idx: number, patch: Partial<DraftClassSchedule>) => void;
  onDuplicateSchedule: (idx: number) => void;
  onSplitSchedule: (idx: number, groups: { days: string[] }[]) => void;
}) {
  const schedules = cls.schedules ?? [];
  const isCompetitionTrack = cls.offeringType === "competition_track";

  if (isCompetitionTrack) {
    return (
      <div className="p-4">
        <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
          <p className="text-sm text-violet-700">
            Competition tracks don&apos;t have scheduled sessions. Audition slots are managed separately.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          {schedules.length === 0
            ? "No schedule blocks yet."
            : `${schedules.length} block${schedules.length !== 1 ? "s" : ""}`}
        </p>
        {!isLocked && (
          <button
            type="button"
            onClick={onAddSchedule}
            className="text-xs font-medium text-primary-600 hover:text-primary-800 transition"
          >
            + Add schedule block
          </button>
        )}
      </div>

      {schedules.map((schedule, si) => (
        <ScheduleEditor
          key={schedule._clientKey ?? si}
          schedule={schedule}
          isLocked={isLocked}
          canRemove={schedules.length > 0}
          blockNumber={si + 1}
          onChange={(patch) => onUpdateSchedule(si, patch)}
          onRemove={() => onRemoveSchedule(si)}
          onDuplicate={() => onDuplicateSchedule(si)}
          onSplit={(groups) => onSplitSchedule(si, groups)}
          division={cls.division}
          discipline={cls.discipline}
          rateBands={rateBands}
          specialRates={specialRates}
          isDropInDivision={isDropInDivision}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* ScheduleEditor                                                             */
/* -------------------------------------------------------------------------- */

function ScheduleEditor({
  schedule,
  isLocked,
  canRemove,
  blockNumber,
  onChange,
  onRemove,
  onDuplicate,
  onSplit,
  division,
  discipline,
  rateBands,
  specialRates,
  isDropInDivision,
}: {
  schedule: DraftClassSchedule;
  isLocked: boolean;
  canRemove: boolean;
  blockNumber: number;
  onChange: (patch: Partial<DraftClassSchedule>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onSplit: (groups: { days: string[] }[]) => void;
  division: string;
  discipline: string;
  rateBands: DraftTuitionRateBand[];
  specialRates: DraftSpecialProgramTuition[];
  isDropInDivision: boolean;
}) {
  const [newExcludedDate, setNewExcludedDate] = useState("");
  const [newExcludedReason, setNewExcludedReason] = useState("");
  const [showOptionForm, setShowOptionForm] = useState(false);
  const [showSplitConfig, setShowSplitConfig] = useState(false);
  const [draftOption, setDraftOption] = useState({
    name: "",
    description: "",
    price: "0",
    isRequired: false,
  });

  const priceTiers = schedule.priceTiers ?? [];
  const options = schedule.options ?? [];
  const excludedDates = schedule.excludedDates ?? [];
  const generatedCount = computeGeneratedCount(schedule);

  function handleToggleDay(day: string) {
    const current = schedule.daysOfWeek ?? [];
    const updated = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    const patch: Partial<DraftClassSchedule> = { daysOfWeek: updated };
    if ((schedule.priceTiers ?? []).length === 0 && updated.length > 0) {
      const tier = buildDefaultPriceTierFromState(division, updated.length, discipline, rateBands, specialRates);
      if (tier) { patch.pricingModel = "full_schedule"; patch.priceTiers = [tier]; }
    }
    onChange(patch);
  }

  function handleAddExcludedDate() {
    if (!newExcludedDate) return;
    if (excludedDates.some((d) => d.date === newExcludedDate)) return;
    onChange({ excludedDates: [...excludedDates, { date: newExcludedDate, reason: newExcludedReason || undefined }] });
    setNewExcludedDate("");
    setNewExcludedReason("");
  }

  function handleAmountChange(raw: string) {
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount < 0) return;
    const existing = priceTiers[0];
    const tier: DraftSchedulePriceTier = existing
      ? { ...existing, amount }
      : { _clientKey: Date.now().toString() + Math.random(), label: "Regular", amount, sortOrder: 0, isDefault: true };
    onChange({ priceTiers: [tier] });
  }

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
    setDraftOption({ name: "", description: "", price: "0", isRequired: false });
    setShowOptionForm(false);
  }

  const weeklyCount = Math.max(1, (schedule.daysOfWeek ?? []).length);
  const engineResult = calculateClassTuition({ division, weeklyClassCount: weeklyCount, discipline, rateBands, specialRates });
  const defaultTierFromEngine = buildDefaultPriceTierFromState(division, weeklyCount, discipline, rateBands, specialRates);
  const existingTier = priceTiers[0] ?? null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 overflow-hidden">
      {/* Block header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 bg-white">
        <p className="text-xs font-semibold text-neutral-700">Block {blockNumber}</p>
        {!isLocked && (
          <button
            type="button"
            onClick={onDuplicate}
            className="text-xs text-primary-600 hover:text-primary-800 transition font-medium"
          >
            Duplicate
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Days of week */}
        <div>
          <p className="text-xs text-neutral-500 mb-1.5">Days</p>
          <div className="flex flex-wrap gap-1">
            {DAYS_OF_WEEK.map((d) => {
              const active = (schedule.daysOfWeek ?? []).includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleToggleDay(d.value)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold border transition
                    ${active ? "bg-primary-600 text-white border-primary-600" : "bg-white text-neutral-600 border-neutral-300 hover:border-primary-400"}
                    disabled:opacity-50 disabled:cursor-default`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          {/* Split configurator */}
          {!isLocked && (schedule.daysOfWeek ?? []).length > 1 && (
            <div className="mt-2">
              {showSplitConfig ? (
                <SplitScheduleConfigurator
                  daysOfWeek={schedule.daysOfWeek ?? []}
                  onConfirm={(groups) => { onSplit(groups); setShowSplitConfig(false); }}
                  onCancel={() => setShowSplitConfig(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSplitConfig(true)}
                  className="text-xs text-primary-500 hover:text-primary-700 transition underline-offset-2 hover:underline"
                >
                  Split into separate blocks
                </button>
              )}
            </div>
          )}
        </div>

        {/* Start time / End time */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Start time</label>
            <TimeSelect
              value={schedule.startTime ?? ""}
              onChange={(v) => onChange({ startTime: v || undefined })}
              disabled={isLocked}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">End time</label>
            <TimeSelect
              value={schedule.endTime ?? ""}
              onChange={(v) => onChange({ endTime: v || undefined })}
              disabled={isLocked}
            />
          </div>
        </div>

        {/* Start date / End date */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Start date</label>
            <InlineDatePicker
              value={schedule.startDate ?? ""}
              onChange={(v) => onChange({ startDate: v || undefined })}
              disabled={isLocked}
              placement="left"
              timeTitle="Start time"
              timeLabel={schedule.startTime ? fmt12(schedule.startTime) : undefined}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">End date</label>
            <InlineDatePicker
              value={schedule.endDate ?? ""}
              onChange={(v) => onChange({ endDate: v || undefined })}
              disabled={isLocked}
              placement="left"
              timeTitle="End time"
              timeLabel={schedule.endTime ? fmt12(schedule.endTime) : undefined}
            />
          </div>
        </div>

        {/* Location / Instructor */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Location</label>
            <select
              disabled={isLocked}
              value={schedule.location ?? ""}
              onChange={(e) => onChange({ location: e.target.value || undefined })}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              <option value="">— Select —</option>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Instructor</label>
            <InstructorSelect
              value={schedule.instructorName ?? ""}
              onChange={(v) => onChange({ instructorName: v || undefined })}
              disabled={isLocked}
            />
          </div>
        </div>

        {/* Capacity / Urgency threshold */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Capacity</label>
            <input
              type="number"
              min={1}
              disabled={isLocked}
              value={schedule.capacity ?? ""}
              onChange={(e) => onChange({ capacity: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Urgency threshold</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                disabled={isLocked}
                value={schedule.urgencyThreshold ?? ""}
                onChange={(e) =>
                  onChange({ urgencyThreshold: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="—"
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
              />
              <span className="text-xs text-neutral-400 shrink-0">left</span>
            </div>
          </div>
        </div>

        {/* Reg opens / closes */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Reg. opens</label>
            <InlineDatePicker
              value={schedule.registrationOpenAt ? schedule.registrationOpenAt.slice(0, 10) : ""}
              onChange={(v) => onChange({ registrationOpenAt: v ? new Date(v + "T00:00:00").toISOString() : null })}
              disabled={isLocked}
              placement="left"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Reg. closes</label>
            <InlineDatePicker
              value={schedule.registrationCloseAt ? schedule.registrationCloseAt.slice(0, 10) : ""}
              onChange={(v) => onChange({ registrationCloseAt: v ? new Date(v + "T00:00:00").toISOString() : null })}
              disabled={isLocked}
              placement="left"
            />
          </div>
        </div>

        {/* Gender restriction */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Gender restriction</label>
            <select
              disabled={isLocked}
              value={schedule.genderRestriction ?? "no_restriction"}
              onChange={(e) =>
                onChange({ genderRestriction: e.target.value === "no_restriction" ? null : (e.target.value as "male" | "female") })
              }
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              <option value="no_restriction">No restriction</option>
              <option value="male">Male only</option>
              <option value="female">Female only</option>
            </select>
          </div>
        </div>

        {/* Sessions preview */}
        <div
          className={`rounded-lg px-3 py-2 flex items-center gap-2 ${
            generatedCount > 0 ? "bg-amber-50 border border-amber-200" : "bg-neutral-100 border border-neutral-200"
          }`}
        >
          <svg className={`w-3.5 h-3.5 shrink-0 ${generatedCount > 0 ? "text-amber-500" : "text-neutral-400"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className={`text-xs ${generatedCount > 0 ? "text-amber-700" : "text-neutral-500"}`}>
            {generatedCount > 0 ? (
              <>This schedule will generate <span className="font-semibold">{generatedCount}</span> session{generatedCount !== 1 ? "s" : ""}.</>
            ) : (
              "Configure days and date range to preview session count."
            )}
          </p>
        </div>

        {/* Pricing — driven by the class's division (drop-in vs full-schedule) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 uppercase tracking-wide">Pricing</p>

          {!isDropInDivision && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-500">Semester tuition</p>
                {!isLocked && defaultTierFromEngine && (
                  <button
                    type="button"
                    onClick={() => onChange({ pricingModel: "full_schedule", priceTiers: [defaultTierFromEngine] })}
                    className="text-xs text-neutral-400 hover:text-primary-600 transition"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 max-w-40">
                <span className="text-sm text-neutral-500">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={isLocked}
                  value={existingTier ? existingTier.amount.toFixed(2) : ""}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder={defaultTierFromEngine ? defaultTierFromEngine.amount.toFixed(2) : "0.00"}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
                />
              </div>
              {engineResult.source === "unresolved" && !existingTier && (
                <p className="text-xs text-neutral-400 italic">
                  No tuition rate is configured for this division — enter a flat amount above, or set up rate bands in Payment → Tuition Rates.
                </p>
              )}
              {existingTier && engineResult.autoPayInstallmentAmount && existingTier.amount === engineResult.semesterTotal && (
                <p className="text-xs text-neutral-400">
                  Auto-pay: 5× ${engineResult.autoPayInstallmentAmount.toFixed(2)}/mo
                </p>
              )}
            </div>
          )}

          {isDropInDivision && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-neutral-500">Default drop-in price per session</p>
                <div className="flex items-center gap-2 max-w-40">
                  <span className="text-sm text-neutral-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isLocked}
                    value={schedule.dropInPrice ?? ""}
                    onChange={(e) => onChange({ dropInPrice: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
                  />
                  <span className="text-xs text-neutral-400 shrink-0">/ date</span>
                </div>
              </div>

              <PerDateOverridesEditor
                schedule={schedule}
                isLocked={isLocked}
                onChange={(overrides) => onChange({ perDateOverrides: overrides })}
              />
            </div>
          )}
        </div>

        {/* Excluded dates */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 uppercase tracking-wide">Excluded dates</p>
          {excludedDates.length === 0 && <p className="text-xs text-neutral-400 italic">No excluded dates.</p>}
          <div className="flex flex-wrap gap-1.5">
            {excludedDates.map((d) => (
              <span key={d.date} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700">
                {d.date}
                {d.reason && <span className="text-neutral-400">({d.reason})</span>}
                {!isLocked && (
                  <button type="button" onClick={() => onChange({ excludedDates: excludedDates.filter((x) => x.date !== d.date) })} className="text-neutral-400 hover:text-red-500 transition">
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {!isLocked && (
            <div className="flex gap-2 items-end flex-wrap">
              <InlineDatePicker
                value={newExcludedDate}
                onChange={setNewExcludedDate}
                placement="left"
              />
              <input
                type="text"
                value={newExcludedReason}
                onChange={(e) => setNewExcludedReason(e.target.value)}
                placeholder="Reason (optional)"
                className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button
                type="button"
                onClick={handleAddExcludedDate}
                disabled={!newExcludedDate}
                className="text-xs font-medium text-primary-600 hover:text-primary-800 disabled:opacity-40 transition"
              >
                + Add
              </button>
            </div>
          )}
        </div>

        {/* Session options (add-ons) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-600 uppercase tracking-wide">Add-ons</p>
            {!isLocked && !showOptionForm && (
              <button type="button" onClick={() => setShowOptionForm(true)} className="text-xs font-medium text-primary-600 hover:text-primary-800 transition">
                + Add option
              </button>
            )}
          </div>
          {options.length === 0 && !showOptionForm && (
            <p className="text-xs text-neutral-400 italic">No add-ons for this schedule.</p>
          )}
          {options.map((opt) => (
            <div key={opt._clientKey} className="flex items-start justify-between rounded-lg border border-neutral-200 px-3 py-2 bg-white">
              <div>
                <p className="text-xs font-medium text-neutral-700">
                  {opt.name}
                  {opt.isRequired && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Required</span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">${opt.price.toFixed(2)}{opt.description ? ` · ${opt.description}` : ""}</p>
              </div>
              {!isLocked && (
                <button type="button" onClick={() => onChange({ options: options.filter((o) => o._clientKey !== opt._clientKey) })} className="ml-3 shrink-0 text-xs text-red-500 hover:text-red-700 transition">
                  Remove
                </button>
              )}
            </div>
          ))}
          {showOptionForm && (
            <div className="rounded-lg border border-primary-200 bg-primary-50/30 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Name *</label>
                  <input type="text" value={draftOption.name} onChange={(e) => setDraftOption((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Recital Ticket" className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Price ($)</label>
                  <input type="number" min={0} step="0.01" value={draftOption.price} onChange={(e) => setDraftOption((d) => ({ ...d, price: e.target.value }))} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600" />
                </div>
              </div>
              <input type="text" value={draftOption.description} onChange={(e) => setDraftOption((d) => ({ ...d, description: e.target.value }))} placeholder="Description (optional)" className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600" />
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={draftOption.isRequired} onChange={(e) => setDraftOption((d) => ({ ...d, isRequired: e.target.checked }))} className="rounded border-neutral-300 text-primary-600 focus:ring-primary-600" />
                <span className="text-xs text-neutral-700">Required at checkout</span>
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowOptionForm(false); setDraftOption({ name: "", description: "", price: "0", isRequired: false }); }} className="text-xs text-neutral-500 hover:text-neutral-700 transition px-2 py-1">Cancel</button>
                <button type="button" onClick={handleAddOption} disabled={!draftOption.name.trim()} className="text-xs font-medium bg-primary-600 text-white px-3 py-1 rounded-lg hover:bg-primary-700 transition disabled:opacity-50">Add option</button>
              </div>
            </div>
          )}
        </div>

        {/* Remove block */}
        {!isLocked && canRemove && (
          <div className="flex justify-end pt-1">
            <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 transition">
              Remove schedule block
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PerDateOverridesEditor                                                      */
/* -------------------------------------------------------------------------- */

function PerDateOverridesEditor({
  schedule,
  isLocked,
  onChange,
}: {
  schedule: DraftClassSchedule;
  isLocked: boolean;
  onChange: (overrides: import("@/types").DraftPerDateOverride[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dates = computeGeneratedDates(schedule);
  const overrides = schedule.perDateOverrides ?? [];
  const overridesByDate = new Map(overrides.map((o) => [o.date, o]));

  function patchOverride(date: string, patch: Partial<import("@/types").DraftPerDateOverride>) {
    const existing = overridesByDate.get(date);
    const merged: import("@/types").DraftPerDateOverride = {
      date,
      capacity: existing?.capacity ?? null,
      startTime: existing?.startTime ?? null,
      endTime: existing?.endTime ?? null,
      dropInPrice: existing?.dropInPrice ?? null,
      ...patch,
    };
    const isEmpty =
      merged.capacity == null &&
      merged.startTime == null &&
      merged.endTime == null &&
      merged.dropInPrice == null;
    const next = overrides.filter((o) => o.date !== date);
    if (!isEmpty) next.push(merged);
    next.sort((a, b) => a.date.localeCompare(b.date));
    onChange(next);
  }

  function fmtDate(d: string): string {
    try {
      const dt = new Date(d + "T00:00:00");
      return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return d;
    }
  }

  if (dates.length === 0) {
    return (
      <p className="text-xs text-neutral-400 italic">
        Configure days and date range to set per-date capacity overrides.
      </p>
    );
  }

  const overrideCount = overrides.filter((o) =>
    o.capacity != null || o.startTime != null || o.endTime != null || o.dropInPrice != null,
  ).length;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div>
          <p className="text-xs font-medium text-neutral-700">Per-date overrides</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {dates.length} dates · {overrideCount} customized
          </p>
        </div>
        <span className="text-xs text-neutral-500">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="border-t border-neutral-200 max-h-72 overflow-y-auto">
          {dates.map((date) => {
            const ov = overridesByDate.get(date);
            return (
              <div key={date} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 border-b border-neutral-100 last:border-b-0">
                <p className="text-xs text-neutral-700">{fmtDate(date)}</p>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-400">cap</span>
                  <input
                    type="number"
                    min={1}
                    disabled={isLocked}
                    value={ov?.capacity ?? ""}
                    onChange={(e) =>
                      patchOverride(date, { capacity: e.target.value ? Number(e.target.value) : null })
                    }
                    placeholder={schedule.capacity != null ? String(schedule.capacity) : "—"}
                    className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-600 disabled:bg-neutral-100"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isLocked}
                    value={ov?.dropInPrice ?? ""}
                    onChange={(e) =>
                      patchOverride(date, { dropInPrice: e.target.value ? parseFloat(e.target.value) : null })
                    }
                    placeholder={schedule.dropInPrice != null ? schedule.dropInPrice.toFixed(2) : "—"}
                    className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-600 disabled:bg-neutral-100"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TimeSelect                                                                  */
/* -------------------------------------------------------------------------- */

function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  // Free-text time input with optional dropdown of 15-min preset times (7 AM–11 PM).
  // Typed values are normalized via parseTimeInput so off-grid times (e.g. 7:40)
  // still work; the dropdown is just a convenience for common slots.
  const [text, setText] = useState(() => (value ? fmt12(value) : ""));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Re-sync local text when the canonical value changes from outside (e.g. reset).
  useEffect(() => {
    setText(value ? fmt12(value) : "");
    setError(null);
  }, [value]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // When opening, scroll the currently selected option into view.
  useEffect(() => {
    if (!open || !value) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-time="${value}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, value]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setError(null);
      return;
    }
    const parsed = parseTimeInput(trimmed);
    if (!parsed) {
      setError("Use format like 7:40 PM");
      return;
    }
    setError(null);
    setText(fmt12(parsed));
    if (parsed !== value) onChange(parsed);
  }

  function selectPreset(v: string) {
    setError(null);
    setText(fmt12(v));
    setOpen(false);
    if (v !== value) onChange(v);
  }

  // Filter the 15-min grid by what the user has typed. Substring match on the
  // 12-hour label (case/space-insensitive) so "7:" narrows to 7:00–7:45 AM/PM,
  // "7:4" narrows to 7:40-ish (none in grid → empty filter), "pm" → afternoon.
  const filteredOptions = (() => {
    const q = text.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return TIME_OPTIONS;
    return TIME_OPTIONS.filter((opt) => opt.label.toLowerCase().replace(/\s+/g, "").includes(q));
  })();

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="7:40 PM"
          className="w-full rounded-lg border border-neutral-300 pl-2 pr-8 py-1.5 text-sm bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:cursor-default"
        />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => {
            // Prevent input blur from firing before the click toggles state.
            e.preventDefault();
          }}
          onClick={() => setOpen((o) => !o)}
          aria-label="Pick a common time"
          className="absolute inset-y-0 right-0 flex items-center px-2 text-neutral-400 hover:text-neutral-600 disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && !disabled && (
        <div
          ref={listRef}
          className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <p className="px-2 py-2 text-xs italic text-neutral-400">
              No preset matches — press Enter to keep your typed time.
            </p>
          ) : (
            filteredOptions.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-time={opt.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPreset(opt.value)}
                  className={`block w-full text-left px-2 py-1.5 text-sm hover:bg-neutral-100 ${
                    selected ? "bg-primary-50 text-primary-700 font-medium" : "text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* InstructorSelect                                                            */
/* -------------------------------------------------------------------------- */

// Module-level cache so multiple ScheduleEditor instances share a single fetch.
let instructorsCache: InstructorOption[] | null = null;
let instructorsPromise: Promise<InstructorOption[]> | null = null;
function loadInstructors(): Promise<InstructorOption[]> {
  if (instructorsCache) return Promise.resolve(instructorsCache);
  if (!instructorsPromise) {
    instructorsPromise = getInstructors().then((list) => {
      instructorsCache = list;
      return list;
    });
  }
  return instructorsPromise;
}

function InstructorSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [instructors, setInstructors] = useState<InstructorOption[]>(instructorsCache ?? []);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    let alive = true;
    loadInstructors().then((list) => {
      if (alive) setInstructors(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const q = text.trim().toLowerCase();
  const filtered = q
    ? instructors.filter(
        (i) => i.fullName.toLowerCase().includes(q) || i.email.toLowerCase().includes(q),
      )
    : instructors;

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed !== value) onChange(trimmed);
  }

  function selectInstructor(opt: InstructorOption) {
    setText(opt.fullName);
    setOpen(false);
    if (opt.fullName !== value) onChange(opt.fullName);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="e.g. Sarah L."
          className="w-full rounded-lg border border-neutral-300 pl-2 pr-8 py-1.5 text-sm bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-neutral-100 disabled:text-neutral-400"
        />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          aria-label="Pick an instructor"
          className="absolute inset-y-0 right-0 flex items-center px-2 text-neutral-400 hover:text-neutral-600 disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-neutral-400">
              {instructors.length === 0 ? "Loading instructors…" : "No matches — typed name will be used"}
            </div>
          ) : (
            filtered.map((opt) => {
              const selected = opt.fullName === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectInstructor(opt)}
                  className={`block w-full text-left px-2 py-1.5 text-sm hover:bg-neutral-100 ${
                    selected ? "bg-primary-50 text-primary-700 font-medium" : "text-slate-700"
                  }`}
                >
                  <div className="truncate">{opt.fullName}</div>
                  {opt.email && <div className="truncate text-xs text-neutral-400">{opt.email}</div>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SplitScheduleConfigurator                                                   */
/* -------------------------------------------------------------------------- */

function SplitScheduleConfigurator({
  daysOfWeek,
  onConfirm,
  onCancel,
}: {
  daysOfWeek: string[];
  onConfirm: (groups: { days: string[] }[]) => void;
  onCancel: () => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, number>>(
    () => Object.fromEntries(daysOfWeek.map((d) => [d, 1])),
  );
  const [groupCount, setGroupCount] = useState(2);

  const groupLabels = Array.from({ length: groupCount }, (_, i) => `Block ${i + 1}`);

  function handleAssign(day: string, value: number) {
    if (value === groupCount + 1) {
      const newIdx = groupCount + 1;
      setGroupCount((g) => g + 1);
      setAssignments((prev) => ({ ...prev, [day]: newIdx }));
    } else {
      setAssignments((prev) => ({ ...prev, [day]: value }));
    }
  }

  const usedGroupIndices = [...new Set(Object.values(assignments))].sort((a, b) => a - b);
  const isValid = usedGroupIndices.length >= 2;

  function handleConfirm() {
    const groups = usedGroupIndices.map((gIdx) => ({
      days: daysOfWeek.filter((d) => assignments[d] === gIdx),
    }));
    onConfirm(groups);
  }

  return (
    <div className="mt-1 rounded-lg border border-primary-200 bg-white p-3 space-y-3">
      <p className="text-xs font-semibold text-neutral-700">Split into blocks — assign each day to a block</p>
      <div className="space-y-2">
        {daysOfWeek.map((day) => {
          const dayLabel = DAYS_OF_WEEK.find((d) => d.value === day)?.label ?? day;
          return (
            <div key={day} className="flex items-center gap-3">
              <span className="text-xs text-neutral-700 w-10 shrink-0">{dayLabel}</span>
              <select
                value={assignments[day]}
                onChange={(e) => handleAssign(day, Number(e.target.value))}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                {groupLabels.map((label, i) => (
                  <option key={i} value={i + 1}>{label}</option>
                ))}
                <option value={groupCount + 1}>+ New block</option>
              </select>
            </div>
          );
        })}
      </div>
      {!isValid && (
        <p className="text-xs rounded-lg bg-mauve/10 text-mauve-text px-2.5 py-1.5">
          Assign days to at least 2 different blocks to split.
        </p>
      )}
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-700 transition px-2 py-1">Cancel</button>
        <button type="button" onClick={handleConfirm} disabled={!isValid} className="text-xs font-medium bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-40">
          Confirm Split
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RequirementsSection                                                         */
/* -------------------------------------------------------------------------- */

const REQUIREMENT_TYPES: { value: DraftClassRequirement["requirement_type"]; label: string }[] = [
  { value: "prerequisite_completed", label: "Prerequisite required" },
  { value: "concurrent_enrollment", label: "Concurrent enrollment" },
  { value: "teacher_recommendation", label: "Teacher recommendation" },
  { value: "audition_required", label: "Audition required" },
];

function emptyRequirement(): DraftClassRequirement {
  return {
    requirement_type: "concurrent_enrollment",
    description: "",
    enforcement: "hard_block",
    is_waivable: false,
    approvedDancerIds: [],
  };
}

function defaultEnforcement(type: DraftClassRequirement["requirement_type"]): "hard_block" | "soft_warn" {
  return type === "teacher_recommendation" ? "soft_warn" : "hard_block";
}

function AuditionWaiverPanel({ requirementId }: { requirementId: string }) {
  const [waivers, setWaivers] = useState<RequirementWaiverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dancerIdInput, setDancerIdInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    getRequirementWaivers(requirementId).then(setWaivers).finally(() => setLoading(false));
  }, [requirementId]);

  function handleGrant() {
    const id = dancerIdInput.trim();
    if (!id) return;
    startTransition(async () => {
      await grantRequirementWaiver(requirementId, id, notesInput.trim() || undefined);
      const updated = await getRequirementWaivers(requirementId);
      setWaivers(updated);
      setDancerIdInput("");
      setNotesInput("");
    });
  }

  function handleRevoke(waiverId: string) {
    startTransition(async () => {
      await revokeRequirementWaiver(waiverId);
      setWaivers((prev) => prev.filter((w) => w.id !== waiverId));
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-primary-100 bg-primary-50/40 px-3 py-2.5 space-y-2">
      <p className="text-xs font-semibold text-primary-700">Approved Dancers (Audition Passed)</p>
      {loading ? (
        <p className="text-xs text-neutral-400 italic">Loading…</p>
      ) : waivers.length === 0 ? (
        <p className="text-xs text-neutral-400 italic">No dancers approved yet.</p>
      ) : (
        <ul className="space-y-1">
          {waivers.map((w) => (
            <li key={w.id} className="flex items-center justify-between text-xs">
              <span className="text-neutral-700">{w.dancer_name}</span>
              <button type="button" disabled={isPending} onClick={() => handleRevoke(w.id)} className="ml-2 text-red-500 hover:text-red-700 transition disabled:opacity-40">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 pt-1">
        <input type="text" value={dancerIdInput} onChange={(e) => setDancerIdInput(e.target.value)} placeholder="Dancer UUID" className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600" />
        <input type="text" value={notesInput} onChange={(e) => setNotesInput(e.target.value)} placeholder="Notes (optional)" className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600" />
        <button type="button" disabled={!dancerIdInput.trim() || isPending} onClick={handleGrant} className="shrink-0 text-xs font-medium bg-primary-600 text-white px-3 py-1 rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
          Mark Passed
        </button>
      </div>
    </div>
  );
}

function RequirementsSection({
  requirements,
  allClasses,
  isLocked,
  onAdd,
  onRemove,
  onUpdate,
}: {
  requirements: DraftClassRequirement[];
  allClasses: DraftClass[];
  isLocked: boolean;
  onAdd: (req: DraftClassRequirement) => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<DraftClassRequirement>) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftClassRequirement>(emptyRequirement());
  const [expandedWaiverIdx, setExpandedWaiverIdx] = useState<number | null>(null);

  function handleTypeChange(type: DraftClassRequirement["requirement_type"]) {
    setDraft((d) => ({ ...d, requirement_type: type, enforcement: defaultEnforcement(type), required_class_id: null }));
  }

  function handleAdd() {
    if (!draft.description.trim()) return;
    onAdd({ ...draft });
    setDraft(emptyRequirement());
    setShowForm(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-800">Enrollment Requirements</h4>
        {!isLocked && !showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="text-xs font-medium text-primary-600 hover:text-primary-800 transition">
            + Add requirement
          </button>
        )}
      </div>

      {requirements.length === 0 && !showForm && (
        <p className="text-xs text-neutral-400 italic">
          No requirements set. Competition classes typically need audition + concurrent technique.
        </p>
      )}

      {requirements.map((req, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 px-3 py-2 bg-neutral-50/50 space-y-1">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-neutral-700">
                {REQUIREMENT_TYPES.find((t) => t.value === req.requirement_type)?.label ?? req.requirement_type}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${req.enforcement === "hard_block" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                  {req.enforcement === "hard_block" ? "Hard block" : "Soft warn"}
                </span>
                {req.is_waivable && <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600">Waivable</span>}
                {req.requirement_type === "teacher_recommendation" && (req.approvedDancerIds?.length ?? 0) > 0 && (
                  <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{req.approvedDancerIds!.length} approved</span>
                )}
              </p>
              <p className="text-xs text-neutral-500">{req.description}</p>
              {(req.requirement_type === "concurrent_enrollment" || req.requirement_type === "prerequisite_completed") && req.required_class_id && (
                <p className="text-xs text-primary-600">
                  {req.requirement_type === "concurrent_enrollment" ? "Required concurrent:" : "Required prior:"}{" "}
                  {allClasses.find((c) => c.id === req.required_class_id)?.name ?? req.required_class_id}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {req.requirement_type === "audition_required" && req.id && (
                <button type="button" onClick={() => setExpandedWaiverIdx(expandedWaiverIdx === i ? null : i)} className="text-xs text-primary-600 hover:text-primary-800 transition">
                  {expandedWaiverIdx === i ? "Hide" : "Manage"} approvals
                </button>
              )}
              {!isLocked && (
                <button type="button" onClick={() => onRemove(i)} className="text-xs text-red-500 hover:text-red-700 transition">
                  Remove
                </button>
              )}
            </div>
          </div>

          {req.requirement_type === "audition_required" && req.id && expandedWaiverIdx === i && (
            <AuditionWaiverPanel requirementId={req.id} />
          )}

          {req.requirement_type === "teacher_recommendation" && !isLocked && (
            <div className="pt-1">
              <p className="text-xs text-neutral-500 mb-1">Approved dancers (bypass warning):</p>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {(req.approvedDancerIds ?? []).map((did) => (
                  <span key={did} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
                    {did.slice(0, 8)}…
                    <button type="button" onClick={() => onUpdate(i, { approvedDancerIds: (req.approvedDancerIds ?? []).filter((id) => id !== did) })} className="ml-0.5 hover:text-red-500 transition">×</button>
                  </span>
                ))}
              </div>
              <AddApprovedDancerInput onAdd={(did) => onUpdate(i, { approvedDancerIds: [...(req.approvedDancerIds ?? []), did] })} />
            </div>
          )}
        </div>
      ))}

      {showForm && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Type *</label>
              <select
                value={draft.requirement_type}
                onChange={(e) => handleTypeChange(e.target.value as DraftClassRequirement["requirement_type"])}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                {REQUIREMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Enforcement *</label>
              <select
                value={draft.enforcement}
                onChange={(e) => setDraft((d) => ({ ...d, enforcement: e.target.value as "soft_warn" | "hard_block" }))}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <option value="hard_block">Hard block (prevents enrollment)</option>
                <option value="soft_warn">Soft warning (shows message)</option>
              </select>
            </div>
          </div>

          {draft.requirement_type === "concurrent_enrollment" && (
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Required concurrent class *</label>
              <select
                value={draft.required_class_id ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, required_class_id: e.target.value || null }))}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <option value="">— Select class —</option>
                {allClasses.filter((c) => c.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.division ? `(${c.division})` : ""}</option>
                ))}
              </select>
            </div>
          )}

          {draft.requirement_type === "prerequisite_completed" && (
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Required prior class *</label>
              <select
                value={draft.required_class_id ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, required_class_id: e.target.value || null }))}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <option value="">— Select class —</option>
                {allClasses.filter((c) => c.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.division ? `(${c.division})` : ""}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-neutral-500 mb-1">Message shown to user *</label>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="e.g. Must be concurrently enrolled in Technique 1"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.is_waivable}
              onChange={(e) => setDraft((d) => ({ ...d, is_waivable: e.target.checked }))}
              className="rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
            />
            <span className="text-xs text-neutral-700">Admin can grant waivers for individual dancers</span>
          </label>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setDraft(emptyRequirement()); }}
              className="text-xs text-neutral-500 hover:text-neutral-700 transition px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={
                !draft.description.trim() ||
                ((draft.requirement_type === "concurrent_enrollment" || draft.requirement_type === "prerequisite_completed") && !draft.required_class_id)
              }
              className="text-xs font-medium bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              Add Requirement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddApprovedDancerInput({ onAdd }: { onAdd: (dancerId: string) => void }) {
  const [value, setValue] = useState("");
  function handleAdd() {
    const id = value.trim();
    if (!id) return;
    onAdd(id);
    setValue("");
  }
  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Dancer UUID"
        className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={handleAdd}
        className="shrink-0 text-xs font-medium bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}
