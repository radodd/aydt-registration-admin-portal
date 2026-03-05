import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

/* -------------------------------------------------------------------------- */
/* Main handler                                                               */
/* -------------------------------------------------------------------------- */

Deno.serve(async (_req) => {
  try {
    const now = new Date().toISOString();

    /* ------------------------------------------------------------------ */
    /* STEP 1 — Expire seat holds (pending registrations past hold_expires_at) */
    /* ------------------------------------------------------------------ */

    const { data: expiredHolds } = await supabase
      .from("registrations")
      .select("id, session_id, dancer_id")
      .eq("status", "pending_payment")
      .lt("hold_expires_at", now)
      .not("hold_expires_at", "is", null);

    if (expiredHolds && expiredHolds.length > 0) {
      const expiredIds = expiredHolds.map((r) => r.id);
      await supabase.from("registrations").delete().in("id", expiredIds);
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
      .select("session_id")
      .eq("status", "waiting");

    if (!waitingEntries || waitingEntries.length === 0) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const sessionIds = [...new Set(waitingEntries.map((e) => e.session_id))];

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
    .from("class_sessions")
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
    .eq("session_id", sessionId)
    .eq("status", "invited");

  if ((invitedCount ?? 0) > 0) return;

  // 4. Check available capacity
  const { count: activeRegistrations } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .not("status", "in", '("declined","cancelled")');

  const capacity = session.capacity ?? 0;
  if (capacity > 0 && (activeRegistrations ?? 0) >= capacity) return;

  // 5. Find the next waiting entry
  const { data: nextEntry } = await supabase
    .from("waitlist_entries")
    .select("id, dancer_id, invite_token, dancers ( first_name, last_name, users ( first_name, last_name, email ) )")
    .eq("session_id", sessionId)
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

  const html = replaceTokens(emailConfig.htmlBody, tokens);
  const subject = emailConfig.subject
    ? replaceTokens(emailConfig.subject, tokens)
    : `A spot opened up in ${session.title}`;

  const fromName = emailConfig.fromName || "AYDT Registration";
  const fromEmail =
    emailConfig.fromEmail ||
    Deno.env.get("RESEND_FROM_EMAIL") ||
    "noreply@aydt.com";

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
  }
}
