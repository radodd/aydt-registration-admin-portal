import { Resend } from "resend";
import { wrapEmailLayout, emailButton } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface InstructorInviteEmailInput {
  toEmail: string;
  firstName?: string | null;
  /** Absolute link that lets the instructor set their password + finish setup. */
  setupLink: string;
}

/**
 * Invite email sent to a newly-created instructor. Delivered via Resend so the
 * wording + branding are code-controlled (previously this rode Supabase's single
 * global "Invite User" template, which then couldn't be reused for families).
 * The link routes through /auth/confirm to set a session, then lands on
 * /instructor/setup where the instructor sets their password.
 */
export async function sendInstructorInviteEmail(
  input: InstructorInviteEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.firstName?.trim() ? `Hi ${input.firstName},` : "Hi,";

  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">You're invited to AYDT</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      You've been invited to join American Youth Dance Theater as an instructor.
    </p>
    <p style="margin:0 0 20px;">
      To activate your account, set your password using the secure link below. Once set, you
      can sign in to view your classes, rosters, and attendance.
    </p>
    <p style="margin:0 0 24px;">${emailButton(input.setupLink, "Set up your account")}</p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br/>${input.setupLink}
    </p>
  `;

  const fromName = "AYDT";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "admin@aydt.nyc";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: input.toEmail,
      subject: "You're invited to AYDT — set up your instructor account",
      html: wrapEmailLayout(content),
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}
