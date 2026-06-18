"use client";

import { useMemo, useState } from "react";
import { GripVertical, Loader2 } from "lucide-react";
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
  /** True while the wizard is persisting the draft — drives the Next button's saving state. */
  isSaving?: boolean;
};

type LocalGroup = {
  id: string;
  name: string;
  sessionIds: string[];
};

type ClassRow = {
  key: string;
  name: string;
  discipline: string;
  disciplineLabel: string;
  sessionIds: string[];
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

/* -------------------------------------------------------------------------- */
/* SortableGroupCard                                                          */
/* -------------------------------------------------------------------------- */

function SortableGroupCard({
  group,
  classNames,
  sessionCount,
  onDelete,
}: {
  group: LocalGroup;
  classNames: string[];
  sessionCount: number;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });
  const has = classNames.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`rounded-xl px-4 py-3 ${has ? "bg-primary-50/40" : ""}`}
      // border tint matches prototype (.gcard / .gcard.has)
    >
      <div
        className="rounded-xl"
        style={{
          border: `1px solid ${has ? "var(--primary-200, #E6D5D1)" : "var(--admin-border)"}`,
          padding: 0,
        }}
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                {...attributes}
                {...listeners}
                className="text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing shrink-0 touch-none leading-none"
                title="Drag to reorder"
                tabIndex={-1}
              >
                <GripVertical size={14} />
              </button>
              <span className="text-sm font-semibold text-neutral-900 truncate">{group.name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-neutral-500">
                {classNames.length} {classNames.length === 1 ? "class" : "classes"} · {sessionCount} sessions
              </span>
              <button
                onClick={onDelete}
                className="text-xs text-neutral-400 hover:text-primary-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          {has ? (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {classNames.map((n) => (
                <span
                  key={n}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700"
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 italic mt-1.5">No classes — assign from the table.</p>
          )}
        </div>
      </div>
    </div>
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
  isSaving = false,
}: SessionGroupsStepProps) {
  const [groups, setGroups] = useState<LocalGroup[]>(state.sessionGroups?.groups ?? []);
  const [newGroupName, setNewGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /* ----------------------------- Derived ---------------------------------- */

  const classRows = useMemo<ClassRow[]>(
    () =>
      (state.sessions?.classes ?? []).map((cls) => ({
        key: cls.id ?? cls.name,
        name: cls.name,
        discipline: cls.discipline,
        disciplineLabel:
          DISCIPLINES.find((d) => d.value === cls.discipline)?.label ?? cls.discipline,
        sessionIds: (cls.schedules ?? []).map((cs) => cs.id ?? cs._clientKey),
      })),
    [state.sessions?.classes],
  );

  const totalSessions = useMemo(
    () => classRows.reduce((a, r) => a + r.sessionIds.length, 0),
    [classRows],
  );

  const groupedIds = useMemo(
    () => new Set(groups.flatMap((g) => g.sessionIds)),
    [groups],
  );

  const ungroupedSessions = useMemo(
    () => classRows.flatMap((r) => r.sessionIds).filter((id) => !groupedIds.has(id)).length,
    [classRows, groupedIds],
  );

  // A class's group = the group containing ALL its sessions (else "" = unassigned/mixed).
  function classGroupId(row: ClassRow): string {
    if (row.sessionIds.length === 0) return "";
    const gids = row.sessionIds.map(
      (sid) => groups.find((g) => g.sessionIds.includes(sid))?.id ?? "",
    );
    const first = gids[0];
    return gids.every((x) => x === first) ? first : "";
  }

  function classesInGroup(group: LocalGroup): string[] {
    return classRows
      .filter((r) => r.sessionIds.length > 0 && r.sessionIds.every((id) => group.sessionIds.includes(id)))
      .map((r) => r.name);
  }

  /* ----------------------------- Handlers --------------------------------- */

  // Move a class's sessions into `groupId` (or remove from all when groupId === "").
  function assignClass(row: ClassRow, groupId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        const cleaned = g.sessionIds.filter((id) => !row.sessionIds.includes(id));
        return groupId && g.id === groupId
          ? { ...g, sessionIds: [...cleaned, ...row.sessionIds] }
          : { ...g, sessionIds: cleaned };
      }),
    );
  }

  function bulkAssign(groupId: string) {
    if (!groupId) return;
    const ids = new Set(
      classRows.filter((r) => selected.has(r.key)).flatMap((r) => r.sessionIds),
    );
    setGroups((prev) =>
      prev.map((g) => {
        const cleaned = g.sessionIds.filter((id) => !ids.has(id));
        return g.id === groupId
          ? { ...g, sessionIds: [...cleaned, ...ids] }
          : { ...g, sessionIds: cleaned };
      }),
    );
    setSelected(new Set());
  }

  function autoGroupByDiscipline() {
    setGroups((prev) => {
      const next: LocalGroup[] = prev.map((g) => ({ ...g, sessionIds: [] }));
      const byName = (n: string) => next.find((g) => g.name.toLowerCase() === n.toLowerCase());
      classRows.forEach((row) => {
        if (row.sessionIds.length === 0) return;
        let g = byName(row.disciplineLabel);
        if (!g) {
          g = { id: crypto.randomUUID(), name: row.disciplineLabel, sessionIds: [] };
          next.push(g);
        }
        g.sessionIds = [...g.sessionIds, ...row.sessionIds];
      });
      return next;
    });
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setGroups((prev) => [...prev, { id: crypto.randomUUID(), name, sessionIds: [] }]);
    setNewGroupName("");
  }

  function handleDeleteGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleGroupsReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setGroups((prev) => {
      const oldIdx = prev.findIndex((g) => g.id === active.id);
      const newIdx = prev.findIndex((g) => g.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleSubmit() {
    dispatch({ type: "SET_SESSION_GROUPS", payload: { groups } });
    onNext();
  }

  /* ------------------------------ Render ---------------------------------- */

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      {/* Scrollable canvas */}
      <div className="flex-1 min-h-0 flex flex-col px-4 md:px-6 pt-6 overflow-hidden">
        {/* Step header */}
        <div className="mb-5 shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--admin-text-faint)" }}>
            Step 3 of 8
          </p>
          <h1 className="text-[26px] font-semibold tracking-tight mt-1" style={{ color: "var(--admin-text)" }}>
            Class groups
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--admin-text-muted)" }}>
            Bundle a class into a group and all its sessions go with it. Families can book a group
            together or sessions à la carte.
          </p>
        </div>

        {/* Two-pane split */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-5">
          {/* ── Left: classes table ──────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col bg-white border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 shrink-0">
              <span className="text-sm font-semibold text-neutral-900">Classes</span>
              <span className="flex-1" />
              <button
                onClick={autoGroupByDiscipline}
                disabled={classRows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-primary-50 disabled:opacity-40"
                style={{ borderColor: "var(--admin-sidebar-active)", color: "var(--admin-sidebar-active)" }}
              >
                ✦ Auto-group by discipline
              </button>
            </div>

            {/* Bulk-assign bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 border-b border-primary-200 bg-primary-50">
                <span className="text-[13px] font-semibold text-primary-700">{selected.size} selected</span>
                <span className="flex-1" />
                <select
                  defaultValue=""
                  onChange={(e) => { bulkAssign(e.target.value); e.currentTarget.value = ""; }}
                  className="admin-input text-[13px] py-1.5 max-w-[180px]"
                >
                  <option value="">Assign to…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 hover:text-neutral-800">
                  Clear
                </button>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-0" style={{ scrollbarWidth: "none" }}>
              {classRows.length === 0 ? (
                <div className="flex items-center justify-center h-full py-16">
                  <p className="text-sm text-neutral-400">No classes yet. Add classes in the previous step.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: "var(--admin-table-header-bg)" }}>
                      <th className="w-9 px-4 py-2.5" />
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Class</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Sessions</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide w-[200px]" style={{ color: "var(--admin-table-header-text)" }}>Group</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {classRows.map((row) => {
                      const color = DISCIPLINE_COLORS[row.discipline] ?? { bg: "bg-neutral-100", text: "text-neutral-600" };
                      const gid = classGroupId(row);
                      return (
                        <tr key={row.key} className="hover:bg-neutral-50">
                          <td className="px-4 py-2 align-middle">
                            <input
                              type="checkbox"
                              checked={selected.has(row.key)}
                              onChange={() => toggleSelect(row.key)}
                              className="w-4 h-4 align-middle"
                              style={{ accentColor: "var(--admin-sidebar-active)" }}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-900">{row.name}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                                {row.disciplineLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-neutral-500">{row.sessionIds.length}</td>
                          <td className="px-4 py-2">
                            <select
                              value={gid}
                              onChange={(e) => assignClass(row, e.target.value)}
                              className={`admin-input text-[13px] py-1.5 w-full max-w-[180px] ${gid ? "font-semibold" : ""}`}
                              style={gid ? { color: "var(--admin-sidebar-active)" } : undefined}
                            >
                              <option value="">Unassigned</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Right: groups ────────────────────────────────────────── */}
          <div className="w-full lg:w-[340px] shrink-0 flex flex-col bg-white border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 shrink-0">
              <span className="text-sm font-semibold text-neutral-900">Groups</span>
              <p className="text-xs text-neutral-500 mt-0.5">Drag to reorder — sets the order families see.</p>
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  placeholder="New group name…"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  className="admin-input flex-1 text-[13px] py-2"
                />
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  className="rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-40 transition-colors"
                  style={{ background: "var(--admin-surface-sub, #EDE9E4)", color: "#38342E" }}
                >
                  Create
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 [&::-webkit-scrollbar]:w-0" style={{ scrollbarWidth: "none" }}>
              {groups.length === 0 ? (
                <p className="text-sm text-neutral-400 italic text-center py-8">
                  No groups yet — create one above.
                </p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupsReorder}>
                  <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                    {groups.map((group) => (
                      <SortableGroupCard
                        key={group.id}
                        group={group}
                        classNames={classesInGroup(group)}
                        sessionCount={group.sessionIds.length}
                        onDelete={() => handleDeleteGroup(group.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {classRows.length > 0 && (
              <div className="shrink-0 px-4 py-2.5 border-t border-neutral-100 text-xs text-neutral-500">
                <b className="text-neutral-800 font-semibold">{ungroupedSessions}</b> of {totalSessions} sessions
                ungrouped — available for standalone booking.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer nav (this step manages its own footer; parent's is hidden) */}
      <div
        className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3"
        style={{ background: "var(--admin-surface)", borderTop: "1px solid var(--admin-border)" }}
      >
        <button
          onClick={onBack}
          className="text-sm rounded-lg px-4 py-2 transition-colors hover:bg-neutral-50"
          style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-faint)" }}
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="inline-flex items-center gap-2 text-sm font-semibold text-white rounded-xl px-5 py-2.5 transition-colors hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--admin-sidebar-active)" }}
        >
          {isSaving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>Next: Payment →</>
          )}
        </button>
      </div>
    </div>
  );
}
