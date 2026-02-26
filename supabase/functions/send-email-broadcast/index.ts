import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const APP_URL = Deno.env.get("APP_URL") ?? "";
const BATCH_SIZE = 100;

function resolveVariables(html: string, vars: Record<string, string>): string {
  return html.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? `{{${key}}}`,
  );
}

function prepareEmailHtml(html: string): string {
  return html.replace(/<img([^>]*?)>/gi, (_match: string, attrs: string) => {
    if (/\bwidth=/i.test(attrs)) return _match;
    const isBanner =
      /data-layout="banner"/i.test(attrs) || !/data-layout=/i.test(attrs);
    return `<img${attrs} width="${isBanner ? 600 : 400}">`;
  });
}

Deno.serve(async (req) => {
  try {
    const { emailId } = await req.json();
    if (!emailId) {
      return new Response(JSON.stringify({ error: "emailId required" }), {
        status: 400,
      });
    }

    // Fetch email record
    const { data: email, error: emailErr } = await supabase
      .from("emails")
      .select("*")
      .eq("id", emailId)
      .single();

    if (emailErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), {
        status: 404,
      });
    }

    // Guard against double-send: only process emails in "sending" state.
    // If cron fires twice or this function is invoked a second time after
    // already completing, skip silently.
    if (email.status !== "sending") {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, status: email.status }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch admin signature if needed
    let signatureSuffix = "";
    if (email.include_signature && email.updated_by_admin_id) {
      const { data: adminUser } = await supabase
        .from("users")
        .select("signature_html")
        .eq("id", email.updated_by_admin_id)
        .single();
      if (adminUser?.signature_html) {
        signatureSuffix = `<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;"><div>${adminUser.signature_html}</div>`;
      }
    }

    // Fetch snapshotted recipients
    const { data: recipients, error: recErr } = await supabase
      .from("email_recipients")
      .select("user_id, email_address, first_name, last_name")
      .eq("email_id", emailId);

    if (recErr || !recipients) {
      return new Response(JSON.stringify({ error: "Recipients not found" }), {
        status: 500,
      });
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (recipient) => {
          const vars: Record<string, string> = {
            parent_name: recipient.first_name,
            student_name: "",
            semester_name: "",
            session_name: "",
          };

          const unsubscribeFooter = APP_URL
            ? `<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;"><a href="${APP_URL}/unsubscribe?uid=${recipient.user_id}" style="color:#9ca3af;">Unsubscribe</a></p>`
            : "";

          const personalizedHtml = prepareEmailHtml(
            resolveVariables(email.body_html, vars) + signatureSuffix + unsubscribeFooter,
          );

          try {
            const { data: sentData, error: sendErr } = await resend.emails.send(
              {
                from: `${email.sender_name} <${email.sender_email}>`,
                to: recipient.email_address,
                subject: email.subject,
                html: personalizedHtml,
                ...(email.reply_to_email && {
                  replyTo: email.reply_to_email,
                }),
              },
            );

            if (sendErr) throw sendErr;

            await supabase.from("email_deliveries").upsert(
              {
                email_id: emailId,
                user_id: recipient.user_id,
                email_address: recipient.email_address,
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
                user_id: recipient.user_id,
                email_address: recipient.email_address,
                status: "pending",
              },
              { onConflict: "email_id,user_id" },
            );
            failed++;
          }
        }),
      );
    }

    // Update email status to "sent" or "failed" and stamp sent_at.
    // Guard with status="sending" so a race condition can't overwrite a
    // manually-cancelled or already-completed record.
    const finalStatus = sent > 0 ? "sent" : "failed";
    await supabase
      .from("emails")
      .update({ status: finalStatus, sent_at: new Date().toISOString() })
      .eq("id", emailId)
      .eq("status", "sending");

    return new Response(
      JSON.stringify({ ok: true, sent, failed, total: recipients.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-email-broadcast]", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
