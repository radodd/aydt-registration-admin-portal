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
      "id, family_id, email, first_name, middle_name, last_name, phone_number, phone_number_alt, cc_alternate_parent, referral_source, is_primary_parent, role, status, created_at, address_line1, address_line2, city, state, zipcode, sms_opt_in, sms_verified",
    )
    .eq("id", authUser.id)
    .single();

  if (!user) {
    redirect("/");
  }

  const { data: dancers } = await supabase
    .from("dancers")
    .select("id, first_name, last_name, birth_date, grade, school, secondary_email, phone_number")
    .eq("family_id", user.family_id)
    .order("created_at", { ascending: true });

  const { data: contacts } = await supabase
    .from("family_contacts")
    .select("id, family_id, type, first_name, last_name, phone, email, relationship, is_authorized_pickup, notes, created_at, updated_at")
    .eq("family_id", user.family_id)
    .order("created_at", { ascending: true });

  const dancerIds = (dancers ?? []).map((d) => d.id);

  const [{ data: registrations }, { data: batches }] = await Promise.all([
    dancerIds.length > 0
      ? supabase
          .from("registrations")
          .select(
            "id, status, dancer_id, class_sessions(id, day_of_week, start_time, end_time, location, instructor_name, classes(id, name, discipline))",
          )
          .in("dancer_id", dancerIds)
          .in("status", ["confirmed", "pending_payment"])
      : Promise.resolve({ data: null }),
    supabase
      .from("registration_batches")
      .select(
        "id, grand_total, payment_plan_type, status, created_at, semesters:semester_id(name), batch_payment_installments(id, installment_number, amount_due, due_date, status, paid_at), registrations(id, dancer_id, dancers(first_name, last_name), class_sessions(classes(name)))",
      )
      .eq("family_id", user.family_id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <FamilyProfileCard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user={user as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dancers={dancers as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registrations={registrations as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batches={batches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contacts={contacts as any}
    />
  );
}
