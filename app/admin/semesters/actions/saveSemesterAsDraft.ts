// "use server";

// import { createClient } from "@/utils/supabase/server";

// export async function saveSemesterAsDraft(semesterId: string, payload: any) {
//   const supabase = await createClient();

//   const { error } = await supabase
//     .from("semesters")
//     .update({
//       ...payload,
//       status: "draft",
//       publish_at: null,
//       published_at: null,
//       updated_at: new Date().toISOString(),
//     })
//     .eq("id", semesterId);

//   if (error) {
//     throw new Error("Failed to save draft");
//   }

//   return { success: true };
// }
// //
