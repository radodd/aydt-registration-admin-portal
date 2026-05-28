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
    .from("meeting_groups")
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
      .from("meeting_groups")
      .delete()
      .in("id", groupIdsToDelete);
    if (deleteError) throw new Error(deleteError.message);
  }

  if (!groups?.length) return;

  // 3️⃣ Upsert owned groups (preserve ID), insert new groups (omit ID)
  const ownedGroups = groups.filter((g) => existingGroupIds.has(g.id));
  const newGroups = groups.filter((g) => !existingGroupIds.has(g.id));

  if (ownedGroups.length > 0) {
    const { error } = await supabase.from("meeting_groups").upsert(
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
      .from("meeting_groups")
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
      .from("meeting_group_meetings")
      .delete()
      .in("meeting_group_id", allGroupIds);
    if (deleteMembership) throw new Error(deleteMembership.message);
  }

  // 5️⃣ Insert fresh membership rows.
  // idMap maps (draftSchedule._clientKey | class_schedule.id) → class_schedule.id.
  // For each schedule ID in a group, fetch all class_meetings for that schedule
  // and insert one meeting_group_meetings row per session.
  const membershipRows: { meeting_group_id: string; meeting_id: string }[] = [];

  for (const group of groups) {
    for (const draftScheduleKey of group.sessionIds) {
      const dbScheduleId = idMap.get(draftScheduleKey);
      if (!dbScheduleId) continue;

      const { data: sessions, error: sessionsError } = await supabase
        .from("class_meetings")
        .select("id")
        .eq("section_id", dbScheduleId);
      if (sessionsError) throw new Error(sessionsError.message);

      for (const session of sessions ?? []) {
        membershipRows.push({
          meeting_group_id: group.id,
          meeting_id: session.id,
        });
      }
    }
  }

  if (membershipRows.length > 0) {
    const { error: insertMembershipError } = await supabase
      .from("meeting_group_meetings")
      .insert(membershipRows);
    if (insertMembershipError) throw new Error(insertMembershipError.message);
  }
}
