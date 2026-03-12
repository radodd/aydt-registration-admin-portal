import "server-only";
import twilio from "twilio";
import { createClient } from "@/utils/supabase/server";

const AYDT_PREFIX = "AYDT: ";
const MAX_BODY = 160;

/**
 * Send an SMS to a phone number and log the attempt to sms_notifications.
 * SMS is always best-effort — this function never throws.
 *
 * @param toPhone  E.164 phone number (e.g. "+12125551234")
 * @param message  Message body WITHOUT the "AYDT: " prefix (it is added automatically)
 * @param userId   Optional user ID for logging
 */
/** Normalize any US phone number to E.164 (+1XXXXXXXXXX). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone; // already E.164 or non-US — pass through as-is
}

export async function sendSms(
  toPhone: string,
  message: string,
  userId?: string
): Promise<void> {
  const normalizedPhone = toE164(toPhone);
  const body = (AYDT_PREFIX + message).slice(0, MAX_BODY);

  let twilioSid: string | undefined;
  let errorMessage: string | undefined;
  let status = "failed";

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    const result = await client.messages.create({
      to: normalizedPhone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body,
    });
    twilioSid = result.sid;
    status = "sent";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[sendSms] failed to send to", normalizedPhone, errorMessage);
    // Never rethrow — SMS is best-effort alongside email
  }

  // Log every attempt to sms_notifications regardless of outcome
  try {
    const supabase = await createClient();
    await supabase.from("sms_notifications").insert({
      user_id: userId ?? null,
      to_phone: normalizedPhone,
      body,
      status,
      twilio_sid: twilioSid ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (logErr) {
    console.error("[sendSms] failed to log notification:", logErr);
  }
}
