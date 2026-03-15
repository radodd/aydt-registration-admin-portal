"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/utils/supabase/admin";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";
import { requireAdmin } from "@/utils/requireAdmin";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_BODY = `Hi {{dancer_name}},\n\nYou have been personally selected to audition for {{class_name}}.\n\nPlease choose your audition time using the link below:\n\n{{invite_link}}\n\nWe look forward to seeing you at {{studio_name}}!`;

function replaceTokens(text: string, tokens: Record<string, string>): string {
  let result = text;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replaceAll(token, value);
  }
  // Catch-all for any remaining {{…}} placeholders
  return result.replace(/\{\{[^}]+\}\}/g, tokens["{{invite_link}}"] ?? "");
}

export async function sendInviteEmail(
  inviteId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();

  // Fetch invite with dancer + class (including invite_email config)
  const { data: invite, error: fetchError } = await supabase
    .from("class_invites")
    .select(
      `
      id, invite_token, email, status,
      dancer:dancers ( first_name, last_name ),
      class:classes ( name, invite_email )
    `,
    )
    .eq("id", inviteId)
    .single();

  if (fetchError || !invite) {
    return { success: false, error: "Invite not found." };
  }

  // Must have a target email
  const toEmail = invite.email;
  if (!toEmail) {
    return { success: false, error: "This invite has no target email address." };
  }

  // Build tokens
  const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://aydt.com";
  const inviteLink = `${siteUrl}/audition/${invite.invite_token}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cls = (invite as any).class as {
    name: string;
    invite_email?: {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      htmlBody?: string;
    } | null;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dancer = (invite as any).dancer as {
    first_name: string;
    last_name: string;
  } | null;

  const className = cls?.name ?? "our competition team";
  const dancerName = dancer
    ? `${dancer.first_name} ${dancer.last_name}`.trim()
    : "dancer";

  const tokens: Record<string, string> = {
    "{{dancer_name}}": dancerName,
    "{{class_name}}": className,
    "{{invite_link}}": inviteLink,
    "{{studio_name}}": "AYDT",
  };

  const config = cls?.invite_email;
  const subject = replaceTokens(
    config?.subject ?? `You're invited to audition — ${className}`,
    tokens,
  );
  const fromName = config?.fromName ?? "AYDT Registration";
  const fromEmail =
    config?.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? "noreply@aydt.com";

  // Build HTML body
  let htmlBody: string;
  if (config?.htmlBody) {
    htmlBody = prepareEmailHtml(replaceTokens(config.htmlBody, tokens));
  } else {
    // Convert plain-text default to minimal HTML
    const plainBody = replaceTokens(DEFAULT_BODY, tokens);
    const paragraphs = plainBody
      .split("\n\n")
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("\n");
    htmlBody = prepareEmailHtml(paragraphs);
  }

  // Send via Resend
  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject,
      html: htmlBody,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed";
    return { success: false, error: message };
  }

  // Update status + sent_at (only if not already opened/registered/revoked)
  await supabase
    .from("class_invites")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", inviteId)
    .in("status", ["pending"]);

  // Log event
  await supabase.from("invite_events").insert({
    invite_id: inviteId,
    event_type: "sent",
  });

  return { success: true };
}
