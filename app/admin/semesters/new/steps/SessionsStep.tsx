"use client";

import QuickEditModal from "@/app/components/semester-flow/QuickEditModal";
import { getSessions } from "@/queries/admin";
import { SemesterSession, Session } from "@/types";
import { useEffect, useState } from "react";

export default function SessionsStep({ state, dispatch, onNext, onBack }) {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [applied, setApplied] = useState<SemesterSession[]>(
    state.sessions?.appliedSessions ?? [],
  );

  const [editing, setEditing] = useState<SemesterSession | null>(null);

  function effective<T>(override?: T, original?: T): T | undefined {
    return override ?? original;
  }

  useEffect(() => {
    (async () => {
      const data = await getSessions();
      setAllSessions(data);
    })();
  }, []);

  function addSession(session: Session) {
    if (applied.find((s) => s.sessionId === session.id)) return;

    setApplied((prev) => [
      ...prev,
      {
        sessionId: session.id,
        title: session.title,
        startDate: session.start_date,
        endDate: session.end_date,
        daysOfWeek: session.days_of_week ?? [],
        type: session.type,
        capacity: session.capacity,
      },
    ]);
  }

  function removeSession(sessionId: string) {
    setApplied((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }

  function saveEdit(updated: SemesterSession) {
    setApplied((prev) =>
      prev.map((s) => (s.sessionId === updated.sessionId ? updated : s)),
    );
    setEditing(null);
  }

  function submit() {
    dispatch({
      type: "SET_SESSIONS",
      payload: {
        appliedSessions: applied,
      },
    });
    onNext();
  }

  const available = allSessions.filter(
    (s) => !applied.some((a) => a.sessionId === s.id),
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Sessions</h2>

      {/* Applied Sessions */}
      <section>
        <h3 className="font-medium mb-2">Applied Sessions</h3>

        {applied.length === 0 && (
          <p className="text-sm text-muted">No sessions added</p>
        )}

        <ul className="space-y-2">
          {applied.map((s) => (
            <li
              key={s.sessionId}
              className="border rounded p-3 flex justify-between"
            >
              <div>
                <div className="font-medium">
                  {s.overriddenTitle ?? s.title}
                </div>
                <div className="text-sm text-muted">
                  {effective(s.overriddenStartDate, s.startDate)} →{" "}
                  {effective(s.overriddenEndDate, s.endDate)} ·{" "}
                  {effective(s.overriddenDaysOfWeek, s.daysOfWeek)?.join(", ")}
                </div>

                <div className="text-sm text-muted">
                  {effective(s.overriddenType, s.type)} · Capacity:{" "}
                  {effective(s.overriddenCapacity, s.capacity)}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="text-blue-600 text-sm"
                  onClick={() => setEditing(s)}
                >
                  Quick edit
                </button>
                <button
                  className="text-red-600 text-sm"
                  onClick={() => removeSession(s.sessionId)}
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
          {available.map((s) => (
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
                onClick={() => addSession(s)}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-between">
        <button onClick={onBack}>Back</button>
        <button onClick={submit}>Next</button>
      </div>

      {editing && (
        <QuickEditModal
          session={editing}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}
