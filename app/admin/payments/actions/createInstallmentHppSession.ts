"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createEpgOrder, createEpgPaymentSession } from "@/utils/payment/epg";
import { INSTALLMENT_RETRY_PREFIX } from "./installmentRetryRef";

/**
 * Meeting-plan #47 Part B — "Pay Now (new card)" for a single failed/overdue
 * installment.
 *
 * Used when the family's saved card can't be charged (expired) or they want a
 * DIFFERENT card. Stored-card reprocess is the other path (reprocessInstallment).
 *
 * Because the new card is cardholder-present and our account enforces 3DS, the
 * charge MUST go through the hosted payment page (HPP) so Elavon runs the 3DS
 * challenge — a server-to-server merchantInitiated charge is only valid for an
 * already-stored credential. We create a one-off Order + hosted Session for
 * exactly this installment's amount and redirect the admin to it.
 *
 * Reference convention: customReference = `installment-retry-{installmentId}`.
 * This is deliberately NOT the order id, so it never collides with the original
 * checkout's payments row (payments.registration_batch_id / custom_reference are
 * UNIQUE per order). Reconciliation is keyed off this reference — see the
 * webhook branch and the /admin/payments/installment-return page, both of which
 * call reconcileInstallmentHppCharge. We do NOT write a payments row here.
 *
 * Super-admin only (matches the other installment charge actions).
 */

export interface CreateInstallmentHppSessionResult {
  paymentSessionUrl?: string;
  error?: string;
}

export async function createInstallmentHppSession(
  installmentId: string,
): Promise<CreateInstallmentHppSessionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (userRecord?.role !== "super_admin") {
    return { error: "Charging a card requires super-admin." };
  }

  // Installment + its order (for the parent billing prefill + semester label).
  const { data: inst } = await supabase
    .from("order_payment_installments")
    .select(
      `id, installment_number, amount_due, status,
       registration_orders!inner(id, parent_id, semesters:semester_id(name))`,
    )
    .eq("id", installmentId)
    .single();

  if (!inst) return { error: "Installment not found." };
  if (inst.status === "paid") return { error: "This installment is already paid." };
  if (inst.status === "waived") return { error: "This installment was waived." };

  const amount = Number(inst.amount_due);
  if (!(amount > 0)) return { error: "Installment amount is invalid." };

  const order = (inst as unknown as {
    registration_orders: { id: string; parent_id: string | null; semesters: { name: string } | null };
  }).registration_orders;
  const semesterName = order?.semesters?.name ?? "AYDT";

  // AVS prefill — pull the parent's address onto the HPP billing fields so the
  // captured address matches the card (mirrors createEPGPaymentSession).
  let billTo;
  if (order?.parent_id) {
    const { data: parentUser } = await supabase
      .from("users")
      .select(
        "first_name, last_name, email, address_line1, address_line2, city, state, zipcode",
      )
      .eq("id", order.parent_id)
      .single();

    if (
      parentUser?.address_line1 &&
      parentUser?.city &&
      parentUser?.state &&
      parentUser?.zipcode
    ) {
      billTo = {
        fullName:
          `${parentUser.first_name ?? ""} ${parentUser.last_name ?? ""}`.trim() || null,
        street1: parentUser.address_line1,
        street2: parentUser.address_line2,
        city: parentUser.city,
        region: parentUser.state,
        postalCode: parentUser.zipcode,
        email: parentUser.email,
      };
    }
  }

  // Callback URLs (mirror createEPGPaymentSession's host/proto resolution).
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const siteUrl = process.env.SITE_URL ?? `${proto}://${host}`;

  const reference = `${INSTALLMENT_RETRY_PREFIX}${installmentId}`;
  const returnUrl = `${siteUrl}/admin/payments/installment-return?installment=${installmentId}`;
  const cancelUrl = `${siteUrl}/admin/payments?charge_cancelled=1`;

  // One-off Order for exactly this installment's amount.
  let epgOrder;
  try {
    epgOrder = await createEpgOrder({
      amountDollars: amount,
      currencyCode: "USD",
      description: `${semesterName} — Installment ${inst.installment_number} (new card)`,
      customReference: reference,
    });
  } catch (err) {
    console.error("[#47] createEpgOrder failed:", err);
    return { error: "Failed to create payment order. Please try again." };
  }

  // Full hosted sale: doCreateTransaction + doCapture + doThreeDSecure all
  // default true — the HPP runs the 3DS challenge and the sale end-to-end.
  let session;
  try {
    session = await createEpgPaymentSession({
      orderHref: epgOrder.href,
      returnUrl,
      cancelUrl,
      customReference: reference,
      doThreeDSecure: true,
      doCreateTransaction: true,
      doCapture: true,
      billTo,
    });
  } catch (err) {
    console.error("[#47] createEpgPaymentSession failed:", err);
    return { error: "Failed to create payment session. Please try again." };
  }

  if (!session.url) return { error: "Payment session did not return a redirect URL." };
  return { paymentSessionUrl: session.url };
}
