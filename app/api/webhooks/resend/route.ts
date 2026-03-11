import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Resend webhook event types we care about
type ResendEvent = {
  type:
    | "email.delivered"
    | "email.bounced"
    | "email.complained"
    | "email.opened"
    | "email.clicked";
  data: {
    email_id: string; // Resend message ID
    created_at: string;
  };
};

// Map Resend event type to our delivery status
const EVENT_STATUS: Record<
  ResendEvent["type"],
  "delivered" | "bounced" | "complained" | null
> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": null,
  "email.clicked": null,
};

export async function POST(request: NextRequest) {
  // Verify webhook secret
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get("svix-signature");
    const msgId = request.headers.get("svix-id");
    const msgTimestamp = request.headers.get("svix-timestamp");

    if (!signature || !msgId || !msgTimestamp) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }

    // Svix signature verification
    try {
      const { Webhook } = await import("svix");
      const wh = new Webhook(secret);
      const body = await request.text();
      wh.verify(body, {
        "svix-id": msgId,
        "svix-timestamp": msgTimestamp,
        "svix-signature": signature,
      });
      // Parse after verification
      const event: ResendEvent = JSON.parse(body);
      return await handleEvent(event);
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // No secret configured — still process (dev/staging without verification)
  const event: ResendEvent = await request.json();
  return await handleEvent(event);
}

async function handleEvent(event: ResendEvent): Promise<NextResponse> {
  const supabase = await createClient();
  const resendMessageId = event.data.email_id;

  const newStatus = EVENT_STATUS[event.type];
  const now = new Date(event.data.created_at).toISOString();

  const updates: Record<string, unknown> = { updated_at: now };

  if (newStatus) {
    updates.status = newStatus;
    if (newStatus === "delivered") updates.delivered_at = now;
    if (newStatus === "bounced") updates.bounced_at = now;
  }

  if (event.type === "email.opened") {
    updates.opened_at = now;
  }

  if (event.type === "email.clicked") {
    updates.clicked_at = now;
  }

  const { error } = await supabase
    .from("email_deliveries")
    .update(updates)
    .eq("resend_message_id", resendMessageId);

  if (error) {
    console.error("[resend-webhook] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also update notification_subscription_emails if this was a subscription
  // confirmation email — no-op if the resend_message_id isn't found there.
  await supabase
    .from("notification_subscription_emails")
    .update(updates)
    .eq("resend_message_id", resendMessageId);

  return NextResponse.json({ ok: true });
}
