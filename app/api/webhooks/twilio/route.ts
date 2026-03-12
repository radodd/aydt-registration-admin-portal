import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { validateRequest } from "twilio";

// Twilio MessageStatus values we care about
const STATUS_MAP: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  undelivered: "undelivered",
  failed: "failed",
};

export async function POST(request: NextRequest) {
  // Twilio sends application/x-www-form-urlencoded — read as text first
  const body = await request.text();
  const params = Object.fromEntries(new URLSearchParams(body));

  const authToken = process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  if (authToken) {
    const signature = request.headers.get("x-twilio-signature") ?? "";
    // URL must match exactly what is configured in the Twilio Console
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
    const valid = validateRequest(authToken, signature, url, params);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  return handleTwilioEvent(params);
}

async function handleTwilioEvent(
  params: Record<string, string>
): Promise<NextResponse> {
  const twilioSid = params["MessageSid"];
  const twilioStatus = params["MessageStatus"];

  if (!twilioSid) return NextResponse.json({ ok: true });

  const newStatus = STATUS_MAP[twilioStatus] ?? twilioStatus;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: newStatus, updated_at: now };
  if (newStatus === "delivered") updates.delivered_at = now;

  const supabase = await createClient();
  const { error } = await supabase
    .from("sms_notifications")
    .update(updates)
    .eq("twilio_sid", twilioSid);

  if (error) {
    console.error("[twilio-webhook] update error:", error.message);
    // Still return 200 to prevent Twilio retries
  }

  return NextResponse.json({ ok: true });
}
