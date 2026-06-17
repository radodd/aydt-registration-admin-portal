"use server";

import { createClient } from "@/utils/supabase/server";
import type { PaymentErrorStatus } from "@/types";

/**
 * Update the resolution status of a payment_error_logs row.
 * Admin or super-admin only (mirrors the table's is_admin_or_super RLS).
 * Setting 'resolved'/'wont_fix' stamps resolved_by/at and any notes.
 * See docs/PAYMENT_ERROR_LOGGING_PLAN.md §6.
 */
export async function updateErrorStatus(
  errorLogId: string,
  status: PaymentErrorStatus,
  notes?: string,
): Promise<{ error?: string }> {
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

  if (userRecord?.role !== "admin" && userRecord?.role !== "super_admin") {
    return { error: "Insufficient permissions." };
  }

  const patch: Record<string, unknown> = { status };
  if (status === "resolved" || status === "wont_fix") {
    patch.resolved_by = user.id;
    patch.resolved_at = new Date().toISOString();
    if (notes != null && notes.trim() !== "") patch.resolution_notes = notes.trim();
  }

  const { error } = await supabase
    .from("payment_error_logs")
    .update(patch)
    .eq("id", errorLogId);

  if (error) return { error: error.message };
  return {};
}
