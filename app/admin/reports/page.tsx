import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSemesters, getReportData } from "./actions";
import { ReportsClient } from "./ReportsClient";

interface Props {
  searchParams: Promise<{ semester?: string }>;
}

export default async function ReportsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/auth");

  const { semester: semesterParam } = await searchParams;

  const semesters = await getSemesters();

  // Use semester from query param, then most recently published, then first
  const defaultSemester =
    (semesterParam ? semesters.find((s) => s.id === semesterParam) : null) ??
    semesters.find((s) => s.status === "published") ??
    semesters[0];

  const initialRows = defaultSemester
    ? await getReportData([defaultSemester.id])
    : [];

  return (
    <ReportsClient
      semesters={semesters}
      initialRows={initialRows}
      defaultSemesterId={defaultSemester?.id ?? ""}
    />
  );
}
