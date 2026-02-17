"use server";

import { createClient } from "@/utils/supabase/server";

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
  const supabase = await createClient();

  // 1️⃣ Delete existing groups (cascades membership + tags)
  const { error: deleteError } = await supabase
    .from("session_groups")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!groups?.length) return;

  // 2️⃣ Insert SESSION_GROUPS
  const { error: insertGroupError } = await supabase
    .from("session_groups")
    .insert(
      groups.map((group) => ({
        id: group.id,
        semester_id: semesterId,
        name: group.name,
        description: null,
      })),
    );

  if (insertGroupError) {
    throw new Error(insertGroupError.message);
  }
  // 3️⃣ Insert membership bridge rows using ID map
  const membershipRows = groups.flatMap((group) =>
    group.sessionIds.map((draftSessionId) => {
      const materializedSessionId = idMap.get(draftSessionId);

      if (!materializedSessionId) {
        throw new Error(`Missing ID mapping for session ${draftSessionId}`);
      }

      return {
        session_group_id: group.id,
        session_id: materializedSessionId,
      };
    }),
  );

  if (membershipRows.length > 0) {
    const { error: insertMembershipError } = await supabase
      .from("session_group_sessions")
      .insert(membershipRows);

    if (insertMembershipError) {
      throw new Error(insertMembershipError.message);
    }
  }
}
