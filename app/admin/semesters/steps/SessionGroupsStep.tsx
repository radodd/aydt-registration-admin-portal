"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SemesterDraft, SemesterAction } from "@/types";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type SessionGroupsStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
};

type LocalGroup = {
  id: string;
  name: string;
  sessionIds: string[];
};

type AppliedSession = {
  sessionId: string;
  className: string;
  discipline: string;
  disciplineLabel: string;
  dayLabel: string;
  timeLabel: string;
};

/* -------------------------------------------------------------------------- */
/* Constants — mirror SessionsStep.tsx                                        */
/* -------------------------------------------------------------------------- */

const DISCIPLINES: { value: string; label: string }[] = [
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

const DAYS: { value: string; label: string }[] = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const hour = parseInt(h, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${period}`;
}

function fmtDays(days: string[]): string {
  return days
    .map((d) => DAYS.find((x) => x.value === d)?.label ?? d)
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/* Scroll + fade hook                                                         */
/* -------------------------------------------------------------------------- */

function useScrollFades(ref: React.RefObject<HTMLDivElement | null>) {
  const [topFade, setTopFade] = useState(false);
  const [bottomFade, setBottomFade] = useState(false);

  function update() {
    const el = ref.current;
    if (!el) return;
    setTopFade(el.scrollTop > 0);
    setBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }

  useEffect(() => {
    update();
  });

  return { topFade, bottomFade, onScroll: update };
}

/* -------------------------------------------------------------------------- */
/* SortableSessionItem                                                        */
/* -------------------------------------------------------------------------- */

function SortableSessionItem({
  sessionId,
  session,
  onRemove,
}: {
  sessionId: string;
  session: AppliedSession;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sessionId });

  const color = DISCIPLINE_COLORS[session.discipline] ?? {
    bg: "bg-neutral-100",
    text: "text-neutral-600",
  };

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-center justify-between px-5 py-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-neutral-900">
              {session.className}
            </span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}
            >
              {session.disciplineLabel}
            </span>
          </div>
          {(session.dayLabel || session.timeLabel) && (
            <p className="text-xs text-neutral-500 mt-0.5">
              {session.dayLabel}
              {session.timeLabel ? ` · ${session.timeLabel}` : ""}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onRemove}
        className="text-sm text-neutral-400 hover:text-red-600 transition ml-4 shrink-0"
      >
        ✕ Remove
      </button>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SessionsGroupsStep({
  state,
  dispatch,
  onNext,
  onBack,
}: SessionGroupsStepProps) {
  const [groups, setGroups] = useState<LocalGroup[]>(
    state.sessionGroups?.groups ?? [],
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [assignState, setAssignState] = useState<{
    sessionId: string;
    top: number;
    left: number;
  } | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const tableFades = useScrollFades(tableRef);
  const groupsFades = useScrollFades(groupsRef);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleGroupDragEnd(groupId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const oldIdx = g.sessionIds.indexOf(String(active.id));
        const newIdx = g.sessionIds.indexOf(String(over.id));
        return { ...g, sessionIds: arrayMove(g.sessionIds, oldIdx, newIdx) };
      }),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Derived                                                                  */
  /* ------------------------------------------------------------------------ */

  const appliedSessions = useMemo<AppliedSession[]>(
    () =>
      (state.sessions?.classes ?? []).flatMap((cls) =>
        (cls.schedules ?? []).map((cs) => ({
          sessionId: cs.id ?? cs._clientKey,
          className: cls.name,
          discipline: cls.discipline,
          disciplineLabel:
            DISCIPLINES.find((d) => d.value === cls.discipline)?.label ??
            cls.discipline,
          dayLabel: fmtDays(cs.daysOfWeek),
          timeLabel:
            cs.startTime && cs.endTime
              ? `${fmt12(cs.startTime)}–${fmt12(cs.endTime)}`
              : "",
        })),
      ),
    [state.sessions?.classes],
  );

  const sessionGroupMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => g.sessionIds.forEach((id) => map.set(id, g.name)));
    return map;
  }, [groups]);

  const ungroupedCount = useMemo(
    () => appliedSessions.filter((s) => !sessionGroupMap.has(s.sessionId)).length,
    [appliedSessions, sessionGroupMap],
  );

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setGroups((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: newGroupName.trim(), sessionIds: [] },
    ]);
    setNewGroupName("");
  }

  function handleDeleteGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleAssign(groupId: string, sessionId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        const cleaned = g.sessionIds.filter((id) => id !== sessionId);
        return g.id === groupId
          ? { ...g, sessionIds: [...cleaned, sessionId] }
          : { ...g, sessionIds: cleaned };
      }),
    );
    setAssignState(null);
  }

  function handleRemove(groupId: string, sessionId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, sessionIds: g.sessionIds.filter((id) => id !== sessionId) }
          : g,
      ),
    );
  }

  function handleSubmit() {
    dispatch({ type: "SET_SESSION_GROUPS", payload: { groups } });
    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="flex flex-col md:flex-row w-full gap-4 md:gap-8 p-4 md:p-6 md:h-full md:min-h-0">
      {/* ------------------------------------------------------------------ */}
      {/* Left: Sessions card                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col bg-white border border-neutral-200 rounded-2xl overflow-hidden min-w-0 h-72 md:h-auto md:flex-1">
        {/* Card header */}
        <div className="px-6 py-4 border-b border-neutral-200 shrink-0">
          <h2 className="text-base font-semibold text-neutral-900">
            Sessions
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Click + to assign a session to a group
          </p>
        </div>

        {/* Table */}
        <div className="relative flex-1 min-h-0">
          {tableFades.topFade && (
            <div
              className="absolute top-0 left-0 right-0 h-8 pointer-events-none z-10"
              style={{ background: "linear-gradient(to bottom, #fff, transparent)" }}
            />
          )}

          <div
            ref={tableRef}
            onScroll={() => { tableFades.onScroll(); setAssignState(null); }}
            className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-0"
            style={{ scrollbarWidth: "none" }}
          >
            {appliedSessions.length === 0 ? (
              <div className="flex items-center justify-center h-full py-16">
                <p className="text-sm text-neutral-400">
                  No sessions yet. Add sessions in the previous step.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: "var(--admin-table-header-bg)" }}>
                    <th
                      className="text-left px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--admin-table-header-text)" }}
                    >
                      Class
                    </th>
                    <th
                      className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--admin-table-header-text)" }}
                    >
                      Schedule
                    </th>
                    <th
                      className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--admin-table-header-text)" }}
                    >
                      Group
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-100">
                  {appliedSessions.map((session) => {
                    const groupName = sessionGroupMap.get(session.sessionId);
                    const color =
                      DISCIPLINE_COLORS[session.discipline] ?? {
                        bg: "bg-neutral-100",
                        text: "text-neutral-600",
                      };

                    return (
                      <tr key={session.sessionId} className="hover:bg-neutral-50">
                        {/* Class */}
                        <td className="px-6 py-3">
                          <span className="font-medium text-neutral-900">
                            {session.className}
                          </span>
                          <span
                            className={`block mt-0.5 w-fit rounded-full px-2 py-0 text-xs font-medium ${color.bg} ${color.text}`}
                          >
                            {session.disciplineLabel}
                          </span>
                        </td>

                        {/* Schedule */}
                        <td className="px-4 py-3 text-neutral-600">
                          {session.dayLabel ? (
                            <div>
                              <p className="text-neutral-700">{session.dayLabel}</p>
                              {session.timeLabel && (
                                <p className="text-xs text-neutral-400">
                                  {session.timeLabel}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>

                        {/* Group */}
                        <td className="px-4 py-3">
                          {groupName ? (
                            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
                              {groupName}
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setAssignState((prev) =>
                                    prev?.sessionId === session.sessionId
                                      ? null
                                      : { sessionId: session.sessionId, top: rect.bottom + 4, left: rect.left },
                                  );
                                }}
                                className="text-xs font-medium text-primary-600 hover:text-primary-700"
                              >
                                + Assign
                              </button>

                              {assignState?.sessionId === session.sessionId && (
                                <div
                                  className="fixed z-50 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-40"
                                  style={{ top: assignState.top, left: assignState.left }}
                                >
                                  {groups.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-neutral-400">
                                      Create a group first
                                    </p>
                                  ) : (
                                    groups.map((g) => (
                                      <button
                                        key={g.id}
                                        onClick={() => handleAssign(g.id, session.sessionId)}
                                        className="w-full text-left px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                                      >
                                        {g.name}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {tableFades.bottomFade && (
            <div
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none z-10"
              style={{ background: "linear-gradient(to top, #fff, transparent)" }}
            />
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right: Groups                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative md:flex-1 md:min-h-0">
        {groupsFades.topFade && (
          <div
            className="absolute top-0 left-0 right-0 h-10 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(to bottom, var(--admin-page-bg), transparent)",
            }}
          />
        )}

        <div
          ref={groupsRef}
          onScroll={groupsFades.onScroll}
          className="md:h-full overflow-y-auto space-y-4 pl-2 pr-1 [&::-webkit-scrollbar]:w-0"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Header */}
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">
              Class groups
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Group sessions so families can book them together or à la carte.
            </p>
          </div>

          {/* Create group */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="New group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
            />
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40 transition"
            >
              Create group
            </button>
          </div>

          {/* Group cards */}
          {groups.map((group) => {
            const count = group.sessionIds.length;
            return (
              <div
                key={group.id}
                className="border border-neutral-200 rounded-xl overflow-hidden bg-white"
              >
                <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                  <span className="text-sm font-semibold text-neutral-900">
                    {group.name}{" "}
                    <span className="font-normal text-neutral-500">
                      {count} {count === 1 ? "session" : "sessions"}
                    </span>
                  </span>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-700 transition"
                  >
                    Delete group
                  </button>
                </div>

                {count === 0 ? (
                  <p className="px-5 py-4 text-sm text-neutral-400 text-center">
                    No sessions — assign from the table.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleGroupDragEnd(group.id, e)}
                  >
                    <SortableContext
                      items={group.sessionIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="divide-y divide-neutral-100">
                        {group.sessionIds.map((sessionId) => {
                          const session = appliedSessions.find(
                            (s) => s.sessionId === sessionId,
                          );
                          if (!session) return null;
                          return (
                            <SortableSessionItem
                              key={sessionId}
                              sessionId={sessionId}
                              session={session}
                              onRemove={() => handleRemove(group.id, sessionId)}
                            />
                          );
                        })}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            );
          })}

          {/* Ungrouped notice */}
          {appliedSessions.length > 0 && ungroupedCount > 0 && (
            <p className="text-sm text-neutral-500">
              <span className="font-medium">{ungroupedCount}</span>{" "}
              {ungroupedCount === 1 ? "session is" : "sessions are"} ungrouped
              and will be available for standalone booking.
            </p>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4 border-t border-neutral-200">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 rounded-xl bg-primary-600 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition"
            >
              Next
            </button>
          </div>
        </div>

        {groupsFades.bottomFade && (
          <div
            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(to top, var(--admin-page-bg), transparent)",
            }}
          />
        )}
      </div>
    </div>
  );
}
