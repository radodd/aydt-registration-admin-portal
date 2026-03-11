"use server";

import { createClient } from "@/utils/supabase/server";
import { Resend } from "resend";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";
import { resolveEmailVariables } from "@/utils/resolveEmailVariables";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function retryFailedRecipients(
  emailId: string,
): Promise<{ retried: number; succeeded: number; stillFailed: number }> {
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

  // Load the email
  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .select("*")
    .eq("id", emailId)
    .single();

  if (emailErr || !email) throw new Error("Email not found");

  // Load failed deliveries with recipient context
  const { data: failedDeliveries, error: deliveriesErr } = await supabase
    .from("email_deliveries")
    .select("id, email_address, user_id, subscriber_id")
    .eq("email_id", emailId)
    .eq("status", "failed");

  if (deliveriesErr) throw new Error(deliveriesErr.message);
  if (!failedDeliveries || failedDeliveries.length === 0) {
    return { retried: 0, succeeded: 0, stillFailed: 0 };
  }

  // Load recipient context (name, dancer context) from email_recipients snapshot
  const { data: recipientRows } = await supabase
    .from("email_recipients")
    .select("email_address, first_name, last_name, dancer_context")
    .eq("email_id", emailId);

  const recipientMap = new Map(
    (recipientRows ?? []).map((r) => [r.email_address, r]),
  );

  // Resolve semester/session context (same logic as sendEmailNow)
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

  const signatureBlock =
    email.include_signature && admin.signature_html
      ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">${admin.signature_html}</div>`
      : null;

  function injectSignature(html: string, sig: string): string {
    const closeBody = html.lastIndexOf("</body>");
    if (closeBody !== -1) return html.slice(0, closeBody) + sig + html.slice(closeBody);
    return html + sig;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  let succeeded = 0;
  let stillFailed = 0;

  await Promise.allSettled(
    failedDeliveries.map(async (delivery) => {
      const recipientCtx = recipientMap.get(delivery.email_address);
      const firstName = recipientCtx?.first_name ?? "";
      const lastName = recipientCtx?.last_name ?? "";
      const dancerContext = recipientCtx?.dancer_context ?? [];

      const unsubscribeParam = delivery.subscriber_id
        ? `sub=${delivery.subscriber_id}`
        : `uid=${delivery.user_id}`;
      const unsubscribeFooter = appUrl
        ? `<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;"><a href="${appUrl}/unsubscribe?${unsubscribeParam}" style="color:#9ca3af;">Unsubscribe</a></p>`
        : "";

      let resolvedHtml = resolveEmailVariables(email.body_html, {
        parent: { firstName, lastName },
        participant: null,
        semester: semesterName ? { name: semesterName } : null,
        session: sessionName ? { name: sessionName } : null,
        dancers: dancerContext,
      });
      if (signatureBlock) resolvedHtml = injectSignature(resolvedHtml, signatureBlock);
      if (unsubscribeFooter) resolvedHtml = injectSignature(resolvedHtml, unsubscribeFooter);
      const personalizedHtml = prepareEmailHtml(resolvedHtml);

      try {
        const { data: sentData, error: sendErr } = await resend.emails.send({
          from: `${email.sender_name} <${email.sender_email}>`,
          to: delivery.email_address,
          subject: email.subject,
          html: personalizedHtml,
          ...(email.reply_to_email && { replyTo: email.reply_to_email }),
        });

        if (sendErr) throw sendErr;

        await supabase
          .from("email_deliveries")
          .update({
            status: "sent",
            failure_reason: null,
            resend_message_id: sentData?.id ?? null,
          })
          .eq("id", delivery.id);

        succeeded++;
      } catch (err) {
        await supabase
          .from("email_deliveries")
          .update({
            failure_reason: err instanceof Error ? err.message : String(err),
          })
          .eq("id", delivery.id);

        stillFailed++;
      }
    }),
  );

  return { retried: failedDeliveries.length, succeeded, stillFailed };
}
