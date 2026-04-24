"use client";

import { useState } from "react";
import type { PublicSession, PublicSessionGroup } from "@/types/public";

export interface FilterState {
  groupId: string;
  dayOfWeek: string;
  discipline: string;
  spotsOnly: boolean;
  /** Selected grade label, e.g. "K", "1", "2" … "12". Empty string = no filter. */
  grade: string;
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

/** Convert a grade label ("K", "1"…"12") to a numeric value for range comparisons. */
function gradeToNum(label: string): number {
  return label === "K" ? 0 : parseInt(label, 10);
}

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
    if (filters.grade) {
      const g = gradeToNum(filters.grade);
      const hasMin = s.minGrade != null;
      const hasMax = s.maxGrade != null;
      if (hasMin || hasMax) {
        if (hasMin && g < s.minGrade!) return false;
        if (hasMax && g > s.maxGrade!) return false;
      }
    }
    return true;
  });
}

const GRADE_LABELS = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`sem-fg-chevron${open ? " open" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function FilterSection({ label, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sem-filter-group">
      <button
        type="button"
        className="sem-filter-group-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="sem-filter-label">{label}</span>
        <ChevronIcon open={open} />
      </button>
      <div className={`sem-filter-section-pills${open ? "" : " collapsed"}`}>
        <div className="sem-filter-pills">
          {children}
        </div>
      </div>
    </div>
  );
}

export function FilterBar({ sessions, groups, filters, onChange, classCount }: FilterBarProps) {
  // Derive unique disciplines from sessions
  const disciplines = Array.from(
    new Set(sessions.map((s) => s.discipline).filter(Boolean) as string[])
  ).sort();

  // Only show grade filter if any sessions have grade constraints
  const gradesInUse = sessions.some((s) => s.minGrade != null || s.maxGrade != null);

  function setDay(value: string) {
    onChange({ ...filters, dayOfWeek: filters.dayOfWeek === value ? "" : value });
  }

  function setDisc(value: string) {
    onChange({ ...filters, discipline: filters.discipline === value ? "" : value });
  }

  function setGroup(value: string) {
    onChange({ ...filters, groupId: filters.groupId === value ? "" : value });
  }

  function setGrade(value: string) {
    onChange({ ...filters, grade: filters.grade === value ? "" : value });
  }

  return (
    <div className="sem-filter-bar">
      {/* Day filter */}
      <FilterSection label="Day">
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
      </FilterSection>

      {disciplines.length > 0 && (
        <>
          <FilterSection label="Discipline">
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
          </FilterSection>
        </>
      )}

      {gradesInUse && (
        <>
          <FilterSection label="Grade">
            <button
              type="button"
              className={`sem-fpill${!filters.grade ? " active" : ""}`}
              onClick={() => onChange({ ...filters, grade: "" })}
            >
              Any Grade
            </button>
            {GRADE_LABELS.map((g) => (
              <button
                key={g}
                type="button"
                className={`sem-fpill${filters.grade === g ? " active" : ""}`}
                onClick={() => setGrade(g)}
              >
                {g}
              </button>
            ))}
          </FilterSection>
        </>
      )}

      {groups.length > 0 && (
        <>
          <FilterSection label="Group">
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
          </FilterSection>
        </>
      )}

      <label className="sem-spots-check">
        <input
          type="checkbox"
          checked={filters.spotsOnly}
          onChange={(e) => onChange({ ...filters, spotsOnly: e.target.checked })}
        />
        Available spots only
      </label>

      <div className="sem-filter-count">
        {classCount} class{classCount !== 1 ? "es" : ""}
      </div>
    </div>
  );
}
