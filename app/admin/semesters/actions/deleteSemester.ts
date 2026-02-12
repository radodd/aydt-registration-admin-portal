"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function deleteSemester(id: string) {
  console.log("🧨 deleteSemester called with ID:", id);

  if (!id) {
    console.error("❌ No semester ID provided");
    throw new Error("Semester ID is required");
  }

  const supabase = await createClient();
  console.log("✅ Supabase client created");

  // Check existence before delete
  const { data: existing, error: fetchError } = await supabase
    .from("semesters")
    .select("id")
    .eq("id", id)
    .single();

  console.log("🔎 Existing semester lookup:", existing);
  console.log("🔎 Fetch error:", fetchError);

  const { error } = await supabase.from("semesters").delete().eq("id", id);

  console.log("🗑 Delete attempt complete");
  console.log("Delete error:", error);

  if (error) {
    console.error("❌ Delete semester error:", error);
    throw new Error(error.message);
  }

  console.log("✅ Semester deleted successfully");

  revalidatePath("/admin/semesters");
  console.log("🔄 Path revalidated");

  return { success: true };
}
