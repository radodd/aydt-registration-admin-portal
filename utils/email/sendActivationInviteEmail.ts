import { Resend } from "resend";
import { wrapEmailLayout, emailButton } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface ActivationInviteEmailInput {
  toEmail: string;
  parentName?: string | null;
  familyName?: string | null;
}

/**
 * Activation invite for a SILENTLY-migrated family account (#62, Option A).
 *
 * Passwordless-on-first-need: the account already exists, so this email carries
 * NO setup token. Instead it points the parent at the standard "Forgot password"
 * flow (/auth/request-password-reset), where they request a fresh reset link on
 * demand. That keeps the invite expiry-proof (no dead recovery links for slow
 * clickers) and spreads auth load across days as families activate themselves.
 *
 * Sent via Resend with our branded layout — NOT the Supabase invite template
 * (reserved for the instructor flow). Mirrors sendFamilyWelcomeEmail, minus the
 * token link.
 */
export async function sendActivationInviteEmail(
  input: ActivationInviteEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.parentName?.trim() ? `Hi ${input.parentName},` : "Hi,";
  const familyLabel = input.familyName?.trim()
    ? ` (<strong>${input.familyName}</strong>)`
    : "";

  const base =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
  const resetLink = `${base}/auth/request-password-reset`;

  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">Your AYDT account is ready</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      We've moved registration to a new portal, and an account for your family${familyLabel}
      is already set up on the American Youth Dance Theater registration portal.
    </p>
    <p style="margin:0 0 20px;">
      To get in, set your password using the button below — choose
      <strong>Forgot password</strong>, enter <strong>${input.toEmail}</strong>, and follow the
      emailed link. Once set, you can sign in any time to manage your dancers, register for
      classes, and view payments.
    </p>
    <p style="margin:0 0 24px;">${emailButton(resetLink, "Set your password")}</p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br/>${resetLink}
    </p>
  `;

  const fromName = "AYDT Registration";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "admin@aydt.nyc";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: input.toEmail,
      subject: "Your AYDT account is ready — set your password",
      html: wrapEmailLayout(content),
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}
