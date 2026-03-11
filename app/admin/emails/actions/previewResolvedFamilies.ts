"use server";

import { createClient } from "@/utils/supabase/server";
import {
  EmailSelectionCriteria,
  FamilyRecipient,
  ManualUserEntry,
  DancerClassContext,
} from "@/types";

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const min = m ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min} ${ampm}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type FamilyAccumulator = {
  familyId: string;
  primaryEmail: string;
  primaryParentFirstName: string;
  primaryParentLastName: string;
  dancersByDancerId: Map<string, { dancerName: string; classes: { className: string; sessionLabel: string }[] }>;
  isInstructor: boolean;
};

async function accumulateFromRegistrations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filter:
    | { type: "semester"; semesterId: string }
    | { type: "class"; classId: string }
    | { type: "session"; sessionId: string }
    | { type: "instructor"; instructorName: string },
  familyMap: Map<string, FamilyAccumulator>,
  excludedFamilyIds: Set<string>,
) {
  let query = supabase
    .from("registrations")
    .select(`
      dancer_id,
      session_id,
      dancers!inner(
        id,
        first_name,
        last_name,
        family_id,
        families!inner(
          id,
          users!inner(id, email, first_name, last_name, is_primary_parent)
        )
      ),
      class_sessions!inner(
        id,
        day_of_week,
        start_time,
        classes!inner(id, name)
      )
    `)
    .neq("status", "cancelled")
    .eq("dancers.families.users.is_primary_parent", true);

  if (filter.type === "semester") {
    query = query.eq("class_sessions.semester_id", filter.semesterId);
  } else if (filter.type === "class") {
    query = query.eq("class_sessions.class_id", filter.classId);
  } else if (filter.type === "instructor") {
    query = query.ilike("class_sessions.instructor_name", `%${filter.instructorName}%`);
  } else {
    query = query.eq("session_id", filter.sessionId);
  }

  const { data: registrations } = await query;

  for (const reg of registrations ?? []) {
    const dancer = Array.isArray(reg.dancers) ? reg.dancers[0] : reg.dancers;
    if (!dancer) continue;
    const family = Array.isArray(dancer.families) ? dancer.families[0] : dancer.families;
    if (!family) continue;
    const primaryUser = Array.isArray(family.users) ? family.users[0] : family.users;
    if (!primaryUser) continue;
    if (excludedFamilyIds.has(family.id)) continue;

    const classSession = Array.isArray(reg.class_sessions) ? reg.class_sessions[0] : reg.class_sessions;
    const cls = classSession
      ? Array.isArray(classSession.classes) ? classSession.classes[0] : classSession.classes
      : null;

    const classContext = cls && classSession
      ? {
          className: cls.name as string,
          sessionLabel: `${capitalize(classSession.day_of_week as string)}${classSession.start_time ? ` ${formatTime(classSession.start_time as string)}` : ""}`,
        }
      : null;

    if (!familyMap.has(family.id)) {
      familyMap.set(family.id, {
        familyId: family.id,
        primaryEmail: primaryUser.email,
        primaryParentFirstName: primaryUser.first_name,
        primaryParentLastName: primaryUser.last_name,
        dancersByDancerId: new Map(),
        isInstructor: false,
      });
    }

    const acc = familyMap.get(family.id)!;
    if (!acc.dancersByDancerId.has(dancer.id)) {
      acc.dancersByDancerId.set(dancer.id, {
        dancerName: `${dancer.first_name} ${dancer.last_name}`.trim(),
        classes: [],
      });
    }
    if (classContext) {
      acc.dancersByDancerId.get(dancer.id)!.classes.push(classContext);
    }
  }
}

async function addInstructors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  selFilter: { type: "class"; classId: string } | { type: "session"; sessionId: string },
  familyMap: Map<string, FamilyAccumulator>,
  excludedFamilyIds: Set<string>,
) {
  let query = supabase.from("class_sessions").select("instructor_name");
  if (selFilter.type === "class") {
    query = query.eq("class_id", selFilter.classId);
  } else {
    query = query.eq("id", selFilter.sessionId);
  }

  const { data: sessions } = await query;
  if (!sessions) return;

  const uniqueNames = new Set(
    (sessions as { instructor_name: string | null }[])
      .map((s) => s.instructor_name)
      .filter(Boolean) as string[],
  );

  for (const name of uniqueNames) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ");
    if (!first) continue;

    const { data: matchedUser } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, family_id")
      .ilike("first_name", `${first}%`)
      .ilike("last_name", `${last}%`)
      .eq("is_primary_parent", true)
      .maybeSingle();

    if (!matchedUser) continue;
    const u = matchedUser as { id: string; email: string; first_name: string; last_name: string; family_id: string };
    if (excludedFamilyIds.has(u.family_id) || familyMap.has(u.family_id)) continue;

    familyMap.set(u.family_id, {
      familyId: u.family_id,
      primaryEmail: u.email,
      primaryParentFirstName: u.first_name,
      primaryParentLastName: u.last_name,
      dancersByDancerId: new Map(),
      isInstructor: true,
    });
  }
}

