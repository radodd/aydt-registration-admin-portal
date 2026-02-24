"use client";

import { useState } from "react";
import { SessionCard } from "./SessionCard";
import { FilterBar, FilterState, applyFilters } from "./FilterBar";
import type { PublicSession, PublicSessionGroup } from "@/types/public";

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
    groupId: s.groupId ?? [...groupMap.entries()].find(([sid]) => sid === s.id)?.[0] ?? null,
  }));

  // Re-attach proper groupId from group membership
  const enrichedWithGroups = sessions.map((s) => {
    const group = groups.find((g) => g.sessionIds.includes(s.id));
    return { ...s, groupId: group?.id ?? null };
  });

  const filtered = applyFilters(enrichedWithGroups, filters);

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
          {filtered.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              groupName={
                groups.find((g) => g.sessionIds.includes(session.id))?.name
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
