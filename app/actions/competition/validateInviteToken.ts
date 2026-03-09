"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import type { InviteTokenValidation } from "@/types";

/**
 * Validates a class invite token and returns the associated class +
 * audition sessions if the token is valid.
 *
 * Uses the service-role client so the query bypasses RLS; the token itself
 * is the secret credential.
 *
 * This action is intentionally side-effect-free — call it on page load to
 * gate access. Use `recordInviteOpen` to log the open event separately.
 */
export async function validateInviteToken(
  token: string,
): Promise<InviteTokenValidation> {
  const supabase = createAdminClient();

  const { data: invite, error } = await supabase
    .from("class_invites")
    .select(
      `
      id,
      class_id,
      access_type,
      email,
      dancer_id,
      invite_token,
      expires_at,
      max_uses,
      use_count,
      status,
      sent_at,
      opened_at,
      created_by,
      notes,
      created_at,
      updated_at
    `,
    )
    .eq("invite_token", token)
    .single();

  if (error || !invite) {
    return { valid: false, reason: "not_found" };
  }

  if (invite.status === "revoked") {
    return { valid: false, reason: "revoked" };
  }

  if (
    invite.expires_at &&
    new Date(invite.expires_at) < new Date()
  ) {
    return { valid: false, reason: "expired" };
  }

  if (
    invite.max_uses !== null &&
    invite.use_count >= invite.max_uses
  ) {
    return { valid: false, reason: "exhausted" };
  }

  // Fetch the class
  const { data: danceClass, error: classError } = await supabase
    .from("classes")
    .select("id, name, discipline, division, description")
    .eq("id", invite.class_id)
    .single();

  if (classError || !danceClass) {
    return { valid: false, reason: "not_found" };
  }

  // Fetch active audition sessions for this class
  const { data: auditionSessions } = await supabase
    .from("audition_sessions")
    .select("*")
    .eq("class_id", invite.class_id)
    .eq("is_active", true)
    .order("start_at", { ascending: true });

  return {
    valid: true,
    invite,
    danceClass,
    auditionSessions: auditionSessions ?? [],
  };
}
