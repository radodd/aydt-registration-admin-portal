import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Session, SessionsStepProps } from "@/types";

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
    sessions(
      *,
      session_group_sessions(
        session_group:session_groups(
          id, name
        )
      )
    ),
    semester_payment_plans(*),
    semester_payment_installments(*),
    semester_discounts(
      semester_id,
      discount_id,
      discount:discounts(
        *,
        discount_rules(*),
        discount_rule_sessions(
          session_id,
          sessions(
            id,
            title
          )
        )
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
          {semester.sessions?.map((session: any) => {
            const group = session.session_group_sessions?.session_group ?? null;
            console.log(
              "🔍 Session Object in GROUPS:",
              session.session_group_sessions?.session_group,
            );

            return (
              <div
                key={session.id}
                className="border border-gray-200 rounded-xl p-4"
              >
                <div className="font-medium">{session.title}</div>

                {group ? (
                  <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                    {group.name}
                  </span>
                ) : (
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                    Unassigned
                  </span>
                )}

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
                <div className="text-sm text-gray-500">
                  Type: {session.type}
                </div>
              </div>
            );
          })}
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
      {/* Discounts */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Discounts</h2>
          <span className="text-sm text-gray-500">
            {semester.semester_discounts?.length ?? 0} applied
          </span>
        </div>

        {semester.semester_discounts?.length === 0 && (
          <div className="text-sm text-gray-500 border border-gray-200 rounded-xl p-4">
            No discounts applied to this semester.
          </div>
        )}

        <div className="space-y-5">
          {semester.semester_discounts?.map((sd: any) => {
            const discount = sd.discount;

            const restrictedSessions =
              discount.eligible_sessions_mode === "selected"
                ? (discount.discount_rule_sessions?.map(
                    (s: any) => s.sessions?.title ?? "Unknown session",
                  ) ?? [])
                : [];

            return (
              <div
                key={`${sd.semester_id}-${sd.discount_id}`}
                className="border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-gray-300 transition"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {discount.name}
                    </div>

                    <div className="text-sm text-gray-500 capitalize">
                      {discount.category.replaceAll("_", " ")}
                    </div>
                  </div>

                  <span className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium capitalize">
                    {discount.eligible_sessions_mode === "all"
                      ? "All sessions"
                      : "Selected sessions"}
                  </span>
                </div>

                {/* Rules */}
                {discount.discount_rules?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                      Discount Rules
                    </div>

                    <div className="space-y-1 text-sm text-gray-600">
                      {discount.discount_rules.map(
                        (rule: any, index: number) => {
                          const unit =
                            rule.threshold_unit === "person"
                              ? "people"
                              : "sessions";

                          const value =
                            rule.value_type === "percent"
                              ? `${rule.value}% off`
                              : `$${rule.value} off`;

                          return (
                            <div key={index}>
                              {rule.threshold}+ {unit} → {value}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}

                {/* Restricted Sessions */}
                {restrictedSessions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                      Applies To
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {restrictedSessions.map((title: string, i: number) => (
                        <span
                          key={i}
                          className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700"
                        >
                          {title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recipient Scope */}
                {discount.recipient_scope && (
                  <div className="text-sm text-gray-500 capitalize">
                    Recipient: {discount.recipient_scope.replaceAll("_", " ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
