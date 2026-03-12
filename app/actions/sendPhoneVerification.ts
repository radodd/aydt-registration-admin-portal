"use server";

import { createClient } from "@/utils/supabase/server";
import twilio from "twilio";

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error("Invalid phone number");
}

/**
 * Initiate a Twilio Verify phone verification.
 * Normalizes the number to E.164 and optimistically stores it on the user row.
 * sms_verified stays false until confirmPhoneVerification succeeds.
 */
export async function sendPhoneVerification(
  rawPhone: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  let phone: string;
  try {
    phone = toE164(rawPhone);
  } catch {
    return { error: "Please enter a valid 10-digit US phone number." };
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verifications.create({ to: phone, channel: "sms" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sendPhoneVerification]", msg);
    return { error: `Twilio error: ${msg}` };
  }

  // Store normalized phone optimistically (not yet verified)
  await supabase.from("users").update({ phone_number: phone }).eq("id", user.id);

  return {};
}
