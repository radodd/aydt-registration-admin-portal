"use server";

import { createClient } from "@/utils/supabase/server";
import { logAudit } from "./logAudit";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/utils/requireAdmin";

export async function archiveSemester(id: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("semesters")
    .update({
      status: "archived",
      deleted_at: new Date(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await logAudit({
    semesterId: id,
    action: "archived",
  });

  revalidatePath("/admin/semesters");
}
