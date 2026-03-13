"use server";

import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";
import { requireAdmin } from "@/utils/requireAdmin";

const resend = new Resend(process.env.RESEND_API_KEY);

const MOCK_TOKENS: Record<string, string> = {
  "{{participant_name}}": "Alex Johnson",
  "{{parent_name}}": "Sarah Johnson",
  "{{session_name}}": "Ballet Fundamentals",
  "{{hold_until_datetime}}": "February 24, 2026 at 3:00 PM",
  "{{timezone}}": "Eastern Time",
  "{{accept_link}}": "#",
};

function replaceTokens(html: string, tokens: Record<string, string>): string {
  let result = html;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export async function sendTestWaitlistEmail(
  semesterId: string,
  testEmail: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: semester, error: fetchError } = await supabase
    .from("semesters")
    .select("waitlist_settings")
    .eq("id", semesterId)
    .single();

  if (fetchError || !semester) {
    return { success: false, error: "Semester not found" };
  }

  const settings = semester.waitlist_settings as {
    invitationEmail?: {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      htmlBody?: string;
    };
  } | null;

  const email = settings?.invitationEmail;

  if (!email?.htmlBody) {
    return { success: false, error: "No email body configured" };
  }

  const processedHtml = prepareEmailHtml(replaceTokens(email.htmlBody, MOCK_TOKENS));
  const subject = email.subject
    ? replaceTokens(email.subject, MOCK_TOKENS)
    : "Test: Waitlist Invitation";

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed";
    return { success: false, error: message };
  }
}
