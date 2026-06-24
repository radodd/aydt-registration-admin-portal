import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

// Email-confirmation landing. Supabase's verify endpoint has already marked the
// address confirmed before redirecting here; the `code` is only good for
// establishing a session. Per product decision we do NOT keep the user signed
// in — we best-effort exchange + sign out (so a session is never persisted),
// then forward them to the login page to sign in manually.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/auth?message=email_confirmed";
  const safePath = next.startsWith("/") ? next : "/auth?message=email_confirmed";

  if (code) {
    const supabase = await createClient();
    // Best-effort: on a same-browser click this succeeds and we immediately
    // discard the session; on a cross-device click it may fail, but the email
    // is already confirmed by Supabase's verify step, so we still proceed.
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await supabase.auth.signOut();
      }
    } catch {
      // ignore — confirmation is already finalized server-side
    }
  }

  redirect(safePath);
}
