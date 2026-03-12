"use server";

import { createClient } from "@/utils/supabase/server";
import twilio from "twilio";

/**
 * Verify the 6-digit code sent by Twilio Verify.
 * On success, sets sms_opt_in=true and sms_verified=true on the user row.
 */
export async function confirmPhoneVerification(
  phone: string,
  code: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: phone, code });

    if (check.status !== "approved") {
      return { error: "Incorrect code. Please try again." };
    }
  } catch {
    return { error: "Verification failed. The code may have expired." };
  }

  const { error } = await supabase
    .from("users")
    .update({ sms_opt_in: true, sms_verified: true })
    .eq("id", user.id);

  if (error) return { error: "Could not save verification status." };
  return {};
}
