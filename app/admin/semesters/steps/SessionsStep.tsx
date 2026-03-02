"use client";

import { DraftClass, DraftClassRequirement, DraftClassSession, SessionsStepProps } from "@/types";
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

function emptySession(): DraftClassSession {
  return {
    dayOfWeek: "monday",
    startTime: "",
    endTime: "",
    startDate: "",
    endDate: "",
    location: "",
    capacity: undefined,
    registrationCloseAt: null,
  };
}

function emptyClass(): DraftClass {
  return {
    name: "",
    discipline: "ballet",
    division: "junior",
    level: "",
    description: "",
    minAge: undefined,
    maxAge: undefined,
    isCompetitionTrack: false,
    requiresTeacherRec: false,
    sessions: [emptySession()],
  };
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
  /* Session-level handlers                                                  */
  /* ---------------------------------------------------------------------- */

  function handleAddSession(classIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? { ...c, sessions: [...c.sessions, emptySession()] }
          : c,
      ),
    );
  }

  function handleRemoveSession(classIdx: number, sessionIdx: number) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? {
              ...c,
              sessions: c.sessions.filter((_, si) => si !== sessionIdx),
            }
          : c,
      ),
    );
  }

  function handleUpdateSession(
    classIdx: number,
    sessionIdx: number,
    patch: Partial<DraftClassSession>,
  ) {
    setClasses((prev) =>
      prev.map((c, i) =>
        i === classIdx
          ? {
              ...c,
              sessions: c.sessions.map((s, si) =>
                si === sessionIdx ? { ...s, ...patch } : s,
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
          Classes &amp; Sessions
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Create the classes offered this semester. Each class can have one or
          more weekly sessions (day/time slots). Students enroll in individual
          sessions.
        </p>
      </div>

      {isLocked && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This semester has active registrations. Classes and sessions are
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
            onAddSession={() => handleAddSession(classIdx)}
            onUpdateSession={(sessionIdx, patch) =>
              handleUpdateSession(classIdx, sessionIdx, patch)
            }
            onRemoveSession={(sessionIdx) =>
              handleRemoveSession(classIdx, sessionIdx)
            }
            onAddRequirement={(req) => handleUpdateClass(classIdx, {
              requirements: [...(cls.requirements ?? []), req],
            })}
            onRemoveRequirement={(reqIdx) => handleUpdateClass(classIdx, {
              requirements: (cls.requirements ?? []).filter((_, i) => i !== reqIdx),
            })}
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
  onAddSession,
  onUpdateSession,
  onRemoveSession,
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
  onAddSession: () => void;
  onUpdateSession: (idx: number, patch: Partial<DraftClassSession>) => void;
  onRemoveSession: (idx: number) => void;
  onAddRequirement: (req: DraftClassRequirement) => void;
  onRemoveRequirement: (idx: number) => void;
}) {
  const sessionCount = cls.sessions.length;
  const disciplineLabel =
    DISCIPLINES.find((d) => d.value === cls.discipline)?.label ?? cls.discipline;
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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
              {sessionCount} session{sessionCount !== 1 ? "s" : ""}
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
                onChange={(e) => onUpdateClass({ level: e.target.value || undefined })}
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
                      minAge: e.target.value ? Number(e.target.value) : undefined,
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
                      maxAge: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
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
              onChange={(e) => onUpdateClass({ description: e.target.value || undefined })}
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

          {/* Sessions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">
                Weekly Sessions
              </h4>
              {!isLocked && (
                <button
                  type="button"
                  onClick={onAddSession}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
                >
                  + Add session
                </button>
              )}
            </div>

            {cls.sessions.length === 0 && (
              <p className="text-xs text-gray-400 italic">No sessions yet.</p>
            )}

            {cls.sessions.map((session, sessionIdx) => (
              <SessionRow
                key={sessionIdx}
                session={session}
                isLocked={isLocked}
                canRemove={cls.sessions.length > 0}
                onChange={(patch) => onUpdateSession(sessionIdx, patch)}
                onRemove={() => onRemoveSession(sessionIdx)}
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
/* SessionRow                                                                  */
/* -------------------------------------------------------------------------- */

function SessionRow({
  session,
  isLocked,
  canRemove,
  onChange,
  onRemove,
}: {
  session: DraftClassSession;
  isLocked: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<DraftClassSession>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50/50">
      {/* Row 1: Day + Start/End time */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Day *</label>
          <select
            disabled={isLocked}
            value={session.dayOfWeek}
            onChange={(e) => onChange({ dayOfWeek: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          >
            {DAYS_OF_WEEK.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start time</label>
          <input
            type="time"
            disabled={isLocked}
            value={session.startTime ?? ""}
            onChange={(e) => onChange({ startTime: e.target.value || undefined })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End time</label>
          <input
            type="time"
            disabled={isLocked}
            value={session.endTime ?? ""}
            onChange={(e) => onChange({ endTime: e.target.value || undefined })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
      </div>

      {/* Row 2: Start/End date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start date</label>
          <input
            type="date"
            disabled={isLocked}
            value={session.startDate ?? ""}
            onChange={(e) => onChange({ startDate: e.target.value || undefined })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End date</label>
          <input
            type="date"
            disabled={isLocked}
            value={session.endDate ?? ""}
            onChange={(e) => onChange({ endDate: e.target.value || undefined })}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
      </div>

      {/* Row 3: Location + Capacity + Reg close */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Location</label>
          <input
            type="text"
            disabled={isLocked}
            value={session.location ?? ""}
            onChange={(e) => onChange({ location: e.target.value || undefined })}
            placeholder="Studio A"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Capacity</label>
          <input
            type="number"
            min={1}
            disabled={isLocked}
            value={session.capacity ?? ""}
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
            Registration closes
          </label>
          <input
            type="datetime-local"
            disabled={isLocked}
            value={
              session.registrationCloseAt
                ? session.registrationCloseAt.slice(0, 16)
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

      {/* Remove session */}
      {!isLocked && canRemove && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700 transition"
          >
            Remove session
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RequirementsSection                                                         */
/* -------------------------------------------------------------------------- */

const REQUIREMENT_TYPES: { value: DraftClassRequirement["requirement_type"]; label: string }[] = [
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
          No requirements. Competition classes typically need audition + concurrent technique.
        </p>
      )}

      {requirements.map((req, i) => (
        <div
          key={i}
          className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2 bg-gray-50/50"
        >
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-gray-700">
              {REQUIREMENT_TYPES.find((t) => t.value === req.requirement_type)?.label ?? req.requirement_type}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${req.enforcement === "hard_block" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
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
                onChange={(e) => setDraft((d) => ({ ...d, requirement_type: e.target.value as DraftClassRequirement["requirement_type"] }))}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {REQUIREMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Enforcement *</label>
              <select
                value={draft.enforcement}
                onChange={(e) => setDraft((d) => ({ ...d, enforcement: e.target.value as "soft_warn" | "hard_block" }))}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="hard_block">Hard block (prevents enrollment)</option>
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
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="e.g. Must be concurrently enrolled in Technique 1"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Required discipline (optional)</label>
              <input
                type="text"
                value={draft.required_discipline ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, required_discipline: e.target.value || null }))}
                placeholder="e.g. ballet, technique"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Required level (optional)</label>
              <input
                type="text"
                value={draft.required_level ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, required_level: e.target.value || null }))}
                placeholder="e.g. 1, 2, Advanced"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.is_waivable}
              onChange={(e) => setDraft((d) => ({ ...d, is_waivable: e.target.checked }))}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-700">
              Admin can grant waivers for individual dancers
            </span>
          </label>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setDraft(emptyRequirement()); }}
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
