"use server";

import { Resend } from "resend";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@madasacollective.com";

export async function sendFamilyEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ error?: string }> {
  if (!to || !subject.trim() || !body.trim()) {
    return { error: "To, subject, and message are required." };
  }

  // Convert plain-text newlines to <br> and wrap in the studio layout
  const bodyHtml = body
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#374151;">${line || "&nbsp;"}</p>`)
    .join("");

  const html = wrapEmailLayout(bodyHtml);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("sendFamilyEmail:", error);
    return { error: error.message ?? "Failed to send email." };
  }

  return {};
}
