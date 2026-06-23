import { Resend } from "resend";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface WaitlistOfferEmailInput {
  toEmail: string;
  contactName?: string | null;
  className: string;
  semesterName?: string | null;
  /** Absolute /waitlist/accept/<token> URL the family pays through. */
  claimLink: string;
  /** Human label e.g. "48 hours" / "2 days". */
  expiryWindowLabel: string;
}

/**
 * The "a spot opened — claim it" email. Shared by the admin manual invite
 * (inviteWaitlistEntryByLink, Path A) and the zero-touch auto-promotion engine
 * so the copy + link format stay in one place.
 */
export async function sendWaitlistOfferEmail(
  input: WaitlistOfferEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.contactName?.trim() ? `Hi ${input.contactName},` : "Hi,";
  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">A spot is available</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      Good news — a spot has opened in <strong>${input.className}</strong>${
        input.semesterName ? ` (${input.semesterName})` : ""
      } and we'd like to offer it to you from the waitlist.
    </p>
    <p style="margin:0 0 20px;">
      To claim your spot, complete your payment using the secure link below.
      This link expires in ${input.expiryWindowLabel}.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${input.claimLink}" style="display:inline-block;background:#7c3a5e;color:#fff;
        text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
        Complete your registration
      </a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br/>${input.claimLink}
    </p>
  `;

  const fromName = "AYDT Registration";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@aydt.nyc";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: input.toEmail,
      subject: `A spot opened in ${input.className} — complete your registration`,
      html: wrapEmailLayout(content),
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

/** Human-readable offer window: whole days read as days, otherwise hours. */
export function formatExpiryWindow(hours: number): string {
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

const FROM_NAME = "AYDT Registration";
const fromAddr = () => process.env.RESEND_FROM_EMAIL || "noreply@aydt.nyc";

/**
 * Pre-expiry nudge for an outstanding offer. Sent once by the engine ~a few hours
 * before the claim window lapses (deduped via offer_reminder_sent_at).
 */
export async function sendWaitlistOfferReminderEmail(input: {
  toEmail: string;
  contactName?: string | null;
  className: string;
  semesterName?: string | null;
  claimLink: string;
  /** Time remaining, e.g. "6 hours". */
  timeLeftLabel: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.contactName?.trim() ? `Hi ${input.contactName},` : "Hi,";
  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">Your spot is still waiting</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      A reminder that a spot in <strong>${input.className}</strong>${
        input.semesterName ? ` (${input.semesterName})` : ""
      } is still being held for you — but only for about <strong>${input.timeLeftLabel}</strong> more.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${input.claimLink}" style="display:inline-block;background:#7c3a5e;color:#fff;
        text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
        Complete your registration
      </a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br/>${input.claimLink}
    </p>
  `;
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${fromAddr()}>`,
      to: input.toEmail,
      subject: `Reminder: your spot in ${input.className} expires soon`,
      html: wrapEmailLayout(content),
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

/**
 * Sent when an offer lapses unclaimed — the held seat has moved on. Reassures the
 * family they remain on the waitlist for any future opening.
 */
export async function sendWaitlistOfferExpiredEmail(input: {
  toEmail: string;
  contactName?: string | null;
  className: string;
  semesterName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.contactName?.trim() ? `Hi ${input.contactName},` : "Hi,";
  const content = `
    <h1 style="font-size:20px;margin:0 0 16px;">Your offered spot has expired</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      The spot we were holding for you in <strong>${input.className}</strong>${
        input.semesterName ? ` (${input.semesterName})` : ""
      } wasn't claimed in time, so it has moved on to the next family.
    </p>
    <p style="margin:0;">
      You're still on the waitlist — if another spot opens, we'll reach out again.
    </p>
  `;
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${fromAddr()}>`,
      to: input.toEmail,
      subject: `Your spot in ${input.className} has expired`,
      html: wrapEmailLayout(content),
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}
