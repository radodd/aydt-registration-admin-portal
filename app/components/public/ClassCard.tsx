import { SessionAddButton } from "./SessionAddButton";
import { GroupedClass } from "./SessionGrid";

export function ClassCard({ group }: { group: GroupedClass }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>

        {group.description && (
          <p className="text-sm text-gray-600 mt-1">{group.description}</p>
        )}

        <div className="mt-2 text-xs text-gray-500">
          {group.location && <span>{group.location}</span>}
          {group.minAge != null && group.maxAge != null && (
            <span className="ml-3">
              Ages {group.minAge}–{group.maxAge}
            </span>
          )}
        </div>
      </div>

      {/* Calendar Days */}
      <div className="space-y-2">
        {group.sessions.map((session) => {
          const day = session.scheduleDate;

          return (
            <div
              key={session.id}
              className="flex items-center justify-between border rounded-lg px-4 py-2"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{day}</div>
                <div className="text-xs text-gray-500">
                  {session.startTime} – {session.endTime}
                </div>
                <div className="text-xs text-gray-500">
                  {session.instructorName}
                </div>
              </div>

              {/* Per-day enrollment button */}
              <SessionAddButton session={session} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
