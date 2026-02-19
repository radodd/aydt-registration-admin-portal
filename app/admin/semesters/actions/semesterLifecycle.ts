"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

type SemesterStatus = "draft" | "scheduled" | "published";

async function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  semesterId: string,
  action: string,
) {
  await supabase.from("semester_audit_logs").insert({
    semester_id: semesterId,
    action,
    created_at: new Date(),
  });
}

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

  await logAudit(supabase, semesterId, "saved_draft");
  revalidateSemester(semesterId);

  return { success: true };
}

/* ============================================================
   PUBLISH NOW
============================================================ */

export async function publishSemesterNow(semesterId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // 1️⃣ Run canonical publish logic
  const { error: rpcError } = await supabase.rpc("publish_semester", {
    p_semester_id: semesterId,
  });

  if (rpcError) {
    throw new Error(rpcError.message);
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

  await logAudit(supabase, semesterId, "published_now");
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

  await logAudit(supabase, semesterId, "scheduled_publish");
  revalidateSemester(semesterId);

  return { success: true };
}
