import { createClient } from "@/utils/supabase/server";

export async function requireAdmin(): Promise<{ userId: string; role: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new Error("Unauthorized");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || !["admin", "super_admin"].includes(admin.role)) {
    throw new Error("Unauthorized");
  }

  return { userId: admin.id, role: admin.role };
}
