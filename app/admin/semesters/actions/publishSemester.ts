// "use server";

// import { createClient } from "@/utils/supabase/server";

// export async function publishSemester(semesterId: string) {
//   const supabase = await createClient();

//   const { error } = await supabase.rpc("publish_semester", {
//     p_semester_id: semesterId,
//   });

//   if (error) {
//     throw new Error(error.message);
//   }

//   return { success: true };
// }

"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function publishSemester(semesterId: string) {
  const supabase = await createClient();

  console.log("🚀 Publishing semester:", semesterId);

  // 1️⃣ Call canonical DB publish function
  const { error } = await supabase.rpc("publish_semester", {
    p_semester_id: semesterId,
  });

  if (error) {
    console.error("❌ RPC publish failed:", error);
    throw new Error(error.message);
  }

  console.log("✅ RPC publish succeeded");

  // 2️⃣ Update status (ONLY if RPC does not handle it)
  await supabase
    .from("semesters")
    .update({
      status: "published",
      updated_at: new Date(),
    })
    .eq("id", semesterId);

  // 3️⃣ Log audit
  await supabase.from("semester_audit_logs").insert({
    semester_id: semesterId,
    action: "published",
    created_at: new Date(),
  });

  // 4️⃣ Revalidate
  revalidatePath("/admin/semesters");
  revalidatePath(`/admin/semesters/${semesterId}`);

  return;
}
