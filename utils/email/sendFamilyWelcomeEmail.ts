import { Resend } from "resend";
import { wrapEmailLayout, emailButton } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface FamilyWelcomeEmailInput {
  toEmail: string;
  parentName?: string | null;
  familyName?: string | null;
  /** Absolute link that lets the parent set their password + sign in. */
  setupLink: string;
}

/**
 * Welcome email sent to a newly-created family's primary parent. Delivered via
 * Resend (NOT the Supabase "Invite User" template, which is reserved for the
 * instructor flow — see sendInstructorInviteEmail). The link routes through
 * /auth/confirm to set a session, then lands on /auth/reset-password where the
 * parent sets their password.
 */
export async function sendFamilyWelcomeEmail(
  input: FamilyWelcomeEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.parentName?.trim() ? `Hi ${input.parentName},` : "Hi,";
  const familyLabel = input.familyName?.trim()
    ? ` (<strong>${input.familyName}</strong>)`
    : "";

  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">Welcome to AYDT</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      An account has been created for your family${familyLabel} on the American Youth Dance
      Theater registration portal.
    </p>
    <p style="margin:0 0 20px;">
      To get started, set your password using the secure link below. Once set, you can sign
      in any time to manage your dancers, register for classes, and view payments.
    </p>
    <p style="margin:0 0 24px;">${emailButton(input.setupLink, "Set your password")}</p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br/>${input.setupLink}
    </p>
  `;

  const fromName = "AYDT Registration";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "admin@aydt.nyc";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: input.toEmail,
      subject: "Welcome to AYDT — set your password",
      html: wrapEmailLayout(content),
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}
