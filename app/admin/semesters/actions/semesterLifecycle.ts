"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "./logAudit";

function revalidateSemester(semesterId: string) {
  revalidatePath("/admin/semesters");
  revalidatePath(`/admin/semesters/${semesterId}`);
}

/* ============================================================
   SAVE AS DRAFT
============================================================ */

export async function saveSemesterDraft(semesterId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("semesters")
    .update({
      status: "draft",
      publish_at: null,
      published_at: null,
      updated_at: new Date(),
    })
    .eq("id", semesterId);

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({ semesterId, action: "saved_draft" });
  revalidateSemester(semesterId);

  return { success: true };
}

/* ============================================================
   PUBLISH NOW
============================================================ */

export async function publishSemesterNow(semesterId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // 1️⃣ Pre-flight: semester must have at least one class session
  const { count, error: countError } = await supabase
    .from("class_sessions")
    .select("id, classes!inner(semester_id)", { count: "exact", head: true })
    .eq("classes.semester_id", semesterId);

  if (countError) {
    throw new Error(countError.message);
  }

  if (!count || count === 0) {
    throw new Error(
      "Cannot publish: this semester has no class sessions. Add at least one class with a session before publishing.",
    );
  }

  // 2️⃣ Lifecycle mutation
  const { error } = await supabase
    .from("semesters")
    .update({
      status: "published",
      publish_at: now,
      published_at: now,
      updated_at: now,
    })
    .eq("id", semesterId);

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({ semesterId, action: "published_now" });
  revalidateSemester(semesterId);

  return { success: true };
}

/* ============================================================
   SCHEDULE
============================================================ */

export async function scheduleSemester(semesterId: string, publishAt: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("semesters")
    .update({
      status: "scheduled",
      publish_at: publishAt,
      published_at: null,
      updated_at: new Date(),
    })
    .eq("id", semesterId);

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({ semesterId, action: "scheduled_publish" });
  revalidateSemester(semesterId);

  return { success: true };
}
