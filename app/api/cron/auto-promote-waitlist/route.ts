import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendWaitlistOfferEmail, formatExpiryWindow } from "@/utils/email/waitlistOfferEmail";

export const runtime = "nodejs";

/**
 * Zero-touch waitlist auto-promotion engine (cron).
 *
 * Scope (2026-06-10 decision): AUTO only for seats freed by a CART-HOLD lapsing
 * mid-registration. Refund-/capacity-freed seats are admin-assigned (Stage A).
 *
 * Each run:
 *  PHASE 1 — resolve lapsed offers (roll-to-next): an "offered" entry past its
 *    claim window is marked expired, then the SAME seat is offered to the next in
 *    line by REUSING (extending) its waitlist_offer placeholder so the seat stays
 *    held continuously. New prospect next → hold for admin. Queue empty → release
 *    the placeholder (reopen to public).
 *  PHASE 2 — newly freed cart-seats (an expired, unreleased `cart` hold): queue
 *    empty → reopen; front dancer → reserve a fresh placeholder + email the claim
 *    link; front is a new prospect → hold for admin (admin_reserved) + flag.
 *
 * The capacity trigger is the arbiter — a reserve that RAISEs "at capacity" means
 * the seat was re-taken, so we skip. Secured by CRON_SECRET (Vercel Cron sends it
 * as Authorization: Bearer <CRON_SECRET>). MVP: one freed seat per grain per run.
 */

const OFFER_WINDOW_HOURS = 24;
const FAR_FUTURE = () => new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();

type Sb = ReturnType<typeof createAdminClient>;

interface EventInput {
  event_type: string;
  severity: "info" | "warn" | "error";
  message: string;
  waitlist_entry_id?: string | null;
  class_id?: string | null;
  section_id?: string | null;
  meeting_id?: string | null;
  semester_id?: string | null;
  detail?: Record<string, unknown>;
}
async function logEvent(sb: Sb, e: EventInput): Promise<void> {
  await sb.from("waitlist_promotion_events").insert({ detail: {}, ...e }).then(() => {}, () => {});
}

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // safe default: refuse if unconfigured
  const h = req.headers.get("authorization") ?? req.headers.get("x-cron-secret") ?? "";
  return h === `Bearer ${secret}` || h === secret;
}

type Grain = { col: "section_id" | "meeting_id"; val: string };
function grainOf(row: { section_id?: string | null; meeting_id?: string | null }): Grain | null {
  if (row.section_id) return { col: "section_id", val: row.section_id };
  if (row.meeting_id) return { col: "meeting_id", val: row.meeting_id };
  return null;
}

interface QueueEntry {
  id: string;
  class_id: string | null;
  section_id: string | null;
  meeting_id: string | null;
  dancer_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  invite_token: string;
  offer_attempts: number | null;
  classes?: any;
}
const QUEUE_SELECT =
  "id, class_id, section_id, meeting_id, dancer_id, contact_name, contact_email, invite_token, offer_attempts, classes ( name, semester_id, semesters ( name ) )";

function classBits(entry: QueueEntry, fallbackSemesterId: string | null) {
  const cls = Array.isArray(entry.classes) ? entry.classes[0] : entry.classes;
  const sem = Array.isArray(cls?.semesters) ? cls?.semesters[0] : cls?.semesters;
  return {
    className: cls?.name ?? "your class",
    semesterName: sem?.name ?? "",
    semesterId: (cls?.semester_id as string | null) ?? fallbackSemesterId,
  };
}

/**
 * Offer the seat to `entry`: reserve (insert a fresh waitlist_offer placeholder)
 * or re-use (extend) an existing one so the seat stays held, mark the entry
 * offered, log, and email the claim link. Returns ok:false (at_capacity) when a
 * fresh reserve loses the seat — the caller then skips.
 */
