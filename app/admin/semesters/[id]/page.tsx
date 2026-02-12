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

              <div className="text-sm text-gray-500">
                Capacity: {session.capacity}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Payment Plan */}
      {semester.payment_plan?.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold">Payment Plan</h2>

          <div className="text-sm space-y-2">
            {semester.payment_plan.map((plan: any) => (
              <div key={plan.id} className="space-y-1">
                <div>Type: {plan.type}</div>
                <div>Due Date: {plan.due_date}</div>
              </div>
            ))}
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
            <div key={sd.id} className="border border-gray-200 rounded-xl p-4">
              <div className="text-sm">Discount ID: {sd.discount_id}</div>

              <div className="text-sm text-gray-500">Scope: {sd.scope}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
