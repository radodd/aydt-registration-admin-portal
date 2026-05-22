import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * GET /api/register/batch-status?id={batchId}
 *
 * Polled by the confirmation page to detect when a payment webhook has
 * confirmed the registration batch. Only returns the status enum — never
 * payment details — so it's safe to expose without user auth.
 *
 * Threat model: batch IDs are unguessable UUIDs; the response is a
 * single status enum. This matches the server-side render in
 * app/(user-facing)/register/confirmation/page.tsx which also reads the
 * batch row by ID alone (auth cookies are unreliable after the EPG
 * hosted-checkout redirect round-trip).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const batchId = request.nextUrl.searchParams.get("id");
  if (!batchId) {
    console.log("[batch-status] ⚠️ TEMP - missing id query param"); // TODO: DELETE
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Diagnostic: log whether the auth session survived the EPG redirect.
  // Does NOT gate the response — purely informational until the round-trip
  // session-loss issue is understood.
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  console.log(
    `[batch-status] ⚠️ TEMP - poll id=${batchId} authUser=${user?.id ?? "none"}`,
  ); // TODO: DELETE

  // Use admin client so the read bypasses RLS. The user-client SELECT returned
  // 404s when the EPG-redirect round-trip dropped the auth cookie — the row
  // existed but RLS denied the anonymous SELECT. UUID is the access token here.
  const supabase = createAdminClient();
  const { data: batch, error } = await supabase
    .from("registration_orders")
    .select("id, status, parent_id")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    console.log(
      `[batch-status] ⚠️ TEMP - query error id=${batchId} error=${error.message}`,
    ); // TODO: DELETE
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!batch) {
    console.log(`[batch-status] ⚠️ TEMP - batch not found id=${batchId}`); // TODO: DELETE
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.log(
    `[batch-status] ⚠️ TEMP - batch=${batchId} status=${batch.status} parent=${batch.parent_id} authUser=${user?.id ?? "none"} match=${user?.id === batch.parent_id}`,
  ); // TODO: DELETE
  return NextResponse.json({ status: batch.status });
}
