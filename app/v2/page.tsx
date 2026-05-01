import { createClient } from "@/utils/supabase/server";
import HomeV2Client from "./HomeV2Client";

export default async function V2Page() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  let firstName: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("first_name")
      .eq("id", user.id)
      .single();
    firstName = data?.first_name ?? null;
  }

  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, name, status, class_sessions(id, start_date, end_date)")
    .in("status", ["published", "closed"])
    .order("created_at", { ascending: false })
    .limit(6);

  const openSemester = semesters?.find(s => s.status === "published");

  return (
    <HomeV2Client
      semesters={semesters ?? []}
      isLoggedIn={!!user}
      firstName={firstName}
      openSemesterName={openSemester?.name ?? null}
    />
  );
}
