// import EditSemesterClient from "./EditSemesterClient";
import { createClient } from "@/utils/supabase/server";
import EditSemesterClient from "../page";

export default async function EditPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: semester } = await supabase
    .from("semesters")
    .select("*")
    .eq("id", id)
    .single();

  if (!semester) notFound();

  return <EditSemesterClient initialData={semester} />;
}
