import { createClient } from "@/utils/supabase/server";
import EditSemesterClient from "../EditSemesterClient";
import { notFound } from "next/navigation";

export default async function EditPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createClient();

  const [semesterResult, regCountResult] = await Promise.all([
    supabase
      .from("semesters")
      .select(
        `
        *,
        sessions(*),
        session_groups(
          id, name, session_group_sessions(session_id)
        ),
        semester_payment_plans(*),
        semester_payment_installments(*),
        semester_discounts(
          semester_id,
          discount_id,
          discount:discounts(
            *,
            discount_rules(*),
            discount_rule_sessions(*)
          )
        )
        `,
      )
      .eq("id", id)
      .single(),
    supabase
      .from("registrations")
      .select("*, sessions!inner(semester_id)", { count: "exact", head: true })
      .eq("sessions.semester_id", id),
  ]);

  if (!semesterResult.data) notFound();

  return (
    <EditSemesterClient
      semester={semesterResult.data}
      registrationCount={regCountResult.count ?? 0}
    />
  );
}
