"use client";

import QuickEditModal from "@/app/components/semester-flow/QuickEditModal";
import { getSessions } from "@/queries/admin";
import { SemesterSession, Session, SessionsStepProps } from "@/types";
import { useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Prefer an overridden value if present; otherwise fall back to the original.
 */

function resolveOverride<T>(override?: T, original?: T): T | undefined {
  return override ?? original;
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
  const [allSessions, setAllSessions] = useState<Session[] | null>([]);
  const [appliedSessions, setAppliedSessions] = useState<SemesterSession[]>(
    state.sessions?.appliedSessions ?? [],
  );
  const [editingSession, setEditingSession] = useState<SemesterSession | null>(
    null,
  );

  /* ------------------------------------------------------------------------ */
  /* Data loading                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    async function loadSessions() {
      const data = await getSessions(state.id);
      setAllSessions(data);
    }
    loadSessions();
  }, [state.id]);

  /* ------------------------------------------------------------------------ */
  /* Derived data                                                             */
  /* ------------------------------------------------------------------------ */

  const availableSessions = useMemo(
    () =>
      allSessions?.filter(
        (session) =>
          !appliedSessions.some((applied) => applied.sessionId === session.id),
      ),
    [allSessions, appliedSessions],
  );

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function handleAddSession(session: Session) {
    if (appliedSessions.some((s) => s.sessionId === session.id)) return;

    console.log("Adding session:", session.id);

    setAppliedSessions((prev) => [
      ...prev,
      {
        sessionId: session.id,

        title: session.title,
        type: session.type ?? null,
        capacity: session.capacity ?? null,

        startDate: session.start_date,
        endDate: session.end_date,
        daysOfWeek: session.days_of_week ?? [],
      },
    ]);
  }

  function handleRemoveSession(sessionId: string) {
    setAppliedSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }

  function handleSaveEdit(updated: SemesterSession) {
    setAppliedSessions((prev) =>
      prev.map((s) => (s.sessionId === updated.sessionId ? updated : s)),
    );
    setEditingSession(null);
  }

  // function handleSubmit() {
  //   dispatch({
  //     type: "SET_SESSIONS",
  //     payload: {
  //       appliedSessions: appliedSessions,
  //     },
  //   });
  //   onNext();
  // }

  function handleSubmit() {
    console.group("📚 SessionsStep.handleSubmit");
    console.log("Applied Sessions:", appliedSessions);

    dispatch({
      type: "SET_SESSIONS",
      payload: {
        appliedSessions: appliedSessions,
      },
    });

    console.log("Reducer updated with sessions");
    console.groupEnd();

    onNext();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Sessions
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage sessions applied to this semester.
        </p>
      </div>

      {isLocked && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This semester has active registrations. Sessions are locked.
        </div>
      )}

      {/* Applied Sessions */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Applied Sessions
        </h3>

        {appliedSessions.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-500">No sessions added</p>
          </div>
        )}

        <ul className="space-y-4">
          {appliedSessions.map((session) => (
            <li
              key={session.sessionId}
              className="border border-gray-200 rounded-xl p-4 flex justify-between items-start hover:border-gray-300 transition"
            >
              <div className="space-y-1 flex-1">
                <div className="font-medium text-gray-900">
                  {session.overriddenTitle ?? session.title}
                </div>

                <div className="text-sm text-gray-500">
                  {resolveOverride(
                    session.overriddenStartDate,
                    session.startDate,
                  )}{" "}
                  →{" "}
                  {resolveOverride(session.overriddenEndDate, session.endDate)}{" "}
                  ·{" "}
                  {resolveOverride(
                    session.overriddenDaysOfWeek,
                    session.daysOfWeek,
                  )?.join(", ")}
                </div>

                <div className="text-sm text-gray-500">
                  {resolveOverride(session.overriddenType, session.type)} ·
                  Capacity:{" "}
                  {resolveOverride(
                    session.overriddenCapacity,
                    session.capacity,
                  )}
                </div>

                {/* Registration close date */}
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-xs text-gray-500 shrink-0">
                    Registration closes:
                  </label>
                  <input
                    type="datetime-local"
                    disabled={isLocked}
                    value={
                      session.registrationCloseAt
                        ? session.registrationCloseAt.slice(0, 16)
                        : ""
                    }
                    onChange={(e) => {
                      const updated = {
                        ...session,
                        registrationCloseAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      };
                      setAppliedSessions((prev) =>
                        prev.map((s) =>
                          s.sessionId === session.sessionId ? updated : s,
                        ),
                      );
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              {!isLocked && (
                <div className="flex gap-3 shrink-0">
                  <button
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
                    onClick={() => setEditingSession(session)}
                  >
                    Quick edit
                  </button>
                  <button
                    className="text-sm font-medium text-red-600 hover:text-red-700 transition"
                    onClick={() => handleRemoveSession(session.sessionId)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Available Sessions */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Available Sessions
        </h3>

        <ul className="space-y-4">
          {availableSessions?.map((s) => (
            <li
              key={s.id}
              className="border border-gray-200 rounded-xl p-4 flex justify-between items-start hover:border-gray-300 transition"
            >
              <div className="space-y-1">
                <div className="font-medium text-gray-900">{s.title}</div>

                <div className="text-sm text-gray-500">
                  {s.start_date} → {s.end_date} · {s.days_of_week?.join(", ")}
                </div>

                <div className="text-sm text-gray-500">
                  {s.type} · Capacity: {s.capacity}
                </div>
              </div>

              {!isLocked && (
                <button
                  className="text-sm font-medium text-green-600 hover:text-green-700 transition shrink-0"
                  onClick={() => handleAddSession(s)}
                >
                  Add
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

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

      {editingSession && (
        <QuickEditModal
          session={editingSession}
          onCancel={() => setEditingSession(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
