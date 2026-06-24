import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/* -------------------------------------------------------------------------- */
/* Twilio SMS helper (inline — Deno can't import from @/ paths)               */
/* -------------------------------------------------------------------------- */

async function sendSmsViaApi(
  toPhone: string,
  message: string,
  userId: string,
): Promise<void> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !fromPhone || !toPhone) return;

  const body = ("AYDT: " + message).slice(0, 160);
  let twilioSid: string | undefined;
  let errorMessage: string | undefined;
  let status = "failed";

  try {
    const credentials = btoa(`${accountSid}:${authToken}`);
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toPhone,
          From: fromPhone,
          Body: body,
        }).toString(),
      },
    );
    if (res.ok) {
      const data = await res.json();
      twilioSid = data.sid;
      status = "sent";
    } else {
      errorMessage = await res.text();
    }
  } catch (err) {
    errorMessage = String(err);
  }

  try {
    await supabase.from("sms_notifications").insert({
      user_id: userId,
      to_phone: toPhone,
      body,
      status,
      twilio_sid: twilioSid ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (_) {
    // logging failure must never break the primary flow
  }
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const siteUrl = Deno.env.get("SITE_URL") ?? "https://aydt.com";

/* -------------------------------------------------------------------------- */
/* Token replacement                                                          */
/* -------------------------------------------------------------------------- */

function replaceTokens(html: string, tokens: Record<string, string>): string {
  let result = html;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replaceAll(token, value);
  }
  return result;
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
  const LOGO_URL = `${SITE_URL || "https://register.aydt.nyc"}/brand/logo-primary-blush-cherry.png`;
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
      <a href="${SITE_URL || "https://register.aydt.nyc"}" style="color:#F4DDD9;text-decoration:none;">Visit Website</a>
      &nbsp;|&nbsp;
      <a href="${SITE_URL || "https://register.aydt.nyc"}/contact" style="color:#F4DDD9;text-decoration:none;">Contact Us</a>
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

/* -------------------------------------------------------------------------- */
/* Main handler                                                               */
/* -------------------------------------------------------------------------- */

Deno.serve(async (_req) => {
  try {
    // Meeting-plan #5: the waitlist is now a MANUAL model — admins invite
    // explicitly and the system never auto-invites. This legacy auto-invite cron
    // is disabled by default. Set WAITLIST_AUTO_INVITE_ENABLED="true" only to
    // temporarily restore the old automatic behavior. (Seat-hold expiry is also
    // handled by the separate expire-registration-holds cron.)
    if (Deno.env.get("WAITLIST_AUTO_INVITE_ENABLED") !== "true") {
      return new Response(
        JSON.stringify({
          disabled: true,
          reason: "manual waitlist model (meeting-plan #5)",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();

    /* ------------------------------------------------------------------ */
    /* STEP 1 — Expire seat holds (pending registrations past hold_expires_at) */
    /* ------------------------------------------------------------------ */

    const { data: expiredHolds } = await supabase
      .from("meeting_enrollments")
      .select("id, meeting_id, dancer_id")
      .eq("status", "pending_payment")
      .lt("hold_expires_at", now)
      .not("hold_expires_at", "is", null);

    if (expiredHolds && expiredHolds.length > 0) {
      const expiredIds = expiredHolds.map((r) => r.id);
      await supabase.from("meeting_enrollments").delete().in("id", expiredIds);
    }

    /* ------------------------------------------------------------------ */
    /* STEP 2 — Expire stale invites                                       */
    /* ------------------------------------------------------------------ */

    await supabase
      .from("waitlist_entries")
      .update({ status: "expired" })
      .eq("status", "invited")
      .lt("invitation_expires_at", now);

    /* ------------------------------------------------------------------ */
    /* STEP 3 — Send next invites for sessions with open capacity          */
    /* ------------------------------------------------------------------ */

    // Get all sessions that have at least one 'waiting' waitlist entry
    const { data: waitingEntries } = await supabase
      .from("waitlist_entries")
      .select("meeting_id")
      .eq("status", "waiting");

    if (!waitingEntries || waitingEntries.length === 0) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const sessionIds = [...new Set(waitingEntries.map((e) => e.meeting_id))];

    for (const sessionId of sessionIds) {
      await processSession(sessionId, now);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("process-waitlist error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

/* -------------------------------------------------------------------------- */
/* Per-session invite logic                                                   */
/* -------------------------------------------------------------------------- */

async function processSession(sessionId: string, now: string) {
  // 1. Fetch class_session + class name + semester waitlist settings (Phase 1)
  const { data: session } = await supabase
    .from("class_meetings")
    .select(
      `
      id, capacity, registration_close_at, semester_id,
      classes ( name ),
      semesters ( waitlist_settings )
    `,
    )
    .eq("id", sessionId)
    .single();

  if (!session) return;

  const semesterSettings = Array.isArray(session.semesters)
    ? session.semesters[0]
    : session.semesters;

  const waitlistSettings = semesterSettings?.waitlist_settings as {
    enabled?: boolean;
    sessionSettings?: Record<string, { enabled: boolean }>;
    inviteExpiryHours?: number;
    stopDaysBeforeClose?: number;
    invitationEmail?: {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      htmlBody?: string;
    };
  } | null;

  // Bail if waitlist disabled at semester level or session level
  if (!waitlistSettings?.enabled) return;

  const sessionEnabled =
    waitlistSettings.sessionSettings?.[sessionId]?.enabled ?? true;
  if (!sessionEnabled) return;

  // 2. Check registration close window
  const stopDays = waitlistSettings.stopDaysBeforeClose ?? 3;
  if (session.registration_close_at) {
    const closeDate = new Date(session.registration_close_at);
    const stopDate = new Date(closeDate.getTime() - stopDays * 24 * 60 * 60 * 1000);
    if (new Date(now) >= stopDate) return;
  }

  // 3. Check there's no active invited entry (one at a time rule)
  const { count: invitedCount } = await supabase
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", sessionId)
    .eq("status", "invited");

  if ((invitedCount ?? 0) > 0) return;

  // 4. Check available capacity
  const { count: activeRegistrations } = await supabase
    .from("meeting_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", sessionId)
    .not("status", "in", '("declined","cancelled")');

  const capacity = session.capacity ?? 0;
  if (capacity > 0 && (activeRegistrations ?? 0) >= capacity) return;

  // 5. Find the next waiting entry
  const { data: nextEntry } = await supabase
    .from("waitlist_entries")
    .select("id, dancer_id, invite_token, dancers ( first_name, last_name, users ( id, first_name, last_name, email, phone_number, sms_opt_in, sms_verified ) )")
    .eq("meeting_id", sessionId)
    .eq("status", "waiting")
    .order("position", { ascending: true })
    .limit(1)
    .single();

  if (!nextEntry) return;

  // 6. Set invitation fields
  const expiryHours = waitlistSettings.inviteExpiryHours ?? 48;
  const expiresAt = new Date(
    Date.now() + expiryHours * 60 * 60 * 1000,
  ).toISOString();

  await supabase
    .from("waitlist_entries")
    .update({
      status: "invited",
      invitation_sent_at: now,
      invitation_expires_at: expiresAt,
    })
    .eq("id", nextEntry.id);

  // 7. Send invitation email
  const emailConfig = waitlistSettings.invitationEmail;
  if (!emailConfig?.htmlBody) return;

  const dancer = Array.isArray(nextEntry.dancers)
    ? nextEntry.dancers[0]
    : nextEntry.dancers;

  const parentUser = dancer?.users
    ? Array.isArray(dancer.users)
      ? dancer.users[0]
      : dancer.users
    : null;

  const participantName = dancer
    ? `${dancer.first_name} ${dancer.last_name}`
    : "Participant";

  const parentName = parentUser
    ? `${parentUser.first_name} ${parentUser.last_name}`
    : participantName;

  const recipientEmail = parentUser?.email ?? "";
  if (!recipientEmail) return;

  const holdUntilDate = new Date(Date.now() + 30 * 60 * 1000);
  const holdUntilStr = holdUntilDate.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const acceptLink = `${siteUrl}/waitlist/accept/${nextEntry.invite_token}`;

  const tokens: Record<string, string> = {
    "{{participant_name}}": participantName,
    "{{parent_name}}": parentName,
    "{{session_name}}": session.title,
    "{{hold_until_datetime}}": holdUntilStr,
    "{{timezone}}": "Eastern Time",
    "{{accept_link}}": acceptLink,
  };

  const html = prepareEmailHtml(replaceTokens(emailConfig.htmlBody, tokens));
  const subject = emailConfig.subject
    ? replaceTokens(emailConfig.subject, tokens)
    : `A spot opened up in ${session.title}`;

  const fromName = emailConfig.fromName || "AYDT Registration";
  const fromEmail =
    emailConfig.fromEmail ||
    Deno.env.get("RESEND_FROM_EMAIL") ||
    "admin@aydt.nyc";

  try {
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error(`Failed to send waitlist invite for entry ${nextEntry.id}:`, err);
    // Roll back invite status so it retries next cron cycle
    await supabase
      .from("waitlist_entries")
      .update({
        status: "waiting",
        invitation_sent_at: null,
        invitation_expires_at: null,
      })
      .eq("id", nextEntry.id);
    return;
  }

  // SMS notification — best-effort, does not affect the invite record
  if (
    (parentUser as any)?.sms_opt_in &&
    (parentUser as any)?.sms_verified &&
    (parentUser as any)?.phone_number
  ) {
    const className = Array.isArray(session.classes)
      ? (session.classes[0] as any)?.name
      : (session.classes as any)?.name ?? "your class";
    const smsMsg = `A spot opened in ${className}. Accept by ${holdUntilStr}: ${acceptLink}`;
    await sendSmsViaApi(
      (parentUser as any).phone_number,
      smsMsg,
      (parentUser as any).id ?? "",
    );
  }
}
