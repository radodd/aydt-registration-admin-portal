// import EditSemesterClient from "./EditSemesterClient";
import { createClient } from "@/utils/supabase/server";
import EditSemesterClient from "../EditSemesterClient";
import { notFound } from "next/navigation";
// import EditSemesterClient from "../page";

export default async function EditPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: semester } = await supabase
    .from("semesters")
    .select(
      `
 *,
    sessions(*),
session_groups(
id, name, session_group_sessions(session_id))

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
    .single();

  return <EditSemesterClient semester={semester} />;
}
