"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";
import { EmailDraft } from "@/types";
import { updateEmailDraft } from "./updateEmailDraft";
import { resolveRecipients } from "./resolveRecipients";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";
import { resolveEmailVariables } from "@/utils/resolveEmailVariables";

const resend = new Resend(process.env.RESEND_API_KEY!);
const INLINE_THRESHOLD = 500;
const BATCH_SIZE = 100;

export async function sendEmailNow(
  emailId: string,
  draft: EmailDraft,
): Promise<{ sent: number; failed: number }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role, signature_html")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || admin.role !== "super_admin") {
    throw new Error("Unauthorized: Super Admin only");
  }

  await updateEmailDraft(emailId, draft);

  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .select("*")
    .eq("id", emailId)
    .single();

  if (emailErr || !email) throw new Error("Email not found");

  // Resolve semester/session context from the first non-manual selection
  const { data: selectionContext } = await supabase
    .from("email_recipient_selections")
    .select(
      `selection_type, semester_id, session_id,
       semesters:semester_id(name),
       class_sessions:session_id(classes(name), semesters!class_sessions_semester_id_fkey(name))`,
    )
    .eq("email_id", emailId)
    .eq("is_excluded", false)
    .neq("selection_type", "manual")
    .limit(1)
    .maybeSingle();

  let semesterName = "";
  let sessionName = "";

  if (selectionContext) {
    if (selectionContext.selection_type === "semester") {
      const sem = Array.isArray(selectionContext.semesters)
        ? selectionContext.semesters[0]
        : selectionContext.semesters;
      semesterName = (sem as { name?: string } | null)?.name ?? "";
    } else if (selectionContext.selection_type === "session") {
      const sess = Array.isArray(selectionContext.class_sessions)
        ? selectionContext.class_sessions[0]
        : selectionContext.class_sessions;
      const cls = Array.isArray((sess as any)?.classes)
        ? (sess as any)?.classes[0]
        : (sess as any)?.classes;
      sessionName = (cls as { name?: string } | null)?.name ?? "";
      const parentSem = (sess as any)?.semesters;
      const sem = Array.isArray(parentSem) ? parentSem[0] : parentSem;
      semesterName = sem?.name ?? "";
    }
  }

  const recipients = await resolveRecipients(emailId);
  if (recipients.length === 0) throw new Error("No eligible recipients.");

  await supabase.from("email_recipients").delete().eq("email_id", emailId);
  await supabase.from("email_recipients").insert(
    recipients.map((r) => ({
      email_id: emailId,
      user_id: r.userId ?? null,
      subscriber_id: r.subscriberId ?? null,
      email_address: r.emailAddress,
      first_name: r.firstName,
      last_name: r.lastName,
    })),
  );

  // Mark as "sending" before dispatch. The final status ("sent" or "failed")
  // is stamped after actual delivery — by this function (inline path) or by
  // send-email-broadcast (edge function path).
  await supabase
    .from("emails")
    .update({
      status: "sending",
      updated_by_admin_id: admin.id,
    })
    .eq("id", emailId);

  if (recipients.length > INLINE_THRESHOLD) {
    // For large broadcasts, send-email-broadcast sets the final status + sent_at.
    await supabase.functions.invoke("send-email-broadcast", {
      body: { emailId },
    });
    await supabase.from("email_activity_logs").insert({
      email_id: emailId,
      action: "sent",
      admin_id: admin.id,
      metadata: { recipient_count: recipients.length, mode: "edge_function" },
    });
    return { sent: recipients.length, failed: 0 };
  }

  const signatureBlock =
    email.include_signature && admin.signature_html
      ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">${admin.signature_html}</div>`
      : null;

  function injectSignature(html: string, sig: string): string {
    const closeBody = html.lastIndexOf("</body>");
    if (closeBody !== -1) return html.slice(0, closeBody) + sig + html.slice(closeBody);
    return html + sig;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (recipient) => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        const unsubscribeParam = recipient.subscriberId
          ? `sub=${recipient.subscriberId}`
          : `uid=${recipient.userId}`;
        const unsubscribeFooter = appUrl
          ? `<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;"><a href="${appUrl}/unsubscribe?${unsubscribeParam}" style="color:#9ca3af;">Unsubscribe</a></p>`
          : "";

        let resolvedHtml = resolveEmailVariables(email.body_html, {
          parent: {
            firstName: recipient.firstName,
            lastName: recipient.lastName,
          },
          participant: null, // student_name requires dancer join — resolved in edge function
          semester: semesterName ? { name: semesterName } : null,
          session: sessionName ? { name: sessionName } : null,
        });
        if (signatureBlock) resolvedHtml = injectSignature(resolvedHtml, signatureBlock);
        if (unsubscribeFooter) resolvedHtml = injectSignature(resolvedHtml, unsubscribeFooter);
        const personalizedHtml = prepareEmailHtml(resolvedHtml);

        try {
          const { data: sentData, error: sendErr } = await resend.emails.send({
            from: `${email.sender_name} <${email.sender_email}>`,
            to: recipient.emailAddress,
            subject: email.subject,
            html: personalizedHtml,
            ...(email.reply_to_email && { replyTo: email.reply_to_email }),
          });

          if (sendErr) throw sendErr;

          await supabase.from("email_deliveries").upsert(
            {
              email_id: emailId,
              user_id: recipient.userId ?? null,
              subscriber_id: recipient.subscriberId ?? null,
              email_address: recipient.emailAddress,
              resend_message_id: sentData?.id ?? null,
              status: "sent",
            },
            { onConflict: "email_id,email_address" },
          );
          sent++;
        } catch {
          await supabase.from("email_deliveries").upsert(
            {
              email_id: emailId,
              user_id: recipient.userId ?? null,
              subscriber_id: recipient.subscriberId ?? null,
              email_address: recipient.emailAddress,
              status: "pending",
            },
            { onConflict: "email_id,email_address" },
          );
          failed++;
        }
      }),
    );
  }

  // Stamp final status after inline delivery. "failed" only if every single
  // recipient failed; otherwise treat partial success as "sent".
  const finalStatus = sent > 0 ? "sent" : "failed";
  await supabase
    .from("emails")
    .update({ status: finalStatus, sent_at: new Date().toISOString() })
    .eq("id", emailId)
    .eq("status", "sending");

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "sent",
    admin_id: admin.id,
    metadata: { sent, failed, total: recipients.length, mode: "inline" },
  });

  return { sent, failed };
}
