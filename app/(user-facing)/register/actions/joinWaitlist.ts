"use server";

import { createClient } from "@/utils/supabase/server";
import { sendWaitlistJoinConfirmation } from "@/utils/email/sendWaitlistJoinConfirmation";

export interface JoinWaitlistInput {
  semesterId: string;
  /** Authoritative target: the class whose waitlist is being joined. */
  classId: string;
  /** Booking-grain target. section for full-term/tiered, meeting for drop-in. */
  sectionId?: string | null;
  meetingId?: string | null;
  /** Selected tier for tiered classes. */
  classTierId?: string | null;
  /** Existing dancer, when the parent picked one. NULL → details live in formData. */
  dancerId?: string | null;
  /** Display label for the prospective/selected dancer (for admin list + email). */
  dancerName?: string | null;
  /** Contact for the join-confirmation + later manual invite. */
  contactName?: string | null;
  contactEmail?: string | null;
  /** Captured registration form answers (registration minus payment). */
  formData?: Record<string, unknown>;
}

export interface JoinWaitlistResult {
  success: boolean;
  entryId?: string;
  /** True when the confirmation email failed but the entry was saved. */
  emailFailed?: boolean;
  error?: string;
}

/**
 * Meeting-plan #5: manual, capacity-neutral waitlist join. Writes a
 * `waitlist_entries` row holding a full registration record MINUS payment and
 * sends the family a "you're on the waitlist" confirmation. Does NOT touch
 * capacity or create any enrollment/dancer row — admins convert entries to real
 * registrations later (Path A link / Path B in-portal).
 *
 * Auth: the public registration flow already requires sign-in, so brand-new
 * users create an account upstream. We rely on that authenticated session and
 * the `waitlist_parent_insert` RLS policy (parent_user_id = auth.uid()).
 */
export async function joinWaitlist(
  input: JoinWaitlistInput,
): Promise<JoinWaitlistResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in to join a waitlist." };
  }

  // The class is the authoritative target. Guard against an empty/missing id so
  // a bad cart item fails cleanly instead of throwing a Postgres uuid syntax
  // error. Coerce blank optional ids to null for the same reason.
  if (!input.classId) {
    return { success: false, error: "Missing class for this waitlist entry." };
  }
  const sectionId = input.sectionId || null;
  const meetingId = input.meetingId || null;
  const classTierId = input.classTierId || null;
  const dancerId = input.dancerId || null;

  // Resolve the parent's family for the entry (and a fallback contact email).
  const { data: userRow } = await supabase
    .from("users")
    .select("family_id, email, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const familyId = (userRow as { family_id?: string | null } | null)?.family_id ?? null;
  const contactEmail =
    input.contactEmail?.trim() ||
    (userRow as { email?: string | null } | null)?.email ||
    user.email ||
    null;
  const contactName =
    input.contactName?.trim() ||
    [
      (userRow as { first_name?: string | null } | null)?.first_name,
      (userRow as { last_name?: string | null } | null)?.last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
    null;

  if (!contactEmail) {
    return {
      success: false,
      error: "A contact email is required to join the waitlist.",
    };
  }

  // Guard against duplicate active entries for the same dancer + class. For
  // drop-in (per-date) waitlisting the uniqueness is per meeting, so a dancer
  // can waitlist several distinct dates of the same class.
  if (dancerId) {
    let dupeQuery = supabase
      .from("waitlist_entries")
      .select("id")
      .eq("class_id", input.classId)
      .eq("dancer_id", dancerId)
      .in("status", ["waiting", "invited"]);
    dupeQuery = meetingId
      ? dupeQuery.eq("meeting_id", meetingId)
      : dupeQuery.is("meeting_id", null);
    const { data: dupe } = await dupeQuery.maybeSingle();
    if (dupe) {
      return {
        success: false,
        error: meetingId
          ? "This dancer is already on the waitlist for this date."
          : "This dancer is already on the waitlist for this class.",
      };
    }
  }

  // Next queue position for this class (chronological order also via signed_up_at).
  const { count: existingCount } = await supabase
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("class_id", input.classId);

  const { data: inserted, error: insertError } = await supabase
    .from("waitlist_entries")
    .insert({
      status: "waiting",
      position: (existingCount ?? 0) + 1,
      class_id: input.classId,
      section_id: sectionId,
      meeting_id: meetingId,
      class_tier_id: classTierId,
      dancer_id: dancerId,
      family_id: familyId,
      parent_user_id: user.id,
      form_data: input.formData ?? {},
      contact_name: contactName,
      contact_email: contactEmail,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      success: false,
      error: insertError?.message ?? "Failed to join the waitlist.",
    };
  }

  // Resolve the class + semester name for the confirmation email.
  const { data: classRow } = await supabase
    .from("classes")
    .select("name, semesters(name)")
    .eq("id", input.classId)
    .maybeSingle();

  const className = (classRow as { name?: string } | null)?.name ?? "your class";
  const semRel = (classRow as { semesters?: { name?: string } | { name?: string }[] } | null)
    ?.semesters;
  const semesterName = Array.isArray(semRel)
    ? (semRel[0]?.name ?? "this semester")
    : (semRel?.name ?? "this semester");

  const emailResult = await sendWaitlistJoinConfirmation({
    to: contactEmail,
    contactName,
    dancerName: input.dancerName ?? null,
    className,
    semesterName,
  });

  return {
    success: true,
    entryId: (inserted as { id: string }).id,
    emailFailed: !emailResult.success,
  };
}
