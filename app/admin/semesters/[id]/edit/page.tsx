import { createClient } from "@/utils/supabase/server";
import EditSemesterClient from "../EditSemesterClient";
import { notFound } from "next/navigation";

export default async function EditPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createClient();

  const [semesterResult, regCountResult, meetingEnrRes, sectionEnrRes] =
    await Promise.all([
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
    // Active per-session enrollments → their section ids (row-scoped Classes lock).
    supabase
      .from("meeting_enrollments")
      .select("class_meetings!inner(section_id, semester_id)")
      .eq("class_meetings.semester_id", id)
      .not("status", "in", "(cancelled,waitlisted)"),
    // Active full-term enrollments → their section ids.
    supabase
      .from("section_enrollments")
      .select("section_id, class_sections!inner(semester_id)")
      .eq("class_sections.semester_id", id)
      .neq("status", "cancelled"),
  ]);

  if (!semesterResult.data) notFound();

  // Sections with at least one ACTIVE enrollment (either table) — the DB trigger
  // locks exactly these rows, so the editor locks their schedule / capacity /
  // pricing fields too. New and non-enrolled sections stay fully editable.
  const enrolledSectionIds = Array.from(
    new Set<string>([
      ...((meetingEnrRes.data ?? [])
        .map((r: any) => r.class_meetings?.section_id)
        .filter(Boolean) as string[]),
      ...((sectionEnrRes.data ?? [])
        .map((r: any) => r.section_id)
        .filter(Boolean) as string[]),
    ]),
  );

  return (
    <EditSemesterClient
      semester={semesterResult.data}
      registrationCount={regCountResult.count ?? 0}
      enrolledSectionIds={enrolledSectionIds}
    />
  );
}
