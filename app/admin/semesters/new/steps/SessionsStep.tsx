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
      const data = await getSessions();
      setAllSessions(data);
    }
    loadSessions();
  }, []);

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

  function handleSubmit() {
    dispatch({
      type: "SET_SESSIONS",
      payload: {
        appliedSessions: appliedSessions,
      },
    });
    onNext();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Sessions</h2>

      {/* Applied Sessions */}
      <section>
        <h3 className="font-medium mb-2">Applied Sessions</h3>

        {appliedSessions.length === 0 && (
          <p className="text-sm text-muted">No sessions added</p>
        )}

        <ul className="space-y-2">
          {appliedSessions.map((session) => (
            <li
              key={session.sessionId}
              className="border rounded p-3 flex justify-between"
            >
              <div>
                <div className="font-medium">
                  {session.overriddenTitle ?? session.title}
                </div>
                <div className="text-sm text-muted">
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

                <div className="text-sm text-muted">
                  {resolveOverride(session.overriddenType, session.type)} ·
                  Capacity:{" "}
                  {resolveOverride(
                    session.overriddenCapacity,
                    session.capacity,
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="text-blue-600 text-sm"
                  onClick={() => setEditingSession(session)}
                >
                  Quick edit
                </button>
                <button
                  className="text-red-600 text-sm"
                  onClick={() => handleRemoveSession(session.sessionId)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Available Sessions */}
      <section>
        <h3 className="font-medium mb-2">Available Sessions</h3>

        <ul className="space-y-2">
          {availableSessions?.map((s) => (
            <li key={s.id} className="border rounded p-3 flex justify-between">
              <div>
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-muted">
                  {s.start_date} → {s.end_date} · {s.days_of_week?.join(", ")}
                </div>
                <div className="text-sm text-muted">
                  {s.type} · Capacity: {s.capacity}
                </div>
              </div>

              <button
                className="text-sm text-green-600"
                onClick={() => handleAddSession(s)}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-between">
        <button onClick={onBack}>Back</button>
        <button onClick={handleSubmit}>Next</button>
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
