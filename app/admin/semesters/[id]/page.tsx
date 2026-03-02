import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import SemesterLifecycleActions from "./SemesterLifecycleActions";
import SemesterDetailTabs from "./SemesterDetailTabs";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function SemesterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: semester, error } = await supabase
    .from("semesters")
    .select(
      `
    *,
    classes(
      *,
      class_sessions(*)
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
          class_sessions!session_id(
            id,
            classes(name)
          )
        )
      )
    )
    `,
    )
    .eq("id", id)
    .single();

  if (!semester || error) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-700 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{semester.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          {semester.status !== "published" && (
            <Link
              href={`/admin/semesters/${id}/edit`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
            >
              Edit
            </Link>
          )}

          <SemesterLifecycleActions
            semesterId={id}
            status={semester.status}
            publishAt={semester.publish_at}
          />
        </div>
      </div>

      {/* Tabbed Content */}
      <SemesterDetailTabs semester={semester} />
    </div>
  );
}
