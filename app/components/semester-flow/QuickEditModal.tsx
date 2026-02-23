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
  console.log("draft", draft);
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-xl p-8 space-y-8">
        {/* Header */}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 tracking-tight">
            Quick Edit Session
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Override session details for this semester.
          </p>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Title</label>
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            value={draft.overriddenTitle ?? draft.title}
            onChange={(e) =>
              setDraft({ ...draft, overriddenTitle: e.target.value })
            }
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Start date
            </label>
            <input
              type="date"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              value={draft.overriddenStartDate ?? draft.startDate}
              onChange={(e) =>
                setDraft({ ...draft, overriddenStartDate: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              End date
            </label>
            <input
              type="date"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              value={draft.overriddenEndDate ?? draft.endDate}
              onChange={(e) =>
                setDraft({ ...draft, overriddenEndDate: e.target.value })
              }
            />
          </div>
        </div>

        {/* Days of Week */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">
            Days of week
          </label>

          <div className="flex flex-wrap gap-2">
            {[
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ].map((d) => {
              const active = (
                draft.overriddenDaysOfWeek ?? draft.daysOfWeek
              ).includes(d);

              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition
                ${
                  active
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
                >
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Session type
          </label>
          <select
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition bg-white"
            value={draft.overriddenType ?? draft.type}
            onChange={(e) =>
              setDraft({ ...draft, overriddenType: e.target.value })
            }
          >
            <option value="class">Class</option>
            <option value="camp">Camp</option>
            <option value="workshop">Workshop</option>
          </select>
        </div>

        {/* Capacity */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Capacity</label>
          <input
            type="number"
            className="w-32 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            value={draft.overriddenCapacity ?? draft.capacity}
            onChange={(e) =>
              setDraft({
                ...draft,
                overriddenCapacity: Number(e.target.value),
              })
            }
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>

          <button
            onClick={() => onSave(draft)}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
