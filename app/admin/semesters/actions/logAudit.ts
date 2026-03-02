"use server";

import { createClient } from "@/utils/supabase/server";
// import { revalidatePath } from "next/cache";

export async function logAudit({
  semesterId,
  action,
  changes,
}: {
  semesterId: string;
  action: string;
  changes?: any;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("semester_audit_logs").insert({
    semester_id: semesterId,
    action,
    performed_by: user?.id ?? null,
    changes: changes ?? null,
  });
}
