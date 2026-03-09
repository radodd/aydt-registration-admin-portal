"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ClassInviteRow, CreateInviteInput } from "@/types";

/* -------------------------------------------------------------------------- */
/* Create invite                                                               */
/* -------------------------------------------------------------------------- */

export type CreateInviteResult =
  | { success: true; invite: { id: string; invite_token: string } }
  | { success: false; error: string };

export async function createClassInvite(
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const supabase = await createAdminClient();

  const { classId, accessType, email, dancerId, expiresAt, maxUses, notes } =
    input;

  const { data, error } = await supabase
    .from("class_invites")
    .insert({
      class_id: classId,
      access_type: accessType,
      email: email ?? null,
      dancer_id: dancerId ?? null,
      expires_at: expiresAt ?? null,
      max_uses: maxUses ?? (accessType === "token_link" ? null : 1),
      notes: notes ?? null,
    })
    .select("id, invite_token")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create invite." };
  }

  return { success: true, invite: data };
}

/* -------------------------------------------------------------------------- */
/* Revoke invite                                                               */
/* -------------------------------------------------------------------------- */

export async function revokeClassInvite(
  inviteId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from("class_invites")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", inviteId);

  if (error) return { success: false, error: error.message };

  await supabase.from("invite_events").insert({
    invite_id: inviteId,
    event_type: "revoked",
  });

  return { success: true };
}

/* -------------------------------------------------------------------------- */
/* List invites for a class                                                    */
/* -------------------------------------------------------------------------- */

export async function listClassInvites(
  classId: string,
): Promise<ClassInviteRow[]> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("class_invites")
    .select(
      `
      id, class_id, access_type, email, dancer_id, invite_token,
      expires_at, max_uses, use_count, status, sent_at, opened_at,
      created_by, notes, created_at, updated_at,
      dancer:dancers ( first_name, last_name ),
      invite_events ( event_type )
    `,
    )
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const now = new Date();

  return data.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: { event_type: string }[] = (row as any).invite_events ?? [];
    const opened = events.filter((e) => e.event_type === "opened").length;
    const registered = events.filter((e) => e.event_type === "registered").length;

    return {
      ...row,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dancer: (row as any).dancer ?? null,
      event_counts: { opened, registered },
      isExpired:
        row.expires_at !== null && new Date(row.expires_at) < now,
      isExhausted:
        row.max_uses !== null && row.use_count >= row.max_uses,
    } as ClassInviteRow;
  });
}

/* -------------------------------------------------------------------------- */
/* Create audition session (admin)                                             */
/* -------------------------------------------------------------------------- */

export type CreateAuditionSessionInput = {
  classId: string;
  semesterId: string;
  label?: string;
  startAt: string;   // ISO datetime
  endAt: string;     // ISO datetime
  location?: string;
  capacity?: number;
  price?: number;
  notes?: string;
};

export type CreateAuditionSessionResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function createAuditionSession(
  input: CreateAuditionSessionInput,
): Promise<CreateAuditionSessionResult> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("audition_sessions")
    .insert({
      class_id: input.classId,
      semester_id: input.semesterId,
      label: input.label ?? null,
      start_at: input.startAt,
      end_at: input.endAt,
      location: input.location ?? null,
      capacity: input.capacity ?? null,
      price: input.price ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create session." };
  }

  return { success: true, id: data.id };
}

/* -------------------------------------------------------------------------- */
/* List audition sessions for a class (admin)                                 */
/* -------------------------------------------------------------------------- */

export async function listAuditionSessions(classId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("audition_sessions")
    .select(
      `
      *,
      audition_bookings ( id, status )
    `,
    )
    .eq("class_id", classId)
    .order("start_at", { ascending: true });

  if (error) return [];

  return (data ?? []).map((row) => ({
    ...row,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookingCount: ((row as any).audition_bookings ?? []).filter(
      (b: { status: string }) => b.status !== "cancelled",
    ).length,
  }));
}
