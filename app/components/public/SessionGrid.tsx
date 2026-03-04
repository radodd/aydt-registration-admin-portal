"use client";

import { useState } from "react";
import { SessionCard } from "./SessionCard";
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
  sessions: PublicSession[]; // individual calendar-day sessions
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
        sessions: [],
      });
    }

    map.get(session.classId)!.sessions.push(session);
  }

  // Optional: sort sessions chronologically inside each class
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

/** Map sessionId → group name for passing to SessionCard */
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
    spotsOnly: false,
  });

  const groupMap = buildGroupMap(sessions, groups);

  // Attach groupId to sessions for filtering
  const enriched = sessions.map((s) => ({
    ...s,
    groupId:
      s.groupId ??
      [...groupMap.entries()].find(([sid]) => sid === s.id)?.[0] ??
      null,
  }));

  // Re-attach proper groupId from group membership
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
      />

      {filtered.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-gray-500 font-medium">
            No sessions match your filters.
          </p>
          <button
            type="button"
            onClick={() =>
              setFilters({ groupId: "", dayOfWeek: "", spotsOnly: false })
            }
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* {filtered.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              groupName={
                groups.find((g) => g.sessionIds.includes(session.id))?.name
              }
            />
          ))} */}

          {grouped.map((group) => (
            <ClassCard key={group.classId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
