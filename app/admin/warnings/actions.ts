"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { revalidatePath } from "next/cache";

export async function markWarningReviewed(warningId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  await supabase
    .from("enrollment_warnings")
    .update({
      is_reviewed: true,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", warningId);

  revalidatePath("/admin/warnings");
}

export async function markAllWarningsReviewed(semesterId?: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from("enrollment_warnings")
    .update({
      is_reviewed: true,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("is_reviewed", false);

  if (semesterId) query = query.eq("semester_id", semesterId);

  await query;
  revalidatePath("/admin/warnings");
}
