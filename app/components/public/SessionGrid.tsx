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

export function SessionGrid({ sessions, groups }: SessionGridProps) {
  const [filters, setFilters] = useState<FilterState>({
    groupId: "",
    dayOfWeek: "",
    discipline: "",
    spotsOnly: false,
    grade: "",
  });

  // Attach groupId from group membership
  const enrichedWithGroups = sessions.map((s) => {
    const group = groups.find((g) => g.sessionIds.includes(s.id));
    return { ...s, groupId: group?.id ?? null };
  });

  const filtered = applyFilters(enrichedWithGroups, filters);
  const grouped = groupByClass(filtered);

  return (
    <div>
      <FilterBar
        sessions={sessions}
        groups={groups}
        filters={filters}
        onChange={setFilters}
        classCount={grouped.length}
      />

      {grouped.length === 0 ? (
        <div className="sem-empty">
          <p style={{ color: "var(--pub-text-muted)", fontWeight: 500 }}>
            No classes match your filters.
          </p>
          <button
            type="button"
            onClick={() => setFilters({ groupId: "", dayOfWeek: "", discipline: "", spotsOnly: false, grade: "" })}
            style={{
              marginTop: 8, fontSize: 13, color: "var(--plum)", background: "none",
              border: "none", cursor: "pointer", fontFamily: "var(--pub-font-primary)",
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div>
          {grouped.map((group) => (
            <ClassCard key={group.classId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
