"use server";

import { createClient } from "@/utils/supabase/server";
import { logAudit } from "./logAudit";
import { revalidatePath } from "next/cache";

export async function archiveSemester(id: string) {
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
