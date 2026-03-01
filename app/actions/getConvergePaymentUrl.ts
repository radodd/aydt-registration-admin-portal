"use server";

import { createClient } from "@/utils/supabase/server";
import { createConvergeSession } from "@/utils/payment/converge";
import { headers } from "next/headers";

export interface GetConvergePaymentUrlInput {
  batchId: string;
  amountDueNow: number;
  semesterId: string;
  semesterName: string;
}

export interface GetConvergePaymentUrlResult {
  hostedPaymentUrl?: string;
  error?: string;
}

/**
 * Creates a Converge Hosted Payment Page session for the given batch.
 *
 * Stores the returned auth token in `registration_batches.payment_reference_id`
 * so the webhook handler can verify the payment later.
 *
 * Returns the HPP URL the client should redirect to.
 */
export async function getConvergePaymentUrl(
  input: GetConvergePaymentUrlInput,
): Promise<GetConvergePaymentUrlResult> {
  const supabase = await createClient();

  // Verify the batch exists and is still pending
  const { data: batch, error: batchError } = await supabase
    .from("registration_batches")
    .select("id, status, payment_reference_id")
    .eq("id", input.batchId)
    .maybeSingle();

  if (batchError || !batch) {
    return { error: "Registration batch not found." };
  }
  if (batch.status === "confirmed") {
    return { error: "This registration has already been paid." };
  }

  // Resolve the site URL for constructing callback and redirect URLs
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol =
    process.env.NODE_ENV === "production" ? "https" : "http";
  const siteUrl = process.env.SITE_URL ?? `${protocol}://${host}`;

  try {
    const session = await createConvergeSession({
      amountDollars: input.amountDueNow,
      orderId: input.batchId,
      description: `AYDT ${input.semesterName} Registration`,
      resultCallbackUrl: `${siteUrl}/api/webhooks/payment`,
      successRedirectUrl: `${siteUrl}/register/confirmation?semester=${input.semesterId}`,
      cancelRedirectUrl: `${siteUrl}/register/payment?semester=${input.semesterId}&payment_failed=1`,
    });

    // Store the auth token as the payment reference for this batch
    await supabase
      .from("registration_batches")
      .update({ payment_reference_id: session.authToken })
      .eq("id", input.batchId);

    return { hostedPaymentUrl: session.hostedPaymentUrl };
  } catch (err) {
    console.error("[getConvergePaymentUrl] Error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to initiate payment. Please try again.",
    };
  }
}
