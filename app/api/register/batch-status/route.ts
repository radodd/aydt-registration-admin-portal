import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/register/batch-status?id={batchId}
 *
 * Polled by the confirmation page to detect when a payment webhook has
 * confirmed the registration batch. Only returns the status — never
 * payment details — so it's safe to call from a client component.
 *
 * Auth: requires the user to own the batch (parent_id matches auth user).
 * Returns 404 if the batch doesn't belong to the current user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const batchId = request.nextUrl.searchParams.get("id");
  if (!batchId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: batch } = await supabase
    .from("registration_batches")
    .select("id, status, parent_id")
    .eq("id", batchId)
    .eq("parent_id", user.id) // ownership guard — users can only poll their own batches
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: batch.status });
}
