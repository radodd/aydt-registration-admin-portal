"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { headers } from "next/headers";

/**
 * Records an 'opened' event for an invite token and bumps use_count if
 * this is the first open (status was 'sent' or 'pending').
 *
 * Called server-side on the audition booking page load — the token is the
 * credential so no auth check is needed here.
 */
export async function recordInviteOpen(inviteId: string): Promise<void> {
  const supabase = createAdminClient();
  const hdrs = await headers();

  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  // Insert event (fire-and-forget; ignore errors)
  await supabase.from("invite_events").insert({
    invite_id: inviteId,
    event_type: "opened",
    ip_address: ip,
    user_agent: ua,
  });

  // Advance status to 'opened' only if it hasn't progressed further
  await supabase
    .from("class_invites")
    .update({ status: "opened", updated_at: new Date().toISOString() })
    .eq("id", inviteId)
    .in("status", ["pending", "sent"]);

  // Set opened_at only on the first open (idempotent — IS NULL guard prevents overwrite).
  // This denormalised timestamp allows dashboard queries to display "First Opened"
  // without joining invite_events.
  await supabase
    .from("class_invites")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("opened_at", null);
}
