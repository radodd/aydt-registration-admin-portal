// import { createClient } from "@/utils/supabase/server";

// export async function publishSemesterNow(semesterId: string) {
//   const supabase = await createClient();

//   const now = new Date().toISOString();

//   const { error } = await supabase
//     .from("semesters")
//     .update({
//       status: "published",
//       publish_at: now,
//       published_at: now,
//     })
//     .eq("id", semesterId);

//   if (error) {
//     throw new Error("Failed to publish semester");
//   }

//   return { success: true };
// }
