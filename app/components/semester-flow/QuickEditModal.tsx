import { SemesterSession } from "@/types";
import { useState } from "react";

export default function QuickEditSession({
  session,
  onSave,
  onCancel,
}: {
  session: SemesterSession;
  onSave: (s: SemesterSession) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SemesterSession>(session);

  function toggleDay(day: string) {
    const days = draft.overriddenDaysOfWeek ?? draft.daysOfWeek;

    setDraft({
      ...draft,
      overriddenDaysOfWeek: days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day],
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded w-full max-w-lg space-y-4">
        <h3 className="font-semibold text-lg">Quick Edit Session</h3>

        {/* Title */}
        <label className="block">
          <span className="text-sm">Title</span>
          <input
            className="border p-2 w-full"
            value={draft.overriddenTitle ?? draft.title}
            onChange={(e) =>
              setDraft({ ...draft, overriddenTitle: e.target.value })
            }
          />
        </label>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="text-sm">Start date</span>
            <input
              type="date"
              className="border p-2 w-full"
              value={draft.overriddenStartDate ?? draft.startDate}
              onChange={(e) =>
                setDraft({ ...draft, overriddenStartDate: e.target.value })
              }
            />
          </label>

          <label>
            <span className="text-sm">End date</span>
            <input
              type="date"
              className="border p-2 w-full"
              value={draft.overriddenEndDate ?? draft.endDate}
              onChange={(e) =>
                setDraft({ ...draft, overriddenEndDate: e.target.value })
              }
            />
          </label>
        </div>

        {/* Days of Week */}
        <div>
          <span className="text-sm">Days of week</span>
          <div className="flex gap-2 flex-wrap mt-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
              const active = (
                draft.overriddenDaysOfWeek ?? draft.daysOfWeek
              ).includes(d);

              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`px-2 py-1 border rounded ${
                    active ? "bg-blue-600 text-white" : ""
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {/* Type */}
        <label>
          <span className="text-sm">Session type</span>
          <select
            className="border p-2 w-full"
            value={draft.overriddenType ?? draft.type}
            onChange={(e) =>
              setDraft({ ...draft, overriddenType: e.target.value })
            }
          >
            <option value="class">Class</option>
            <option value="camp">Camp</option>
            <option value="workshop">Workshop</option>
          </select>
        </label>

        {/* Capacity */}
        <label>
          <span className="text-sm">Capacity</span>
          <input
            type="number"
            className="border p-2 w-full"
            value={draft.overriddenCapacity ?? draft.capacity}
            onChange={(e) =>
              setDraft({
                ...draft,
                overriddenCapacity: Number(e.target.value),
              })
            }
          />
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="border px-4 py-2">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="bg-blue-600 text-white px-4 py-2"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
