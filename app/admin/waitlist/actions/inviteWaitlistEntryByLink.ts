"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { sendWaitlistOfferEmail, formatExpiryWindow } from "@/utils/email/waitlistOfferEmail";

/** Fallback offer window (hours) when a semester has no waitlist_settings. */
const DEFAULT_INVITE_EXPIRY_HOURS = 48;

export interface InviteByLinkResult {
  success: boolean;
  error?: string;
}

/**
 * Meeting-plan #5, Path A: the admin manually invites a waitlisted family by
 * emailing them a tokenized link. The family completes ONLY payment via Elavon
 * hosted checkout (handled by /waitlist/accept/[token]). This is an
 * admin-INITIATED send — not the forbidden automatic auto-invite.
 */
export async function inviteWaitlistEntryByLink(
  entryId: string,
): Promise<InviteByLinkResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: entry, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id, status, invite_token, contact_name, contact_email, classes(name, semesters(name, waitlist_settings))",
    )
    .eq("id", entryId)
    .maybeSingle();

  if (error || !entry) {
    return { success: false, error: "Waitlist entry not found." };
  }
  if (!entry.contact_email) {
    return { success: false, error: "This entry has no contact email." };
  }

  // Resolve the class/semester (and the semester's configured offer window) so
  // the link expiry and the email copy both reflect the admin-set value.
  type SemRel = { name?: string; waitlist_settings?: { inviteExpiryHours?: number } };
  const classRel = entry.classes as
    | { name?: string; semesters?: SemRel | SemRel[] }
    | { name?: string; semesters?: SemRel | SemRel[] }[]
    | null;
  const cls = Array.isArray(classRel) ? classRel[0] : classRel;
  const className = cls?.name ?? "your class";
  const semRel = Array.isArray(cls?.semesters) ? cls?.semesters[0] : cls?.semesters;
  const semesterName = semRel?.name ?? "";

  const expiryHours =
    semRel?.waitlist_settings?.inviteExpiryHours ?? DEFAULT_INVITE_EXPIRY_HOURS;
  const expiryWindowLabel = formatExpiryWindow(expiryHours);
  const expiresAt = new Date(
    Date.now() + expiryHours * 60 * 60 * 1000,
  ).toISOString();

  const { error: updateError } = await supabase
    .from("waitlist_entries")
    .update({
      status: "invited",
      invitation_sent_at: new Date().toISOString(),
      invitation_expires_at: expiresAt,
    })
    .eq("id", entryId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // SITE_URL is the canonical server-side origin used by every payment/redirect
  // link in the app. In dev it's the ngrok tunnel; in production it must be
  // https://register.aydt.nyc. Fall back to the public site URL so the emailed
  // link still resolves to production even if SITE_URL is somehow unset there.
  const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${siteUrl}/waitlist/accept/${entry.invite_token}`;

  const result = await sendWaitlistOfferEmail({
    toEmail: entry.contact_email,
    contactName: entry.contact_name,
    className,
    semesterName,
    claimLink: link,
    expiryWindowLabel,
  });
  if (!result.ok) {
    // The entry is already marked invited; surface the email failure so the
    // admin can retry or reach out manually.
    return { success: false, error: `Invite saved but email failed: ${result.error}` };
  }

  return { success: true };
}
