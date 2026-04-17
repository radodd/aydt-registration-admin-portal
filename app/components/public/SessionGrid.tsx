"use client";

import { useState } from "react";
import { FilterBar, FilterState, applyFilters } from "./FilterBar";
import type { PublicSession, PublicSessionGroup } from "@/types/public";
import { ClassCard } from "./ClassCard";

export type GroupedClass = {
  classId: string;
  name: string;
  description?: string | null;
  discipline?: string | null;
  division?: string | null;
  location?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  minGrade?: number | null;
  maxGrade?: number | null;
  sessions: PublicSession[];
};

function groupByClass(sessions: PublicSession[]): GroupedClass[] {
  const map = new Map<string, GroupedClass>();

  for (const session of sessions) {
    if (!session.classId) continue;

    if (!map.has(session.classId)) {
      map.set(session.classId, {
        classId: session.classId,
        name: session.name,
        description: session.description,
        discipline: session.discipline,
        division: session.division,
        location: session.location,
        minAge: session.minAge,
        maxAge: session.maxAge,
        minGrade: session.minGrade,
        maxGrade: session.maxGrade,
        sessions: [],
      });
    }

    map.get(session.classId)!.sessions.push(session);
  }

  for (const group of map.values()) {
    group.sessions.sort((a, b) =>
      (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""),
    );
  }

  return [...map.values()];
}

interface SessionGridProps {
  sessions: PublicSession[];
  groups: PublicSessionGroup[];
}

function buildGroupMap(
  sessions: PublicSession[],
  groups: PublicSessionGroup[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const sid of group.sessionIds) {
      map.set(sid, group.name);
    }
  }
  return map;
}

/** Count how many filters are actively applied (non-default). */
function activeFilterCount(filters: FilterState): number {
  let n = 0;
  if (filters.groupId) n++;
  if (filters.dayOfWeek) n++;
  if (filters.discipline) n++;
  if (filters.grade) n++;
  if (filters.spotsOnly) n++;
  return n;
}

export function SessionGrid({ sessions, groups }: SessionGridProps) {
  const [filters, setFilters] = useState<FilterState>({
    groupId: "",
    dayOfWeek: "",
    discipline: "",
    spotsOnly: false,
    grade: "",
  });
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Attach groupId from group membership
  const enrichedWithGroups = sessions.map((s) => {
    const group = groups.find((g) => g.sessionIds.includes(s.id));
    return { ...s, groupId: group?.id ?? null };
  });

  const filtered = applyFilters(enrichedWithGroups, filters);
  const grouped = groupByClass(filtered);
  const activeCount = activeFilterCount(filters);

  function clearFilters() {
    setFilters({ groupId: "", dayOfWeek: "", discipline: "", spotsOnly: false, grade: "" });
  }

  return (
    <div>
      {/* ── Filter toggle header ─────────────────────────── */}
      <div className="sem-filter-toggle-bar">
        <button
          type="button"
          className="sem-filter-toggle-btn"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round"/>
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="sem-filter-active-badge">{activeCount}</span>
          )}
          <svg
            width="11" height="11" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`sem-filter-chevron${filtersOpen ? " open" : ""}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Active filter summary + clear — shown when collapsed */}
        {!filtersOpen && activeCount > 0 && (
          <button
            type="button"
            className="sem-filter-clear-inline"
            onClick={clearFilters}
          >
            Clear {activeCount} filter{activeCount !== 1 ? "s" : ""}
          </button>
        )}

        <span className="sem-filter-count-inline">
          {grouped.length} class{grouped.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* ── Collapsible filter panel (animated) ─────────── */}
      <div className={`sem-filter-panel-wrap${filtersOpen ? "" : " collapsed"}`}>
        {/* sem-filter-panel-inner is the padding-free grid item.
            The FilterBar's own padding lives inside it and gets
            clipped cleanly when the track collapses to 0fr. */}
        <div className="sem-filter-panel-inner">
          <FilterBar
            sessions={sessions}
            groups={groups}
            filters={filters}
            onChange={setFilters}
            classCount={grouped.length}
          />
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="sem-empty" style={{ margin: "16px 40px" }}>
          <p style={{ color: "var(--pub-text-muted)", fontWeight: 500 }}>
            No classes match your filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            style={{
              marginTop: 8, fontSize: 13, color: "var(--plum)", background: "none",
              border: "none", cursor: "pointer", fontFamily: "var(--pub-font-primary)",
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{ paddingTop: 12 }}>
          {grouped.map((group) => (
            <ClassCard key={group.classId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
