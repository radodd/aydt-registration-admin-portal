"use server";

import { createClient } from "@/utils/supabase/server";
import { EmailDraft } from "@/types";
import { updateEmailDraft } from "./updateEmailDraft";
import { resolveRecipients } from "./resolveRecipients";

export async function scheduleEmail(
  emailId: string,
  scheduledAt: string,
  draft: EmailDraft,
): Promise<void> {
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

  await updateEmailDraft(emailId, draft);

  const recipients = await resolveRecipients(emailId);

  if (recipients.length === 0) {
    throw new Error(
      "No eligible recipients found. Check selections and subscription status.",
    );
  }

  await supabase.from("email_recipients").delete().eq("email_id", emailId);

  const { error: snapErr } = await supabase.from("email_recipients").insert(
    recipients.map((r) => ({
      email_id: emailId,
      user_id: r.userId,
      email_address: r.emailAddress,
      first_name: r.firstName,
      last_name: r.lastName,
    })),
  );
  if (snapErr) throw new Error(snapErr.message);

  const { error } = await supabase
    .from("emails")
    .update({
      status: "scheduled",
      scheduled_at: scheduledAt,
      updated_by_admin_id: admin.id,
    })
    .eq("id", emailId);

  if (error) throw new Error(error.message);

  await supabase.from("email_activity_logs").insert({
    email_id: emailId,
    action: "scheduled",
    admin_id: admin.id,
    metadata: { scheduled_at: scheduledAt, recipient_count: recipients.length },
  });
}
