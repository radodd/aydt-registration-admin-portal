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
  console.log("authUser", authUser);
  // 2️⃣ Get user record (for family_id)
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!user) {
    redirect("/login");
  }
  console.log("user", user);

  // 3️⃣ Get all dancers in that family + their programs
  const { data: dancers, error } = await supabase
    .from("dancers")
    .select("*")
    .eq("family_id", user.family_id);

  if (error) {
    console.error("Error fetching family registrations:", error.message);
  } else {
    console.log("Fetched Family Data:", dancers);
  }

  return <FamilyProfileCard user={user} dancers={dancers} />;
}
