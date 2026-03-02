"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Marks a single batch_payment_installments row as paid.
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

  const { error } = await supabase
    .from("batch_payment_installments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", installmentId);

  if (error) return { error: error.message };
  return {};
}
