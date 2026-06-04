"use server";

import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Fallback offer window (hours) when a semester has no waitlist_settings. */
const DEFAULT_INVITE_EXPIRY_HOURS = 48;

/** Human-readable offer window: whole days read as days, otherwise hours. */
function formatExpiryWindow(hours: number): string {
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

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

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${siteUrl}/waitlist/accept/${entry.invite_token}`;

  const greeting = entry.contact_name?.trim()
    ? `Hi ${entry.contact_name},`
    : "Hi,";

  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">A spot is available</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      Good news — a spot has opened in <strong>${className}</strong>${
        semesterName ? ` (${semesterName})` : ""
      } and we'd like to offer it to you from the waitlist.
    </p>
    <p style="margin:0 0 20px;">
      To claim your spot, complete your payment using the secure link below.
      This link expires in ${expiryWindowLabel}.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:#7c3a5e;color:#fff;
        text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
        Complete your registration
      </a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br/>${link}
    </p>
  `;

  const fromName = "AYDT Registration";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@aydt.com";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: entry.contact_email,
      subject: `A spot opened in ${className} — complete your registration`,
      html: wrapEmailLayout(content),
    });
  } catch (err: unknown) {
    // The entry is already marked invited; surface the email failure so the
    // admin can retry or reach out manually.
    const message = err instanceof Error ? err.message : "Email send failed";
    return { success: false, error: `Invite saved but email failed: ${message}` };
  }

  return { success: true };
}
