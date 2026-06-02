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
        classes (
          *,
          class_sections (*, section_price_tiers(*), class_meetings(id, schedule_date, capacity, start_time, end_time, drop_in_price, class_meeting_options(*))),
          class_tiers (*),
          class_requirements!class_requirements_class_id_fkey (*, class_requirement_approved_dancers(dancer_id)),
          division_info:divisions (is_drop_in)
        ),
        meeting_groups(
          id, name, meeting_group_meetings(meeting_id, class_meetings(section_id))
        ),
        semester_payment_plans(*),
        semester_payment_installments(*),
        semester_discounts(
          semester_id,
          discount_id,
          discount:discounts(
            *,
            discount_rules(*),
            discount_rule_meetings(*)
          )
        ),
        tuition_rate_bands(*),
        semester_fee_config(*),
        special_program_tuition(*)
        `,
      )
      .eq("id", id)
      .single(),
    supabase
      .from("meeting_enrollments")
      .select("*, class_meetings!inner(semester_id)", {
        count: "exact",
        head: true,
      })
      .eq("class_meetings.semester_id", id),
  ]);

  console.log("CHECK HERE", semesterResult);
  if (!semesterResult.data) notFound();

  return (
    <EditSemesterClient
      semester={semesterResult.data}
      registrationCount={regCountResult.count ?? 0}
    />
  );
}
