"use server";

import { createAdminClient } from "@/utils/supabase/admin";

export type CreateAuditionBookingInput = {
  auditionSessionId: string;
  classId: string;
  inviteId: string;
  /** Existing dancer ID — provide this OR guest fields */
  dancerId?: string;
  /** Authenticated parent ID — required when dancerId is provided */
  parentId?: string;
  /** Guest fields — provide these when the student has no account */
  guestName?: string;
  guestEmail?: string;
};

export type CreateAuditionBookingResult =
  | { success: true; bookingId: string }
  | { success: false; error: string };

/**
 * Creates a confirmed audition booking for the given invite + session.
 *
 * Rules:
 *  - Token must still be valid (not expired / revoked / exhausted).
 *  - Session must have capacity remaining (if capacity is set).
 *  - Dancer / guest may not already have a booking for this session.
 *
 * On success:
 *  - Inserts `audition_bookings` row.
 *  - Increments `class_invites.use_count`.
 *  - Advances invite status to 'registered'.
 *  - Inserts an `invite_events` row with event_type='registered'.
 */
export async function createAuditionBooking(
  input: CreateAuditionBookingInput,
): Promise<CreateAuditionBookingResult> {
  const supabase = createAdminClient();

  const {
    auditionSessionId,
    classId,
    inviteId,
    dancerId,
    parentId,
    guestName,
    guestEmail,
  } = input;

  // Must identify as either an existing dancer or a guest
  if (!dancerId && !guestEmail) {
    return { success: false, error: "Dancer or guest email is required." };
  }

  // Re-validate the invite (prevents replay after expiry)
  const { data: invite, error: inviteError } = await supabase
    .from("class_invites")
    .select("id, status, expires_at, max_uses, use_count")
    .eq("id", inviteId)
    .single();

  if (inviteError || !invite) {
    return { success: false, error: "Invite not found." };
  }
  if (invite.status === "revoked") {
    return { success: false, error: "This invitation has been revoked." };
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { success: false, error: "This invitation has expired." };
  }
  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    return { success: false, error: "This invitation link has no remaining uses." };
  }

  // Check session capacity
  const { data: session, error: sessionError } = await supabase
    .from("audition_sessions")
    .select("id, capacity")
    .eq("id", auditionSessionId)
    .eq("is_active", true)
    .single();

  if (sessionError || !session) {
    return { success: false, error: "Audition session not found or no longer available." };
  }

  if (session.capacity !== null) {
    const { count } = await supabase
      .from("audition_bookings")
      .select("id", { count: "exact", head: true })
      .eq("audition_session_id", auditionSessionId)
      .neq("status", "cancelled");

    if ((count ?? 0) >= session.capacity) {
      return { success: false, error: "This audition session is full." };
    }
  }

  // Insert booking
  const { data: booking, error: bookingError } = await supabase
    .from("audition_bookings")
    .insert({
      audition_session_id: auditionSessionId,
      class_id: classId,
      invite_id: inviteId,
      dancer_id: dancerId ?? null,
      parent_id: parentId ?? null,
      guest_name: guestName ?? null,
      guest_email: guestEmail ?? null,
      status: "confirmed",
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    // Unique constraint violation = already booked
    if (bookingError?.code === "23505") {
      return {
        success: false,
        error: "You already have a booking for this audition session.",
      };
    }
    return { success: false, error: "Failed to create booking. Please try again." };
  }

  // Increment use_count and advance status
  await supabase
    .from("class_invites")
    .update({
      use_count: invite.use_count + 1,
      status: "registered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId);

  // Log event
  await supabase.from("invite_events").insert({
    invite_id: inviteId,
    event_type: "registered",
    audition_booking_id: booking.id,
  });

  return { success: true, bookingId: booking.id };
}
