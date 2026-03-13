"use server";

import { createClient } from "@/utils/supabase/server";
import { logAudit } from "./logAudit";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/utils/requireAdmin";

export async function unpublishSemester(id: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Block unpublish if any active registrations exist for this semester
  const { count, error: countError } = await supabase
    .from("registrations")
    .select("*, class_sessions!inner(semester_id)", { count: "exact", head: true })
    .eq("class_sessions.semester_id", id)
    .not("status", "in", "(cancelled,waitlisted)");

  if (countError) throw new Error(countError.message);
  if (count && count > 0) {
    throw new Error(
      `Cannot unpublish — ${count} active registration(s) exist. Cancel those registrations first.`
    );
  }

  const { error } = await supabase
    .from("semesters")
    .update({
      status: "draft",
      updated_at: new Date(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await logAudit({
    semesterId: id,
    action: "unpublished",
  });

  revalidatePath("/admin/semesters");
  revalidatePath(`/admin/semesters/${id}`);
}
