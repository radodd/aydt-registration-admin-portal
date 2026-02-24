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
       sessions:session_id(name, semesters!sessions_semester_id_fkey(name))`,
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
      const sess = Array.isArray(selectionContext.sessions)
        ? selectionContext.sessions[0]
        : selectionContext.sessions;
      sessionName = (sess as { name?: string } | null)?.name ?? "";
      const parentSem = (
        sess as { semesters?: { name?: string } | { name?: string }[] } | null
      )?.semesters;
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
      user_id: r.userId,
      email_address: r.emailAddress,
      first_name: r.firstName,
      last_name: r.lastName,
    })),
  );

  await supabase
    .from("emails")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_by_admin_id: admin.id,
    })
    .eq("id", emailId);

  if (recipients.length > INLINE_THRESHOLD) {
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

  const signatureSuffix =
    email.include_signature && admin.signature_html
      ? `<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;"><div>${admin.signature_html}</div>`
      : "";

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (recipient) => {
        const personalizedHtml = prepareEmailHtml(
          resolveEmailVariables(email.body_html, {
            parent: {
              firstName: recipient.firstName,
              lastName: recipient.lastName,
            },
            participant: null, // student_name requires dancer join — resolved in edge function
            semester: semesterName ? { name: semesterName } : null,
            session: sessionName ? { name: sessionName } : null,
          }) + signatureSuffix,
        );

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
              user_id: recipient.userId,
              email_address: recipient.emailAddress,
              resend_message_id: sentData?.id ?? null,
              status: "sent",
            },
            { onConflict: "email_id,user_id" },
          );
          sent++;
        } catch {
          await supabase.from("email_deliveries").upsert(
            {
              email_id: emailId,
              user_id: recipient.userId,
              email_address: recipient.emailAddress,
              status: "pending",
            },
            { onConflict: "email_id,user_id" },
          );
          failed++;
        }
      }),
    );
  }

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "sent",
    admin_id: admin.id,
    metadata: { sent, failed, total: recipients.length, mode: "inline" },
  });

  return { sent, failed };
}
