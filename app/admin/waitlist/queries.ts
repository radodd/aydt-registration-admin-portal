import { createClient } from "@/utils/supabase/client";

/** One waitlist entry as shown in the admin manage view. */
export interface AdminWaitlistEntry {
  id: string;
  status: string;
  position: number;
  signedUpAt: string;
  contactName: string | null;
  contactEmail: string | null;
  dancerName: string | null;
  dancerId: string | null;
  familyId: string | null;
  classId: string | null;
  className: string;
  semesterName: string;
  sectionId: string | null;
  meetingId: string | null;
  classTierId: string | null;
  formData: Record<string, unknown>;
  inviteToken: string;
  invitationSentAt: string | null;
  invitationExpiresAt: string | null;
}

const WAITLIST_SELECT = `
  id, status, position, signed_up_at, contact_name, contact_email,
  dancer_id, family_id, class_id, section_id, meeting_id, class_tier_id,
  form_data, invite_token, invitation_sent_at, invitation_expires_at,
  classes ( name, semesters ( name ) ),
  dancers ( first_name, last_name )
`;

type RawRow = {
  id: string;
  status: string;
  position: number;
  signed_up_at: string;
  contact_name: string | null;
  contact_email: string | null;
  dancer_id: string | null;
  family_id: string | null;
  class_id: string | null;
  section_id: string | null;
  meeting_id: string | null;
  class_tier_id: string | null;
  form_data: Record<string, unknown> | null;
  invite_token: string;
  invitation_sent_at: string | null;
  invitation_expires_at: string | null;
  classes: { name?: string; semesters?: { name?: string } | { name?: string }[] } | null;
  dancers: { first_name?: string; last_name?: string } | null;
};

function dancerNameFromRow(r: RawRow): string | null {
  if (r.dancers?.first_name || r.dancers?.last_name) {
    return `${r.dancers.first_name ?? ""} ${r.dancers.last_name ?? ""}`.trim();
  }
  // Brand-new dancer captured as raw JSON (see joinWaitlist).
  const nd = (r.form_data as { _newDancer?: { firstName?: string; lastName?: string } } | null)
    ?._newDancer;
  if (nd?.firstName || nd?.lastName) {
    return `${nd.firstName ?? ""} ${nd.lastName ?? ""}`.trim();
  }
  return null;
}

/**
 * All ACTIVE waitlist entries (waiting/invited), chronological per class. The
 * admin uses this to pick who to invite. Registered/declined/cancelled entries
 * are excluded by default.
 */
export async function getWaitlistEntries(): Promise<AdminWaitlistEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(WAITLIST_SELECT)
    .in("status", ["waiting", "invited"])
    .order("signed_up_at", { ascending: true });

  if (error) {
    console.error("getWaitlistEntries:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawRow[]).map((r) => {
    const sem = Array.isArray(r.classes?.semesters)
      ? r.classes?.semesters[0]
      : r.classes?.semesters;
    return {
      id: r.id,
      status: r.status,
      position: r.position,
      signedUpAt: r.signed_up_at,
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      dancerName: dancerNameFromRow(r),
      dancerId: r.dancer_id,
      familyId: r.family_id,
      classId: r.class_id,
      className: r.classes?.name ?? "Unknown class",
      semesterName: sem?.name ?? "",
      sectionId: r.section_id,
      meetingId: r.meeting_id,
      classTierId: r.class_tier_id,
      formData: r.form_data ?? {},
      inviteToken: r.invite_token,
      invitationSentAt: r.invitation_sent_at,
      invitationExpiresAt: r.invitation_expires_at,
    };
  });
}
