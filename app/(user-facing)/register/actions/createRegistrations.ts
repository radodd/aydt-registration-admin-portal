"use server";

import { createClient } from "@/utils/supabase/server";

export interface CreateRegistrationsInput {
  semesterId: string;
  participants: Array<{ sessionId: string; dancerId: string }>;
  batchId: string; // Client-generated UUID — idempotency key
}

export interface CreateRegistrationsResult {
  success: boolean;
  registrationIds: string[];
  error?: string;
}

/**
 * Creates one registration record per (dancerId, sessionId) pair.
 *
 * Idempotency: if a registration with the given batchId already exists,
 * the existing IDs are returned without re-inserting. This makes it safe
 * to call on network retry or accidental double-submit.
 *
 * NOTE: requires `batch_id` column on `registrations` table.
 * Run the following SQL in Supabase before using this action:
 *
 *   ALTER TABLE registrations ADD COLUMN IF NOT EXISTS batch_id UUID;
 *   CREATE UNIQUE INDEX IF NOT EXISTS registrations_batch_id_idx
 *     ON registrations(batch_id) WHERE batch_id IS NOT NULL;
 */
export async function createRegistrations(
  input: CreateRegistrationsInput,
): Promise<CreateRegistrationsResult> {
  const supabase = await createClient();

  // 1. Verify the caller is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      registrationIds: [],
      error: "You must be signed in to register.",
    };
  }

  // 2. Idempotency check — return existing IDs if this batch was already submitted
  const { data: existing } = await supabase
    .from("registrations")
    .select("id")
    .eq("batch_id", input.batchId);

  if (existing && existing.length > 0) {
    return {
      success: true,
      registrationIds: existing.map((r) => r.id as string),
    };
  }

  // 3. Validate that all sessionIds belong to the given semester
  const sessionIds = input.participants.map((p) => p.sessionId);
  const { data: sessions, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .in("id", sessionIds)
    .eq("semester_id", input.semesterId);

  if (sessionError || !sessions || sessions.length !== sessionIds.length) {
    return {
      success: false,
      registrationIds: [],
      error: "One or more sessions are invalid or do not belong to this semester.",
    };
  }

  // 4. Insert one registration per participant
  // Status is "confirmed" for the payment placeholder — update to "pending"
  // when Converge is integrated (pending → confirmed on webhook).
  const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const rows = input.participants.map((p) => ({
    dancer_id: p.dancerId,
    session_id: p.sessionId,
    status: "confirmed",
    total_amount: 0, // Will be set to actual amount when payment is integrated
    hold_expires_at: holdExpiresAt,
    batch_id: input.batchId,
  }));

  const { data: created, error: insertError } = await supabase
    .from("registrations")
    .insert(rows)
    .select("id");

  if (insertError) {
    return {
      success: false,
      registrationIds: [],
      error: insertError.message,
    };
  }

  return {
    success: true,
    registrationIds: (created ?? []).map((r) => r.id as string),
  };
}
