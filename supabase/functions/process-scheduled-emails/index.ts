import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const BATCH_SIZE = 100;

// Top-level helpers — must be outside Deno.serve so they can
// be called safely from any scope inside the handler.
function resolveVariables(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function prepareEmailHtml(html: string): string {
  const processed = html.replace(/<img([^>]*?)>/gi, (_match: string, attrs: string) => {
    if (/\bwidth=/i.test(attrs)) return _match;
    const isBanner =
      /data-layout="banner"/i.test(attrs) || !/data-layout=/i.test(attrs);
    return `<img${attrs} width="${isBanner ? 600 : 400}">`;
  });
  // Keep this layout byte-identical to wrapEmailLayout() in
  // utils/prepareEmailHtml.ts — edge functions can't import it.
  const LOGO_URL = `${SITE_URL || "https://aydt.nyc"}/brand/logo-primary-blush-cherry.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AYDT Email</title>
</head>
<body style="margin:0;padding:0;background-color:#EFE7E3;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#EFE7E3" style="background-color:#EFE7E3;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">

   <!-- HEADER — cream background, centered brand lockup -->
<tr>
  <td align="center" bgcolor="#FFFBF9" style="background-color:#FFFBF9;padding:28px 24px 24px;">
    <img
      src="${LOGO_URL}"
      width="260"
      alt="American Youth Dance Theater"
      style="display:block;width:260px;max-width:72%;height:auto;border:0;margin:0 auto;">
  </td>
</tr>

   <!-- CHERRY RULE -->
<tr>
  <td bgcolor="#691F19" style="height:3px;line-height:3px;font-size:0;background-color:#691F19;">&nbsp;</td>
</tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:36px 40px 40px;color:#1F1513;font-size:16px;line-height:1.65;font-family:Arial,Helvetica,sans-serif;">
            ${processed}
          </td>
        </tr>

        <!-- WINE FOOTER -->
<tr>
  <td bgcolor="#691F19" style="background-color:#691F19;padding:28px;color:#F4DDD9;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>

        <!-- LOCATION 1 -->
        <td style="vertical-align:top;width:50%;padding-right:12px;color:#E3BFBA;">
          <strong style="font-size:14px;color:#ffffff;">Upper East Side</strong><br>
          428 E 75th Street<br>
          New York, NY 10021<br><br>

          O: (212) 717-5419<br>
          F: (866) 679-8943<br><br>

          Mon – Fri 9:00 am – 8:30 pm<br>
          Sat 9:00 am – 3:00 pm
        </td>

        <!-- LOCATION 2 -->
        <td style="vertical-align:top;width:50%;padding-left:12px;color:#E3BFBA;">
          <strong style="font-size:14px;color:#ffffff;">Washington Heights</strong><br>
          4140 Broadway, Fl 2 @ NoMAA<br>
          New York, NY 10033<br><br>

          O: (212) 717-5419<br>
          Español: (646) 586-8661<br><br>

          Tues 3:00 pm – 5:45 pm<br>
          Sat 10:00 am – 1:00 pm
        </td>

      </tr>
    </table>

    <!-- FOOTER LINKS -->
    <div style="margin-top:22px;text-align:center;">
      <a href="${SITE_URL || "https://aydt.nyc"}" style="color:#F4DDD9;text-decoration:none;">Visit Website</a>
      &nbsp;|&nbsp;
      <a href="${SITE_URL || "https://aydt.nyc"}/contact" style="color:#F4DDD9;text-decoration:none;">Contact Us</a>
    </div>

  </td>
</tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

Deno.serve(async () => {
  try {
    const now = new Date().toISOString();

    // Atomically claim all scheduled emails whose send time has passed.
    // Transition to "sending" — second cron run won't reclaim these.
    const { data: claimed, error: claimErr } = await supabase
      .from("emails")
      .update({ status: "sending" })
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .is("deleted_at", null)
      .select("id");

    if (claimErr) {
      console.error("[process-scheduled-emails] claim error:", claimErr.message);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
      });
    }

    const emailIds: string[] = (claimed ?? []).map((r: { id: string }) => r.id);

    if (emailIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(
      `[process-scheduled-emails] processing ${emailIds.length} email(s) inline`,
    );

    const results = [];

    for (const emailId of emailIds) {
      // Fetch full email record
      const { data: email, error: emailErr } = await supabase
        .from("emails")
        .select("*")
        .eq("id", emailId)
        .single();

      if (emailErr || !email) {
        console.error(`[process-scheduled-emails] email ${emailId} not found`);
        results.push({ emailId, error: "Email not found" });
        continue;
      }

      // Fetch admin signature if configured
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

      // Fetch frozen recipient snapshot
      const { data: recipients, error: recErr } = await supabase
        .from("email_recipients")
        .select("user_id, email_address, first_name, last_name")
        .eq("email_id", emailId);

      if (recErr || !recipients) {
        await supabase
          .from("emails")
          .update({ status: "failed", sent_at: new Date().toISOString() })
          .eq("id", emailId)
          .eq("status", "sending");
        results.push({ emailId, error: "Recipients not found" });
        continue;
      }

      let sent = 0;
      let failed = 0;

      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(
          batch.map(async (recipient) => {
            // Both `email` and `recipient` are in scope here — resolve per-recipient.
            const vars: Record<string, string> = {
              parent_name: recipient.first_name ?? "",
              student_name: "",
              semester_name: "",
              session_name: "",
            };

            // Footer must be built per recipient (needs recipient.user_id).
            const unsubscribeFooter = SITE_URL
              ? `<p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;"><a href="${SITE_URL}/unsubscribe?uid=${recipient.user_id}" style="color:#9ca3af;">Unsubscribe</a></p>`
              : "";

            const personalizedHtml = prepareEmailHtml(
              resolveVariables(email.body_html, vars) +
                signatureSuffix +
                unsubscribeFooter,
            );

            try {
              const { data: sentData, error: sendErr } =
                await resend.emails.send({
                  from: `${email.sender_name} <${email.sender_email}>`,
                  to: recipient.email_address,
                  subject: email.subject,
                  html: personalizedHtml,
                  ...(email.reply_to_email && {
                    replyTo: email.reply_to_email,
                  }),
                });

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

      // Stamp final status — guard with eq("status","sending") to prevent
      // overwriting a record that was manually cancelled mid-flight.
      const finalStatus = sent > 0 ? "sent" : "failed";
      await supabase
        .from("emails")
        .update({ status: finalStatus, sent_at: new Date().toISOString() })
        .eq("id", emailId)
        .eq("status", "sending");

      console.log(
        `[process-scheduled-emails] ${emailId} → ${finalStatus} (${sent} sent, ${failed} failed)`,
      );
      results.push({ emailId, sent, failed, total: recipients.length });
    }

    return new Response(
      JSON.stringify({ ok: true, processed: emailIds.length, results }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[process-scheduled-emails]", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
