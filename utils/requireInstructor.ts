import { createClient } from "@/utils/supabase/server";

export async function requireInstructor(): Promise<{ userId: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new Error("Unauthorized");

  const { data: user, error } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (error || !user || user.role !== "instructor") {
    throw new Error("Unauthorized");
  }

  return { userId: user.id };
}
