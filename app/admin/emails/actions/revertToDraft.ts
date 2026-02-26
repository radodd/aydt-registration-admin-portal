"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Reverts a scheduled or failed email back to draft status.
 *
 * - Clears scheduled_at and the frozen recipient snapshot so recipients
 *   will be re-resolved on the next schedule/send.
 * - Only callable by super_admin.
 * - Allowed from: "scheduled" or "failed" states.
 */
export async function revertToDraft(emailId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || admin.role !== "super_admin") {
    throw new Error("Unauthorized: Super Admin only");
  }

  const { error: updateErr } = await supabase
    .from("emails")
    .update({
      status: "draft",
      scheduled_at: null,
      updated_by_admin_id: admin.id,
    })
    .eq("id", emailId)
    .in("status", ["scheduled", "failed"]);

  if (updateErr) throw new Error(updateErr.message);

  // Clear the stale recipient snapshot — it will be regenerated on next schedule/send.
  await supabase.from("email_recipients").delete().eq("email_id", emailId);

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "edited",
    admin_id: admin.id,
    metadata: { reverted_to_draft: true },
  });
}
