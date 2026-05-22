"use server";

import { createClient } from "@/utils/supabase/server";
import { logAudit } from "./logAudit";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/utils/requireAdmin";

export async function unpublishSemester(id: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Block unpublish if any active enrollments exist for this semester, across
  // both registrations (per-session) and section_enrollments (full-term).
  const [{ count: regCount, error: regErr }, { count: enrollCount, error: enrollErr }] = await Promise.all([
    supabase
      .from("registrations")
      .select("*, class_sessions!inner(semester_id)", { count: "exact", head: true })
      .eq("class_sessions.semester_id", id)
      .not("status", "in", "(cancelled,waitlisted)"),
    supabase
      .from("section_enrollments")
      .select("*, class_sections!inner(semester_id)", { count: "exact", head: true })
      .eq("class_sections.semester_id", id)
      .neq("status", "cancelled"),
  ]);

  if (regErr) throw new Error(regErr.message);
  if (enrollErr) throw new Error(enrollErr.message);
  const activeTotal = (regCount ?? 0) + (enrollCount ?? 0);
  if (activeTotal > 0) {
    throw new Error(
      `Cannot unpublish — ${activeTotal} active enrollment(s) exist. Cancel those enrollments first.`,
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
