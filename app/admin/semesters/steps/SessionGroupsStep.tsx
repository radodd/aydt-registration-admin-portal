"use client";

import { useMemo, useState } from "react";
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

  /* ------------------------------------------------------------------------ */
  /* Derived Data                                                             */
  /* ------------------------------------------------------------------------ */

  // Flatten DraftClass[] → { sessionId, title } so group membership uses class_session IDs
  const appliedSessions = useMemo(
    () =>
      (state.sessions?.classes ?? []).flatMap((cls) =>
        (cls.schedules ?? []).map((cs) => ({
          sessionId: cs.id ?? "",
          title: `${cls.name} — ${cs.daysOfWeek.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}`,
        })),
      ),
    [state.sessions?.classes],
  );

  /* ------------------------------------------------------------------------ */
  /* Derived Data                                                             */
  /* ------------------------------------------------------------------------ */

  const sessionGroupMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((group) => {
      group.sessionIds.forEach((id) => {
        map.set(id, group.name);
      });
    });
    return map;
  }, [groups]);

  const ungroupedSessions = useMemo(() => {
    return appliedSessions.filter(
      (session) => !sessionGroupMap.has(session.sessionId),
    );
  }, [appliedSessions, sessionGroupMap]);

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function handleCreateGroup() {
    if (!newGroupName.trim()) return;

    const newGroup: LocalGroup = {
      id: crypto.randomUUID(),
      name: newGroupName.trim(),
      sessionIds: [],
    };

    setGroups((prev) => [...prev, newGroup]);
    setNewGroupName("");
  }

  function handleDeleteGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleAddSessionToGroup(groupId: string, sessionId: string) {
    setGroups((prev) =>
      prev.map((group) => {
        // Remove session from all groups first
        const cleanedSessionIds = group.sessionIds.filter(
          (id) => id !== sessionId,
        );

        // Then add to target group only
        if (group.id === groupId) {
          return {
            ...group,
            sessionIds: [...cleanedSessionIds, sessionId],
          };
        }

        return {
          ...group,
          sessionIds: cleanedSessionIds,
        };
      }),
    );
  }

  function handleRemoveSessionFromGroup(groupId: string, sessionId: string) {
    setGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              sessionIds: group.sessionIds.filter((id) => id !== sessionId),
            }
          : group,
      ),
    );
  }

  function handleSubmit() {
    dispatch({
      type: "SET_SESSION_GROUPS",
      payload: {
        groups: groups,
      },
    });

    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Session Groups
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Create groups to allow users to book sessions a la carte.
        </p>
      </div>

      {/* All Sessions Overview */}

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          All Sessions Overview
        </h3>

        {appliedSessions.length === 0 && (
          <div className="text-sm text-gray-500">
            No sessions applied in previous step.
          </div>
        )}

        <ul className="space-y-3">
          {appliedSessions.map((session) => {
            const groupName = sessionGroupMap.get(session.sessionId);

            return (
              <li
                key={session.sessionId}
                className="flex justify-between items-center border border-gray-200 rounded-xl p-4"
              >
                <div className="text-sm font-medium text-gray-900">
                  {session.title}
                </div>

                {groupName ? (
                  <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                    {groupName}
                  </span>
                ) : (
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                    Unassigned
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Create Group */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Create New Group
        </h3>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleCreateGroup}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            Create
          </button>
        </div>
      </section>

      {/* Groups */}
      {groups.map((group) => (
        <section
          key={group.id}
          className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">
              {group.name}
            </h3>

            <button
              onClick={() => handleDeleteGroup(group.id)}
              className="text-sm font-medium text-red-600 hover:text-red-700 transition"
            >
              Delete group
            </button>
          </div>

          {/* Assigned Sessions */}
          {group.sessionIds.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
              <p className="text-sm text-gray-500">
                No sessions assigned to this group.
              </p>
            </div>
          )}

          <ul className="space-y-3">
            {group.sessionIds.map((sessionId) => {
              const session = appliedSessions.find(
                (s) => s.sessionId === sessionId,
              );
              if (!session) return null;

              return (
                <li
                  key={session.sessionId}
                  className="flex justify-between items-center border border-gray-200 rounded-xl p-3"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {session.title}
                  </span>

                  <button
                    onClick={() =>
                      handleRemoveSessionFromGroup(group.id, session.sessionId)
                    }
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove session
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Add Sessions */}
          {ungroupedSessions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">
                Add Sessions
              </h4>

              <ul className="space-y-2">
                {ungroupedSessions.map((session) => (
                  <li
                    key={session.sessionId}
                    className="flex justify-between items-center border border-gray-200 rounded-xl p-3"
                  >
                    <span className="text-sm text-gray-700">
                      {session.title}
                    </span>

                    <button
                      onClick={() =>
                        handleAddSessionToGroup(group.id, session.sessionId)
                      }
                      className="text-sm font-medium text-green-600 hover:text-green-700"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      {/* Ungrouped Notice */}
      {appliedSessions.length > 0 && ungroupedSessions.length > 0 && (
        <div className="text-sm text-gray-500">
          {ungroupedSessions.length} session(s) remain ungrouped and will be
          available for standalone booking.
        </div>
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
