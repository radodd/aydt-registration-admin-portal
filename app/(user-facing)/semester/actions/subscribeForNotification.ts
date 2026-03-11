"use server";

import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";
import { buildSubscriptionConfirmationEmail } from "@/utils/email-templates/subscriptionConfirmation";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function subscribeForNotification(params: {
  email: string;
  name?: string;
  semesterId: string;
  semesterName: string;
  registrationOpenAt?: string | null;
}): Promise<{ success: boolean; alreadySubscribed?: boolean }> {
  const email = params.email.trim().toLowerCase();
  const name = params.name?.trim() || null;
  const { semesterId, semesterName, registrationOpenAt } = params;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false };
  }

  const supabase = await createClient();

  // Upsert — if the email already exists, the unique constraint fires and we
  // handle it gracefully without throwing.
  const { error: upsertError } = await supabase
    .from("email_subscribers")
    .upsert(
      { email, name, is_subscribed: true },
      { onConflict: "email", ignoreDuplicates: true },
    );

  if (upsertError) {
    console.error(
      "[subscribeForNotification] upsert error:",
      upsertError.message,
    );
    return { success: false };
  }

  // Fetch the subscriber row to get the id and check if they already existed.
  const { data: subscriber } = await supabase
    .from("email_subscribers")
    .select("id, created_at")
    .eq("email", email)
    .single();

  const { data: existingRequest } = await supabase
    .from("notification_subscription_emails")
    .select("id")
    .eq("email", email)
    .eq("semester_id", semesterId)
    .maybeSingle();

  if (existingRequest) {
    return { success: true, alreadySubscribed: true };
  }

  // // If the row was created more than 5 seconds ago it pre-existed this request.
  // const alreadySubscribed =
  //   !!subscriber &&
  //   Date.now() - new Date(subscriber.created_at).getTime() > 5_000;

  // if (alreadySubscribed) {
  //   return { success: true, alreadySubscribed: true };
  // }

  // New subscriber — insert a tracking row and send the confirmation email.
  const { data: trackingRow, error: trackingInsertError } = await supabase
    .from("notification_subscription_emails")
    .insert({
      subscriber_id: subscriber?.id ?? null,
      semester_id: semesterId,
      email,
      status: "sent",
    })
    .select("id")
    .single();

  if (trackingInsertError) {
    console.error(
      "[subscribeForNotification] tracking insert error:",
      trackingInsertError.message,
    );
    // Non-fatal — continue to send the email
  }

  try {
    const { subject, html } = buildSubscriptionConfirmationEmail({
      name,
      semesterName,
      registrationOpenAt: registrationOpenAt ?? null,
    });

    const { data: sendData, error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@aydt.com",
      to: email,
      subject,
      html,
    });

    if (sendError || !sendData?.id) {
      console.error(
        "[subscribeForNotification] resend error:",
        sendError?.message ?? "no message id",
      );
      if (trackingRow?.id) {
        await supabase
          .from("notification_subscription_emails")
          .update({ status: "failed" })
          .eq("id", trackingRow.id);
      }
    } else if (trackingRow?.id) {
      // Store the Resend message ID so the webhook can match open/bounce events
      await supabase
        .from("notification_subscription_emails")
        .update({ resend_message_id: sendData.id })
        .eq("id", trackingRow.id);
    }
  } catch (err) {
    // Email failure is non-fatal — the subscription itself succeeded.
    // The admin can see failed sends in the notification_subscription_emails table.
    console.error(
      "[subscribeForNotification] unexpected error sending email:",
      err,
    );
    if (trackingRow?.id) {
      await supabase
        .from("notification_subscription_emails")
        .update({ status: "failed" })
        .eq("id", trackingRow.id);
    }
  }

  return { success: true, alreadySubscribed: false };
}