async function offerToEntry(
  sb: Sb,
  entry: QueueEntry,
  opts: { grain: Grain; semesterId: string | null; now: Date; siteUrl: string; reusePlaceholderId?: string },
): Promise<{ ok: boolean; atCapacity?: boolean }> {
  const offerExpiresAt = new Date(opts.now.getTime() + OFFER_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { className, semesterName, semesterId } = classBits(entry, opts.semesterId);

  if (opts.reusePlaceholderId) {
    const { error } = await sb
      .from("seat_holds")
      .update({ hold_type: "waitlist_offer", released_at: null, expires_at: offerExpiresAt })
      .eq("id", opts.reusePlaceholderId);
    if (error) return { ok: false, atCapacity: /at capacity/i.test(error.message) };
  } else {
    const { error } = await sb.from("seat_holds").insert({
      [opts.grain.col]: opts.grain.val,
      user_id: null,
      hold_type: "waitlist_offer",
      semester_id: semesterId,
      class_id: entry.class_id,
      expires_at: offerExpiresAt,
    });
    if (error) return { ok: false, atCapacity: /at capacity/i.test(error.message) };
  }

  await sb
    .from("waitlist_entries")
    .update({
      status: "offered",
      invitation_sent_at: opts.now.toISOString(),
      invitation_expires_at: offerExpiresAt,
      offer_attempts: (entry.offer_attempts ?? 0) + 1,
    })
    .eq("id", entry.id);
  await logEvent(sb, {
    event_type: "offer_created", severity: "info", waitlist_entry_id: entry.id,
    class_id: entry.class_id, section_id: entry.section_id, meeting_id: entry.meeting_id,
    semester_id: semesterId, message: `Auto-offered a freed seat in ${className} to the front of the queue.`,
  });

  if (!entry.contact_email) {
    await logEvent(sb, {
      event_type: "error", severity: "error", waitlist_entry_id: entry.id, class_id: entry.class_id,
      semester_id: semesterId, message: "Offer reserved but the entry has no contact email — admin follow-up needed.",
    });
  } else {
    const claimLink = `${opts.siteUrl}/waitlist/accept/${entry.invite_token}`;
    const res = await sendWaitlistOfferEmail({
      toEmail: entry.contact_email, contactName: entry.contact_name, className, semesterName,
      claimLink, expiryWindowLabel: formatExpiryWindow(OFFER_WINDOW_HOURS),
    });
    await logEvent(sb, res.ok
      ? { event_type: "offer_sent", severity: "info", waitlist_entry_id: entry.id, class_id: entry.class_id, semester_id: semesterId, message: "Claim email sent." }
      : { event_type: "error", severity: "error", waitlist_entry_id: entry.id, class_id: entry.class_id, semester_id: semesterId, message: `Offer reserved but the claim email failed to send: ${res.error}` });
  }
  return { ok: true };
}

/** Front of the queue (oldest waiting) is a new prospect with no dancer → hold
 *  the seat for the admin (admin_reserved) and flag it for manual assignment. */
async function flagManualNewProspect(
  sb: Sb,
  entry: QueueEntry,
  opts: { grain: Grain; semesterId: string | null; reusePlaceholderId?: string },
): Promise<void> {
  if (opts.reusePlaceholderId) {
    await sb
      .from("seat_holds")
      .update({ hold_type: "admin_reserved", released_at: null, expires_at: FAR_FUTURE() })
      .eq("id", opts.reusePlaceholderId);
  } else {
    const { error } = await sb.from("seat_holds").insert({
      [opts.grain.col]: opts.grain.val, user_id: null, hold_type: "admin_reserved",
      semester_id: opts.semesterId, class_id: entry.class_id, expires_at: FAR_FUTURE(),
    });
    if (error && !/at capacity/i.test(error.message)) throw error;
  }
  await sb
    .from("waitlist_entries")
    .update({ needs_manual_assignment: true, manual_assignment_reason: "new_prospect" })
    .eq("id", entry.id);
  await logEvent(sb, {
    event_type: "manual_fallback_flagged", severity: "warn", waitlist_entry_id: entry.id,
    class_id: entry.class_id, section_id: entry.section_id, meeting_id: entry.meeting_id,
    semester_id: opts.semesterId,
    message: "Front of queue is a new prospect (no dancer yet) — held for admin assignment.",
  });
}

async function frontOfQueue(sb: Sb, classId: string): Promise<QueueEntry | null> {
  const { data } = await sb
    .from("waitlist_entries")
    .select(QUEUE_SELECT)
    .eq("class_id", classId)
    .eq("status", "waiting")
    .order("signed_up_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as QueueEntry | null) ?? null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const summary = { rolled: 0, reopened: 0, offered: 0, manual: 0, skipped: 0, errors: 0 };

  /* ───────── PHASE 1 — resolve lapsed offers (roll-to-next) ───────── */
  const { data: lapsed } = await sb
    .from("waitlist_entries")
    .select("id, class_id, section_id, meeting_id, offer_attempts")
    .eq("status", "offered")
    .lte("invitation_expires_at", nowIso);

  for (const e of lapsed ?? []) {
    const grain = grainOf(e);
    const classId = e.class_id as string | null;
    try {
      await sb
        .from("waitlist_entries")
        .update({ status: "expired", offer_attempts: ((e.offer_attempts as number) ?? 0) + 1 })
        .eq("id", e.id);
      await logEvent(sb, {
        event_type: "offer_expired", severity: "info", waitlist_entry_id: e.id as string,
        class_id: classId, section_id: e.section_id as string | null, meeting_id: e.meeting_id as string | null,
        message: "Offer lapsed unclaimed.",
      });
      if (!grain || !classId) continue;

      // The placeholder for this seat (now expired but unreleased) — reuse it so
      // the seat never goes momentarily public during the roll.
      const { data: ph } = await sb
        .from("seat_holds")
        .select("id, semester_id")
        .eq("hold_type", "waitlist_offer")
        .is("released_at", null)
        .eq(grain.col, grain.val)
        .limit(1)
        .maybeSingle();
      const placeholderId = (ph as { id: string } | null)?.id;
      const semesterId = (ph as { semester_id: string | null } | null)?.semester_id ?? null;

      const next = await frontOfQueue(sb, classId);
      if (next && next.dancer_id) {
        const r = await offerToEntry(sb, next, { grain, semesterId, now, siteUrl, reusePlaceholderId: placeholderId });
        if (r.ok) {
          await logEvent(sb, { event_type: "rolled_to_next", severity: "info", waitlist_entry_id: next.id, class_id: classId, section_id: next.section_id, meeting_id: next.meeting_id, semester_id: semesterId, message: "Rolled the offer to the next person in line." });
          summary.rolled++;
        } else if (r.atCapacity) {
          if (placeholderId) await sb.from("seat_holds").update({ released_at: nowIso }).eq("id", placeholderId);
          summary.skipped++;
        }
      } else if (next && !next.dancer_id) {
        await flagManualNewProspect(sb, next, { grain, semesterId, reusePlaceholderId: placeholderId });
        summary.manual++;
      } else {
        if (placeholderId) await sb.from("seat_holds").update({ released_at: nowIso }).eq("id", placeholderId);
        await logEvent(sb, { event_type: "queue_emptied", severity: "info", class_id: classId, section_id: e.section_id as string | null, meeting_id: e.meeting_id as string | null, semester_id: semesterId, message: "No one left on the waitlist — seat reopened to the public." });
        summary.reopened++;
      }
    } catch (err) {
      summary.errors++;
      await logEvent(sb, { event_type: "error", severity: "error", waitlist_entry_id: e.id as string, class_id: classId, message: "Failed to resolve a lapsed offer.", detail: { error: err instanceof Error ? err.message : String(err) } });
    }
  }

  /* ───────── PHASE 2 — newly freed cart-seats ───────── */
  const { data: abandoned } = await sb
    .from("seat_holds")
    .select("id, section_id, meeting_id, class_id, semester_id")
    .eq("hold_type", "cart")
    .is("released_at", null)
    .lte("expires_at", nowIso);

  const seen = new Set<string>();
  for (const h of abandoned ?? []) {
    const grain = grainOf(h);
    const classId = h.class_id as string | null;
    const semesterId = h.semester_id as string | null;
    if (!grain || !classId) continue;
    const key = `${grain.col}:${grain.val}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      // Skip if an active offer already covers this seat.
      const { count: activeOffers } = await sb
        .from("seat_holds")
        .select("id", { count: "exact", head: true })
        .eq("hold_type", "waitlist_offer")
        .is("released_at", null)
        .gt("expires_at", nowIso)
        .eq(grain.col, grain.val);
      if ((activeOffers ?? 0) > 0) { summary.skipped++; continue; }

      const front = await frontOfQueue(sb, classId);
      if (!front) {
        await sb.from("seat_holds").update({ released_at: nowIso }).eq("id", h.id);
        await logEvent(sb, { event_type: "reopened_to_public", severity: "info", class_id: classId, section_id: h.section_id as string | null, meeting_id: h.meeting_id as string | null, semester_id: semesterId, message: "Abandoned seat reopened to the public — no one waiting." });
        summary.reopened++;
        continue;
      }

      if (!front.dancer_id) {
        await flagManualNewProspect(sb, front, { grain, semesterId });
        await sb.from("seat_holds").update({ released_at: nowIso }).eq("id", h.id);
        summary.manual++;
        continue;
      }

      const r = await offerToEntry(sb, front, { grain, semesterId, now, siteUrl });
      if (!r.ok) {
        if (r.atCapacity) { await sb.from("seat_holds").update({ released_at: nowIso }).eq("id", h.id); summary.skipped++; continue; }
        throw new Error("offer failed");
      }
      // We hold the seat now (fresh placeholder) → release the abandoned cart hold.
      await sb.from("seat_holds").update({ released_at: nowIso }).eq("id", h.id);
      summary.offered++;
    } catch (err) {
      summary.errors++;
      await logEvent(sb, { event_type: "error", severity: "error", class_id: classId, section_id: h.section_id as string | null, meeting_id: h.meeting_id as string | null, semester_id: semesterId, message: "Auto-promotion failed for a freed seat.", detail: { error: err instanceof Error ? err.message : String(err) } });
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
