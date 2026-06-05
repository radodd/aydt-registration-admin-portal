"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Meeting-plan #28: reserve-at-cart seat holds.
 *
 * `holdSeat` reserves one seat per booking grain the moment a class is added to
 * cart, returning the created hold IDs (stored on the cart item so `releaseSeat`
 * can free them on remove). Holds are owner-scoped by RLS (user_id = auth.uid()),
 * so the caller MUST be signed in — an anonymous add returns `needs_auth` and the
 * client routes to sign-in (per the 2026-06-05 product decision).
 *
 * Grain:
 *   - standard / tiered → one hold on the class_section (full-term seat)
 *   - drop-in           → one hold per selected class_meeting (per-date seat)
 *
 * All-or-nothing: if any seat is already gone (capacity trigger RAISEs), every
 * hold created in this call is rolled back and `at_capacity` is returned, so the
 * cart never ends up holding a partial set.
 */

const HOLD_TTL_MS = 20 * 60 * 1000; // mirrors CART_TTL_MS in CartProvider

export interface HoldSeatInput {
  semesterId: string;
  classId: string;
  mode: "standard" | "tiered" | "drop-in";
  /** Representative class_meeting id (the section is resolved from it for full-term). */
  sessionId: string;
  /** Drop-in: the class_meeting id per selected date. Falls back to [sessionId]. */
  selectedDateIds?: string[];
  /**
   * Cart-wide expiry (ISO). All holds in a cart share the same deadline — the
   * countdown runs from the FIRST add and is not reset per item. Clamped server-
   * side to at most now + 20m so a client can't extend its own hold.
   */
  cartExpiresAt?: string;
}

export type HoldSeatResult =
  | { ok: true; holdIds: string[] }
  | { ok: false; reason: "needs_auth" | "at_capacity" | "error"; message?: string };

function isCapacity(err: { message?: string } | null): boolean {
  return !!err?.message && /at capacity/i.test(err.message);
}

export async function holdSeat(input: HoldSeatInput): Promise<HoldSeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "needs_auth" };

  // Cart-wide expiry, clamped so a hold can never outlive 20 minutes from now.
  const maxExpiry = Date.now() + HOLD_TTL_MS;
  let expiresAt = new Date(maxExpiry).toISOString();
  if (input.cartExpiresAt) {
    const req = new Date(input.cartExpiresAt).getTime();
    if (!Number.isNaN(req)) expiresAt = new Date(Math.min(req, maxExpiry)).toISOString();
  }

  // Resolve the seats (grain) to reserve.
  const seats: Array<{ section_id?: string; meeting_id?: string }> = [];
  if (input.mode === "standard" || input.mode === "tiered") {
    const { data: meeting, error } = await supabase
      .from("class_meetings")
      .select("section_id")
      .eq("id", input.sessionId)
      .maybeSingle();
    if (error || !meeting?.section_id) {
      return { ok: false, reason: "error", message: "Could not resolve the class section." };
    }
    seats.push({ section_id: meeting.section_id as string });
  } else {
    const meetingIds = input.selectedDateIds?.length ? input.selectedDateIds : [input.sessionId];
    for (const m of meetingIds) seats.push({ meeting_id: m });
  }

  const createdIds: string[] = [];
  for (const seat of seats) {
    const { data, error } = await supabase
      .from("seat_holds")
      .insert({
        section_id: seat.section_id ?? null,
        meeting_id: seat.meeting_id ?? null,
        user_id: user.id,
        semester_id: input.semesterId,
        class_id: input.classId || null,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      // Roll back any seats already held in this call (all-or-nothing).
      if (createdIds.length) {
        await supabase.from("seat_holds").delete().in("id", createdIds);
      }
      if (isCapacity(error)) return { ok: false, reason: "at_capacity" };
      return { ok: false, reason: "error", message: error.message };
    }
    createdIds.push((data as { id: string }).id);
  }

  return { ok: true, holdIds: createdIds };
}

export async function releaseSeat(holdIds: string[]): Promise<{ ok: boolean }> {
  if (!holdIds?.length) return { ok: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  // RLS also constrains to the owner; the explicit user filter is defense-in-depth.
  await supabase.from("seat_holds").delete().in("id", holdIds).eq("user_id", user.id);
  return { ok: true };
}
