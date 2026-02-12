"use server";

import { createClient } from "@/utils/supabase/server";
import { logAudit } from "./logAudit";
import { revalidatePath } from "next/cache";

export async function unpublishSemester(id: string) {
  const supabase = await createClient();

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
