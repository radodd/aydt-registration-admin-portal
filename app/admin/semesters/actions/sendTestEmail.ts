"use server";

import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

const MOCK_TOKENS: Record<string, string> = {
  "{{first_name}}": "Alex",
  "{{session_title}}": "Ballet Fundamentals",
  "{{total_amount}}": "$250.00",
  "{{registration_date}}": new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
};

function replaceTokens(html: string, tokens: Record<string, string>): string {
  let result = html;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export async function sendTestEmail(
  semesterId: string,
  testEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: semester, error: fetchError } = await supabase
    .from("semesters")
    .select("confirmation_email")
    .eq("id", semesterId)
    .single();

  if (fetchError || !semester) {
    return { success: false, error: "Semester not found" };
  }

  const email = semester.confirmation_email as {
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    htmlBody?: string;
  } | null;

  if (!email?.htmlBody) {
    return { success: false, error: "No email body configured" };
  }

  const processedHtml = replaceTokens(email.htmlBody, MOCK_TOKENS);
  const subject = email.subject
    ? replaceTokens(email.subject, MOCK_TOKENS)
    : "Test: Registration Confirmation";

  const fromName = email.fromName || "AYDT Registration";
  const fromEmail = email.fromEmail || process.env.RESEND_FROM_EMAIL || "noreply@aydt.com";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: testEmail,
      subject: `[TEST] ${subject}`,
      html: processedHtml,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Send failed" };
  }
}
