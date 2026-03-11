"use server";

import { createClient } from "@/utils/supabase/server";

const SIMULATE_COUNT = 3;

export async function simulateDeliveryFailure(
  emailId: string,
): Promise<{ simulated: number }> {
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

  // Pick up to SIMULATE_COUNT 'sent' deliveries to mark as failed
  const { data: deliveries, error } = await supabase
    .from("email_deliveries")
    .select("id")
    .eq("email_id", emailId)
    .eq("status", "sent")
    .limit(SIMULATE_COUNT);

  if (error) throw new Error(error.message);
  if (!deliveries || deliveries.length === 0) return { simulated: 0 };

  const ids = deliveries.map((d) => d.id);

  await supabase
    .from("email_deliveries")
    .update({ status: "failed", failure_reason: "Simulated failure" })
    .in("id", ids);

  return { simulated: ids.length };
}
