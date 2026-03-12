import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { FamilyProfileCard } from "./FamilyProfileCard";

export default async function Profile() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/");
  }

  const { data: user } = await supabase
    .from("users")
    .select(
      "id, family_id, email, first_name, middle_name, last_name, phone_number, is_primary_parent, role, status, created_at, address_line1, address_line2, city, state, zipcode, sms_opt_in, sms_verified",
    )
    .eq("id", authUser.id)
    .single();

  if (!user) {
    redirect("/");
  }

  const { data: dancers } = await supabase
    .from("dancers")
    .select("id, first_name, last_name, birth_date, grade")
    .eq("family_id", user.family_id)
    .order("created_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <FamilyProfileCard user={user as any} dancers={dancers as any} />;
}
