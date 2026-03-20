"use client";

import type { PublicSession, PublicSessionGroup } from "@/types/public";

export interface FilterState {
  groupId: string;
  dayOfWeek: string;
  discipline: string;
  spotsOnly: boolean;
}

interface FilterBarProps {
  sessions: PublicSession[];
  groups: PublicSessionGroup[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
  classCount: number;
}

const DAYS: { label: string; value: string }[] = [
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
  { label: "Thu", value: "thursday" },
  { label: "Fri", value: "friday" },
  { label: "Sat", value: "saturday" },
];

export function applyFilters(
  sessions: PublicSession[],
  filters: FilterState,
): PublicSession[] {
  return sessions.filter((s) => {
    if (filters.groupId && s.groupId !== filters.groupId) return false;
    if (filters.discipline) {
      const disc = (s.discipline ?? "").toLowerCase();
      if (disc !== filters.discipline.toLowerCase()) return false;
    }
    if (filters.dayOfWeek && s.scheduleDate) {
      const dayIndex = new Date(s.scheduleDate + "T00:00:00").getDay();
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const sessionDay = dayNames[dayIndex] ?? "";
      if (sessionDay !== filters.dayOfWeek.toLowerCase()) return false;
    }
    if (filters.spotsOnly && s.spotsRemaining === 0) return false;
    return true;
  });
}

export function FilterBar({ sessions, groups, filters, onChange, classCount }: FilterBarProps) {
  // Derive unique disciplines from sessions
  const disciplines = Array.from(
    new Set(sessions.map((s) => s.discipline).filter(Boolean) as string[])
  ).sort();

  function setDay(value: string) {
    onChange({ ...filters, dayOfWeek: filters.dayOfWeek === value ? "" : value });
  }

  function setDisc(value: string) {
    onChange({ ...filters, discipline: filters.discipline === value ? "" : value });
  }

  function setGroup(value: string) {
    onChange({ ...filters, groupId: filters.groupId === value ? "" : value });
  }

  return (
    <div className="sem-filter-bar">
      {/* Day filter */}
      <div className="sem-filter-group">
        <div className="sem-filter-label">Day</div>
        <div className="sem-filter-pills">
          <button
            type="button"
            className={`sem-fpill${!filters.dayOfWeek ? " active" : ""}`}
            onClick={() => onChange({ ...filters, dayOfWeek: "" })}
          >
            Any Day
          </button>
          {DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`sem-fpill${filters.dayOfWeek === d.value ? " active" : ""}`}
              onClick={() => setDay(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {disciplines.length > 0 && (
        <>
          <div className="sem-filter-sep" />
          <div className="sem-filter-group">
            <div className="sem-filter-label">Discipline</div>
            <div className="sem-filter-pills">
              <button
                type="button"
                className={`sem-fpill${!filters.discipline ? " active" : ""}`}
                onClick={() => onChange({ ...filters, discipline: "" })}
              >
                All
              </button>
              {disciplines.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`sem-fpill${filters.discipline === d ? " active" : ""}`}
                  onClick={() => setDisc(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {groups.length > 0 && (
        <>
          <div className="sem-filter-sep" />
          <div className="sem-filter-group">
            <div className="sem-filter-label">Group</div>
            <div className="sem-filter-pills">
              <button
                type="button"
                className={`sem-fpill${!filters.groupId ? " active" : ""}`}
                onClick={() => onChange({ ...filters, groupId: "" })}
              >
                All Groups
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`sem-fpill${filters.groupId === g.id ? " active" : ""}`}
                  onClick={() => setGroup(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="sem-filter-sep" />

      <label className="sem-spots-check">
        <input
          type="checkbox"
          checked={filters.spotsOnly}
          onChange={(e) => onChange({ ...filters, spotsOnly: e.target.checked })}
        />
        Available spots only
      </label>

      <div className="sem-filter-count">
        Showing {classCount} class{classCount !== 1 ? "es" : ""}
      </div>
    </div>
  );
}
