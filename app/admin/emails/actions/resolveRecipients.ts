"use server";

import { createClient } from "@/utils/supabase/server";
import { DancerClassContext, FamilyRecipient } from "@/types";

export type ResolvedRecipient = {
  familyId: string | null;
  userId: string | null;
  subscriberId?: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  dancerContext: DancerClassContext[];
};

interface ResolveRecipientsOptions {
  /** When true, skip the email_subscriptions filter — sends to unsubscribed users too. */
  overrideUnsubscribe?: boolean;
}

type FamilyAccumulator = {
  familyId: string;
  userId: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  dancersByDancerId: Map<
    string,
    {
      dancerName: string;
      classes: { className: string; sessionLabel: string }[];
    }
  >;
  isInstructor: boolean;
};

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
    .select(
      `
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
    `,
    )
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
    const family = Array.isArray(dancer.families)
      ? dancer.families[0]
      : dancer.families;
    if (!family) continue;
    const primaryUser = Array.isArray(family.users)
      ? family.users[0]
      : family.users;
    if (!primaryUser) continue;
    if (excludedFamilyIds.has(family.id)) continue;

    const classSession = Array.isArray(reg.class_sessions)
      ? reg.class_sessions[0]
      : reg.class_sessions;
    const cls = classSession
      ? Array.isArray(classSession.classes)
        ? classSession.classes[0]
        : classSession.classes
      : null;

    const classContext =
      cls && classSession
        ? {
            className: cls.name as string,
            sessionLabel: `${capitalize(classSession.day_of_week as string)}${classSession.start_time ? ` ${formatTime(classSession.start_time as string)}` : ""}`,
          }
        : null;

    if (!familyMap.has(family.id)) {
      familyMap.set(family.id, {
        familyId: family.id,
        userId: primaryUser.id,
        emailAddress: primaryUser.email,
        firstName: primaryUser.first_name,
        lastName: primaryUser.last_name,
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

async function includeInstructors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  selectionFilter:
    | { type: "class"; classId: string }
    | { type: "session"; sessionId: string },
  familyMap: Map<string, FamilyAccumulator>,
  excludedFamilyIds: Set<string>,
) {
  let query = supabase.from("class_sessions").select("instructor_name");

  if (selectionFilter.type === "class") {
    query = query.eq("class_id", selectionFilter.classId);
  } else {
    query = query.eq("id", selectionFilter.sessionId);
  }

  const { data: sessions } = await query;
  if (!sessions) return;

  const uniqueInstructorNames = new Set(
    (sessions as { instructor_name: string | null }[])
      .map((s) => s.instructor_name)
      .filter(Boolean) as string[],
  );

  for (const name of uniqueInstructorNames) {
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

    if (!matchedUser || excludedFamilyIds.has(matchedUser.family_id)) continue;
    if (familyMap.has(matchedUser.family_id)) continue;

    familyMap.set(matchedUser.family_id, {
      familyId: matchedUser.family_id,
      userId: matchedUser.id,
      emailAddress: matchedUser.email,
      firstName: matchedUser.first_name,
      lastName: matchedUser.last_name,
      dancersByDancerId: new Map(),
      isInstructor: true,
    });
  }
}

export async function resolveRecipients(
  emailId: string,
  options: ResolveRecipientsOptions = {},
): Promise<ResolvedRecipient[]> {
  const supabase = await createClient();

  const { data: selections, error: selErr } = await supabase
    .from("email_recipient_selections")
    .select("*")
    .eq("email_id", emailId)
    .eq("is_excluded", false);

  if (selErr) throw new Error(selErr.message);

  const { data: excluded } = await supabase
    .from("email_recipient_selections")
    .select("family_id, user_id")
    .eq("email_id", emailId)
    .eq("is_excluded", true);

  const excludedFamilyIds = new Set<string>(
    (excluded ?? []).map((e) => e.family_id).filter(Boolean) as string[],
  );
  // Also support legacy user_id-based exclusions
  const excludedUserIds = new Set<string>(
    (excluded ?? []).map((e) => e.user_id).filter(Boolean) as string[],
  );

  // familyMap keyed by familyId — for portal families
  const familyMap = new Map<string, FamilyAccumulator>();
  // subscriberMap keyed by subscriberId — for external one-off subscribers
  const subscriberMap = new Map<string, ResolvedRecipient>();

  for (const sel of selections ?? []) {
    if (sel.selection_type === "semester" && sel.semester_id) {
      await accumulateFromRegistrations(
        supabase,
        { type: "semester", semesterId: sel.semester_id },
        familyMap,
        excludedFamilyIds,
      );
    } else if (sel.selection_type === "class" && sel.class_id) {
      await accumulateFromRegistrations(
        supabase,
        { type: "class", classId: sel.class_id },
        familyMap,
        excludedFamilyIds,
      );
      if (sel.include_instructors) {
        await includeInstructors(
          supabase,
          { type: "class", classId: sel.class_id },
          familyMap,
          excludedFamilyIds,
        );
      }
    } else if (sel.selection_type === "session" && sel.session_id) {
      await accumulateFromRegistrations(
        supabase,
        { type: "session", sessionId: sel.session_id },
        familyMap,
        excludedFamilyIds,
      );
      if (sel.include_instructors) {
        await includeInstructors(
          supabase,
          { type: "session", sessionId: sel.session_id },
          familyMap,
          excludedFamilyIds,
        );
      }
    } else if (sel.selection_type === "instructor" && sel.instructor_name) {
      await accumulateFromRegistrations(
        supabase,
        { type: "instructor", instructorName: sel.instructor_name },
        familyMap,
        excludedFamilyIds,
      );
    } else if (sel.selection_type === "manual" && sel.subscriber_id) {
      if (subscriberMap.has(sel.subscriber_id)) continue;

      const { data: sub } = await supabase
        .from("email_subscribers")
        .select("id, email, name")
        .eq("id", sel.subscriber_id)
        .single();

      if (sub) {
        const nameParts = ((sub as { name: string | null }).name ?? "")
          .trim()
          .split(/\s+/);
        subscriberMap.set((sub as { id: string }).id, {
          familyId: null,
          userId: null,
          subscriberId: (sub as { id: string }).id,
          emailAddress: (sub as { email: string }).email,
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" "),
          dancerContext: [],
        });
      }
    } else if (sel.selection_type === "manual" && sel.user_id) {
      if (excludedUserIds.has(sel.user_id)) continue;

      const { data: user } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, family_id")
        .eq("id", sel.user_id)
        .single();

      if (
        user &&
        !excludedFamilyIds.has((user as { family_id: string }).family_id)
      ) {
        const u = user as {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          family_id: string;
        };
        if (!familyMap.has(u.family_id)) {
          familyMap.set(u.family_id, {
            familyId: u.family_id,
            userId: u.id,
            emailAddress: u.email,
            firstName: u.first_name,
            lastName: u.last_name,
            dancersByDancerId: new Map(),
            isInstructor: false,
          });
        }
      }
    } else if (sel.selection_type === "subscribed_list") {
      // All primary parents grouped by family
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, family_id")
        .eq("is_primary_parent", true);

      for (const user of (allUsers ?? []) as {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        family_id: string;
      }[]) {
        if (
          excludedFamilyIds.has(user.family_id) ||
          excludedUserIds.has(user.id) ||
          familyMap.has(user.family_id)
        )
          continue;
        familyMap.set(user.family_id, {
          familyId: user.family_id,
          userId: user.id,
          emailAddress: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          dancersByDancerId: new Map(),
          isInstructor: false,
        });
      }

      // All active external subscribers
      const { data: externalSubs } = await supabase
        .from("email_subscribers")
        .select("id, email, name")
        .eq("is_subscribed", true);

      for (const sub of (externalSubs ?? []) as {
        id: string;
        email: string;
        name: string | null;
      }[]) {
        if (subscriberMap.has(sub.id)) continue;
        const nameParts = (sub.name ?? "").trim().split(/\s+/);
        subscriberMap.set(sub.id, {
          familyId: null,
          userId: null,
          subscriberId: sub.id,
          emailAddress: sub.email,
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" "),
          dancerContext: [],
        });
      }
    }
  }

  const allUserIds = Array.from(familyMap.values()).map((f) => f.userId);

  // Apply unsubscribe filter
  let filteredFamilies: FamilyAccumulator[];
  if (allUserIds.length === 0) {
    filteredFamilies = [];
  } else if (options.overrideUnsubscribe) {
    filteredFamilies = Array.from(familyMap.values());
  } else {
    const { data: unsubscribed } = await supabase
      .from("email_subscriptions")
      .select("user_id")
      .eq("is_subscribed", false)
      .in("user_id", allUserIds);

    const unsubIds = new Set(
      (unsubscribed ?? []).map((u: { user_id: string }) => u.user_id),
    );
    filteredFamilies = Array.from(familyMap.values()).filter(
      (f) => !unsubIds.has(f.userId),
    );
  }

  // Build ResolvedRecipient[] from families
  const portalRecipients: ResolvedRecipient[] = filteredFamilies.map((f) => ({
    familyId: f.familyId,
    userId: f.userId,
    emailAddress: f.emailAddress,
    firstName: f.firstName,
    lastName: f.lastName,
    dancerContext: Array.from(f.dancersByDancerId.values()).map((d) => ({
      dancerName: d.dancerName,
      classes: d.classes,
    })) as DancerClassContext[],
  }));

  // Deduplicate: if an external subscriber email already appears as a portal family, prefer portal
  const seenEmails = new Set(
    portalRecipients.map((r) => r.emailAddress.toLowerCase()),
  );
  const filteredSubscribers = Array.from(subscriberMap.values()).filter(
    (r) => !seenEmails.has(r.emailAddress.toLowerCase()),
  );

  return [...portalRecipients, ...filteredSubscribers];
}

/** Convert resolved recipients to FamilyRecipient shape for UI preview */
export async function toFamilyRecipients(
  recipients: ResolvedRecipient[],
): Promise<FamilyRecipient[]> {
  return recipients
    .filter((r) => r.familyId !== null)
    .map((r) => ({
      familyId: r.familyId!,
      primaryEmail: r.emailAddress,
      primaryParentFirstName: r.firstName,
      primaryParentLastName: r.lastName,
      dancers: r.dancerContext,
    }));
}
