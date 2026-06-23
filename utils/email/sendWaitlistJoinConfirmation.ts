import { Resend } from "resend";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface WaitlistJoinConfirmationInput {
  to: string;
  /** Family/parent display name for the greeting. */
  contactName?: string | null;
  dancerName?: string | null;
  className: string;
  semesterName: string;
}

/**
 * Meeting-plan #5: the ONLY automated waitlist email. A simple receipt confirming
 * the family is on the waitlist. This is NOT an invitation — admins invite
 * manually later (Path A link / Path B in-portal). No "a spot opened" automation.
 */
export async function sendWaitlistJoinConfirmation(
  input: WaitlistJoinConfirmationInput,
): Promise<{ success: boolean; error?: string }> {
  const fromName = "AYDT Registration";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@aydt.nyc";

  const greetingName = input.contactName?.trim();
  const dancerLine = input.dancerName?.trim()
    ? `<p style="margin:0 0 12px;">Dancer: <strong>${input.dancerName}</strong></p>`
    : "";

  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">You're on the waitlist</h1>
    <p style="margin:0 0 12px;">${greetingName ? `Hi ${greetingName},` : "Hi,"}</p>
    <p style="margin:0 0 12px;">
      Thanks for signing up. We've added you to the waitlist for
      <strong>${input.className}</strong> (${input.semesterName}).
    </p>
    ${dancerLine}
    <p style="margin:0 0 12px;">
      This class is currently full. Your spot in line is saved and timestamped.
      <strong>You have not been charged.</strong>
    </p>
    <p style="margin:0 0 12px;">
      If a spot becomes available, an AYDT administrator will reach out to you
      directly with next steps to complete your registration. There's nothing
      more you need to do right now.
    </p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">
      You're receiving this because you joined a class waitlist at AYDT.
    </p>
  `;

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: input.to,
      subject: `You're on the waitlist for ${input.className}`,
      html: wrapEmailLayout(content),
    });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed";
    return { success: false, error: message };
  }
}
