/**
 * Service-role DB helpers for e2e setup/teardown.
 *
 * Bypasses RLS — only used from test code, never from app code.
 *
 * Required env vars (read from .env.local via Playwright):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

// Playwright doesn't load .env.local automatically the way Next does.
config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

let _client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

/* -------------------------------------------------------------------------- */
/* Test-user lifecycle                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Create a confirmed instructor user with a known password — bypasses the
 * email invite flow. Use when the test isn't *about* the invite step.
 */
export async function createConfirmedInstructor(input: {
  email:     string;
  password:  string;
  firstName: string;
  lastName:  string;
}): Promise<{ id: string }> {
  const { data, error } = await db().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      role:       "instructor",
      first_name: input.firstName,
      last_name:  input.lastName,
    },
  });
  if (error) throw new Error(`createConfirmedInstructor: ${error.message}`);
  const id = data.user!.id;

  // The handle_new_user trigger may attach a throwaway family_id; clear it
  // and ensure status=active so the user lands on /instructor not /setup.
  const { data: row } = await db().from("users").select("family_id").eq("id", id).single();
  if (row?.family_id) await db().from("families").delete().eq("id", row.family_id as string);

  await db().from("users").upsert({
    id,
    email:      input.email,
    first_name: input.firstName,
    last_name:  input.lastName,
    role:       "instructor",
    status:     "active",
    family_id:  null,
  }, { onConflict: "id" });

  return { id };
}

/**
 * Generate an invite link without sending email. Used to drive the
 * /auth/confirm → /instructor/setup flow programmatically.
 */
export async function generateInviteLink(input: {
  email:     string;
  firstName: string;
  lastName:  string;
}): Promise<{ id: string; actionLink: string }> {
  const { data, error } = await db().auth.admin.generateLink({
    type:  "invite",
    email: input.email,
    options: {
      data: {
        role:       "instructor",
        first_name: input.firstName,
        last_name:  input.lastName,
      },
    },
  });
  if (error) throw new Error(`generateInviteLink: ${error.message}`);
  // Mark as invited so the admin list reflects pending state, mirroring
  // what createInstructor does in production.
  await db().from("users").update({ status: "invited" }).eq("id", data.user!.id);
  return { id: data.user!.id, actionLink: data.properties!.action_link };
}

/**
 * Delete an auth user and their public.users row. Safe to call multiple times.
 */
export async function deleteUser(idOrEmail: string): Promise<void> {
  let id = idOrEmail;
  if (idOrEmail.includes("@")) {
    const { data } = await db().auth.admin.listUsers({ perPage: 200 });
    const match = data?.users.find((u) => u.email === idOrEmail);
    if (!match) return;
    id = match.id;
  }
  await db().auth.admin.deleteUser(id).catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/* Class-assignment helpers                                                    */
/* -------------------------------------------------------------------------- */

export async function assignInstructorToSession(
  sessionId: string,
  userId:    string,
  isLead:    boolean,
): Promise<void> {
  const { error } = await db()
    .from("class_meeting_instructors")
    .upsert(
      { meeting_id: sessionId, user_id: userId, is_lead: isLead },
      { onConflict: "meeting_id,user_id" },
    );
  if (error) throw new Error(`assignInstructorToSession: ${error.message}`);
}

export async function unassignInstructorFromSession(
  sessionId: string,
  userId:    string,
): Promise<void> {
  await db()
    .from("class_meeting_instructors")
    .delete()
    .eq("meeting_id", sessionId)
    .eq("user_id", userId);
}

/* -------------------------------------------------------------------------- */
/* Lookup helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Pick any active session in the published Spring 2026 semester — useful as
 * an assignment target without hardcoding UUIDs.
 */
export async function findSampleSessionId(): Promise<string> {
  const { data: sem } = await db()
    .from("semesters")
    .select("id")
    .eq("status", "published")
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!sem) throw new Error("No published semester found — seed first.");

  const { data: cs } = await db()
    .from("class_meetings")
    .select("id")
    .eq("semester_id", sem.id)
    .limit(1)
    .single();
  if (!cs) throw new Error("No class_meetings in the published semester.");
  return cs.id as string;
}

export async function getUserStatus(userId: string): Promise<string | null> {
  const { data } = await db().from("users").select("status").eq("id", userId).single();
  return (data?.status as string) ?? null;
}