/**
 * Resolves a live preview of family recipients from the in-memory draft state.
 * Used by the RecipientReviewPanel in RecipientsStep before the draft is saved.
 */
export async function previewResolvedFamilies(
  selections: EmailSelectionCriteria[],
  manualAdditions: ManualUserEntry[],
  excludedFamilyIds: string[],
): Promise<FamilyRecipient[]> {
  const supabase = await createClient();
  const excludedSet = new Set(excludedFamilyIds);
  const familyMap = new Map<string, FamilyAccumulator>();

  for (const sel of selections) {
    if (sel.type === "semester" && sel.semesterId) {
      await accumulateFromRegistrations(
        supabase,
        { type: "semester", semesterId: sel.semesterId },
        familyMap,
        excludedSet,
      );
    } else if (sel.type === "class" && sel.classId) {
      await accumulateFromRegistrations(
        supabase,
        { type: "class", classId: sel.classId },
        familyMap,
        excludedSet,
      );
      if (sel.includeInstructors) {
        await addInstructors(supabase, { type: "class", classId: sel.classId }, familyMap, excludedSet);
      }
    } else if (sel.type === "session" && sel.sessionId) {
      await accumulateFromRegistrations(
        supabase,
        { type: "session", sessionId: sel.sessionId },
        familyMap,
        excludedSet,
      );
      if (sel.includeInstructors) {
        await addInstructors(supabase, { type: "session", sessionId: sel.sessionId }, familyMap, excludedSet);
      }
    } else if (sel.type === "instructor" && sel.instructorName) {
      await accumulateFromRegistrations(
        supabase,
        { type: "instructor", instructorName: sel.instructorName },
        familyMap,
        excludedSet,
      );
    } else if (sel.type === "subscribed_list") {
      // For preview: include all primary parents with active subscriptions
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, family_id")
        .eq("is_primary_parent", true);

      for (const user of (allUsers ?? []) as { id: string; email: string; first_name: string; last_name: string; family_id: string }[]) {
        if (excludedSet.has(user.family_id) || familyMap.has(user.family_id)) continue;
        familyMap.set(user.family_id, {
          familyId: user.family_id,
          primaryEmail: user.email,
          primaryParentFirstName: user.first_name,
          primaryParentLastName: user.last_name,
          dancersByDancerId: new Map(),
          isInstructor: false,
        });
      }
    }
  }

  // Add manual portal-user additions
  for (const entry of manualAdditions) {
    if (!entry.userId) continue;
    const { data: user } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, family_id")
      .eq("id", entry.userId)
      .single();
    if (!user) continue;
    const u = user as { id: string; email: string; first_name: string; last_name: string; family_id: string };
    if (excludedSet.has(u.family_id) || familyMap.has(u.family_id)) continue;
    familyMap.set(u.family_id, {
      familyId: u.family_id,
      primaryEmail: u.email,
      primaryParentFirstName: u.first_name,
      primaryParentLastName: u.last_name,
      dancersByDancerId: new Map(),
      isInstructor: false,
    });
  }

  const allUserEmails = Array.from(familyMap.values()).map((f) => f.primaryEmail.toLowerCase());

  // Apply unsubscribe filter: fetch primary parent user IDs then check subscriptions
  const { data: primaryUsers } = await supabase
    .from("users")
    .select("id, email")
    .eq("is_primary_parent", true)
    .in("email", allUserEmails);

  const primaryUserIdByEmail = new Map(
    (primaryUsers ?? []).map((u: { id: string; email: string }) => [u.email.toLowerCase(), u.id]),
  );

  const userIdsToCheck = Array.from(familyMap.values())
    .map((f) => primaryUserIdByEmail.get(f.primaryEmail.toLowerCase()))
    .filter(Boolean) as string[];

  const { data: unsubscribed } = userIdsToCheck.length
    ? await supabase
        .from("email_subscriptions")
        .select("user_id")
        .eq("is_subscribed", false)
        .in("user_id", userIdsToCheck)
    : { data: [] };

  const unsubEmails = new Set(
    (unsubscribed ?? []).map((u: { user_id: string }) => {
      const email = Array.from(primaryUserIdByEmail.entries()).find(([, id]) => id === u.user_id)?.[0];
      return email ?? "";
    }),
  );

  return Array.from(familyMap.values())
    .filter((f) => !unsubEmails.has(f.primaryEmail.toLowerCase()))
    .map((f) => ({
      familyId: f.familyId,
      primaryEmail: f.primaryEmail,
      primaryParentFirstName: f.primaryParentFirstName,
      primaryParentLastName: f.primaryParentLastName,
      dancers: Array.from(f.dancersByDancerId.values()) as DancerClassContext[],
      isInstructor: f.isInstructor,
    }));
}
