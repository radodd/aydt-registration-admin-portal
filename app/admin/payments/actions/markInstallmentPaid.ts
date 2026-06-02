"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Marks a single order_payment_installments row as paid.
 * Admin-only — called from the payments dashboard.
 */
export async function markInstallmentPaid(
  installmentId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Verify caller is an admin
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
    return { error: "Insufficient permissions." };
  }

  // Record the full amount as collected so balance math (meeting-plan #19)
  // reflects that nothing remains — a partially-paid row may already carry a
  // smaller paid_amount that must be brought up to the full amount_due.
  const { data: inst } = await supabase
    .from("order_payment_installments")
    .select("amount_due")
    .eq("id", installmentId)
    .single();

  const { error } = await supabase
    .from("order_payment_installments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount: inst?.amount_due ?? null,
    })
    .eq("id", installmentId);

  if (error) return { error: error.message };
  return {};
}
