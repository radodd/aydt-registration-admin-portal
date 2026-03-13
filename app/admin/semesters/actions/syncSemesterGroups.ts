"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

type GroupInput = {
  id: string;
  name: string;
  sessionIds: string[];
};

export async function syncSemesterSessionGroups(
  semesterId: string,
  groups: GroupInput[],
  idMap: Map<string, string>,
) {
  await requireAdmin();
  const supabase = await createClient();

  // 1️⃣ Fetch existing group IDs for this semester
  const { data: existingGroups, error: fetchError } = await supabase
    .from("session_groups")
    .select("id")
    .eq("semester_id", semesterId);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingGroupIds = new Set(existingGroups.map((g) => g.id));
  const incomingGroupIds = new Set(groups.map((g) => g.id).filter(Boolean));

  // 2️⃣ Delete groups that were removed
  const groupIdsToDelete = [...existingGroupIds].filter(
    (id) => !incomingGroupIds.has(id),
  );
  if (groupIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("session_groups")
      .delete()
      .in("id", groupIdsToDelete);
    if (deleteError) throw new Error(deleteError.message);
  }

  if (!groups?.length) return;

  // 3️⃣ Upsert owned groups (preserve ID), insert new groups (omit ID)
  const ownedGroups = groups.filter((g) => existingGroupIds.has(g.id));
  const newGroups = groups.filter((g) => !existingGroupIds.has(g.id));

  if (ownedGroups.length > 0) {
    const { error } = await supabase.from("session_groups").upsert(
      ownedGroups.map((g) => ({
        id: g.id,
        semester_id: semesterId,
        name: g.name,
        description: null,
      })),
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  }

  if (newGroups.length > 0) {
    const { data: inserted, error } = await supabase
      .from("session_groups")
      .insert(
        newGroups.map((g) => ({
          semester_id: semesterId,
          name: g.name,
          description: null,
        })),
      )
      .select("id");
    if (error) throw new Error(error.message);
    // Correlate by insertion order so membership rows can use the new DB-assigned IDs
    newGroups.forEach((g, i) => {
      g.id = inserted[i].id;
    });
  }
  // 4️⃣ Re-sync membership — delete all existing, insert fresh
  const allGroupIds = groups.map((g) => g.id).filter(Boolean);
  if (allGroupIds.length > 0) {
    const { error: deleteMembership } = await supabase
      .from("session_group_sessions")
      .delete()
      .in("session_group_id", allGroupIds);
    if (deleteMembership) throw new Error(deleteMembership.message);
  }

  // 5️⃣ Insert fresh membership rows using idMap
  // Sessions not present in idMap were removed from the semester (or are stale
  // references); drop them silently rather than crashing.
  const membershipRows = groups.flatMap((group) =>
    group.sessionIds
      .filter((draftSessionId) => idMap.has(draftSessionId))
      .map((draftSessionId) => ({
        session_group_id: group.id,
        session_id: idMap.get(draftSessionId)!,
      })),
  );

  if (membershipRows.length > 0) {
    const { error: insertMembershipError } = await supabase
      .from("session_group_sessions")
      .insert(membershipRows);
    if (insertMembershipError) throw new Error(insertMembershipError.message);
  }
}
