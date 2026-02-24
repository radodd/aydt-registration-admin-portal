import EmailsClient from "./EmailsClient";
import { createClient } from "@/utils/supabase/server";

export default async function EmailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isSuperAdmin = false;
  if (user) {
    const { data: admin } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    isSuperAdmin = admin?.role === "super_admin";
  }

  return <EmailsClient isSuperAdmin={isSuperAdmin} />;
}
