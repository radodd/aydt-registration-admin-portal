import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function SemesterDetailPage({ params }: PageProps) {
  const { id } = await params;
  console.log("🔎 SemesterDetailPage hit with ID:", id);
  const supabase = await createClient();

  const { data: semester, error } = await supabase
    .from("semesters")
    .select(
      `
  *,
  sessions(*),
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
  console.log("📦 Supabase semester result:", semester);
  console.log("❗ Supabase error:", error);

  if (!semester || error) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-700 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{semester.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Status: {semester.status}
          </p>
        </div>

        <div className="flex gap-4">
          <Link
            href={`/admin/semesters/${semester.id}/edit`}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            Edit
          </Link>

          <Link
            href="/admin/semesters"
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Back
          </Link>
        </div>
      </div>

      {/* Semester Details */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Semester Details</h2>

        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Tracking Mode</span>
            <span>{semester.tracking_mode ? "Enabled" : "Disabled"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Capacity Warning Threshold</span>
            <span>{semester.capacity_warning_threshold ?? 0}%</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Publish At</span>
            <span>{semester.publish_at ?? "Not scheduled"}</span>
          </div>
        </div>
      </section>

      {/* Sessions */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          Sessions ({semester.sessions?.length ?? 0})
        </h2>

        <div className="space-y-4">
          {semester.sessions?.map((session: any) => (
            <div
              key={session.id}
              className="border border-gray-200 rounded-xl p-4"
            >
              <div className="font-medium">{session.title}</div>

              <div className="text-sm text-gray-500">
                {session.start_date} → {session.end_date}
              </div>

              {session.days_of_week && (
                <div className="text-sm text-gray-500">
                  Days: {session.days_of_week.join(", ")}
                </div>
              )}

              <div className="text-sm text-gray-500">
                Capacity: {session.capacity}
              </div>
              <div className="text-sm text-gray-500">
                Status: {session.is_active ? "Active" : "Inactive"}
              </div>
              <div className="text-sm text-gray-500">Type: {session.type}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Payment Plan */}
      {semester.semester_payment_plans && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold">Payment Plan</h2>

          <div className="text-sm space-y-2">
            <div className="space-y-1">
              <div>Type: {semester.semester_payment_plans.type}</div>
              <div>Due Date: {semester.semester_payment_plans.due_date}</div>
              <div>
                Deposit Amount: {semester.semester_payment_plans.deposit_amount}
              </div>
              <div>
                Deposit Percentage:{" "}
                {semester.semester_payment_plans.deposit_percentage}%
              </div>
              <div>
                Installment Count:{" "}
                {semester.semester_payment_plans.installment_count}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Discounts */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          Discounts ({semester.semester_discounts?.length ?? 0})
        </h2>

        <div className="space-y-4">
          {semester.semester_discounts?.length === 0 && (
            <div className="text-sm text-gray-500">No discounts applied</div>
          )}

          {semester.semester_discounts?.map((sd: any) => (
            <div
              key={`${sd.semester_id}-${sd.discount_id}`}
              className="border border-gray-200 rounded-xl p-4"
            >
              <div className="text-sm">Discount ID: {sd.discount_id}</div>

              <div className="text-sm text-gray-500">Scope: {sd.scope}</div>
              <div className="text-sm text-gray-500">
                Name: {sd.discount.name}
              </div>
              <div className="text-sm text-gray-500">
                Category: {sd.discount.category}
              </div>
              <div className="text-sm text-gray-500">
                Eligible Sessions: {sd.discount.eligible_sessions_mode}
              </div>
              <div className="text-sm text-gray-500">
                Recipient Scope: {sd.discount.recipient_scope}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
