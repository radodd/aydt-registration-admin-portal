"use server";

import { Resend } from "resend";
import { sendSms } from "@/utils/sendSms";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@madasacollective.com";

export async function sendPaymentReminder({
  method,
  email,
  phone,
  userId,
  subject,
  body,
}: {
  method: "email" | "sms";
  email?: string;
  phone?: string;
  userId?: string;
  subject: string;
  body: string;
}): Promise<{ error?: string }> {
  if (method === "email") {
    if (!email) return { error: "No email address on file." };
    const bodyHtml = body
      .split("\n")
      .map(
        (line) =>
          `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#374151;">${line || "&nbsp;"}</p>`,
      )
      .join("");
    const html = wrapEmailLayout(bodyHtml);
    const { error } = await resend.emails.send({ from: FROM, to: email, subject, html });
    if (error) return { error: error.message ?? "Failed to send email." };
  } else {
    if (!phone) return { error: "No phone number on file for this family." };
    await sendSms(phone, body, userId);
  }
  return {};
}
