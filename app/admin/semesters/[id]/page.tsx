"use server";

import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { publishSemester } from "../actions/publishSemester";
import { unpublishSemester } from "../actions/unpublishSemester";
import { archiveSemester } from "../actions/archiveSemester";
import { StatusBadge } from "@/app/components/SemesterStatusBadge";

type Props = {
  params: { id: string };
};

export default async function SemesterDetailPage({ params }: Props) {
  const supabase = await createClient();
  const { id } = await params;

  // Fetch semester
  const { data: semester, error } = await supabase
    .from("semesters")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !semester) {
    notFound();
  }

  // Fetch sessions
  const { data: sessions } = await supabase
    .from("sessions")
    .select("*")
    .eq("semester_id", id);

  // Fetch applied discounts
  const { data: semesterDiscounts } = await supabase
    .from("semester_discounts")
    .select("*, discount:discounts(*)")
    .eq("semester_id", id);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-10">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {semester.name}
            </h1>

            <StatusBadge status={semester.status} />
          </div>

          <a
            href={`/admin/semesters/${id}/edit`}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            Edit Semester
          </a>
          <div className="flex gap-3">
            {semester.status === "draft" && (
              <form action={publishSemester.bind(null, id)}>
                <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm">
                  Publish
                </button>
              </form>
            )}

            {semester.status === "published" && (
              <form action={unpublishSemester.bind(null, id)}>
                <button className="px-4 py-2 rounded-xl border border-gray-300 text-sm">
                  Unpublish
                </button>
              </form>
            )}

            {semester.status !== "archived" && (
              <form action={archiveSemester.bind(null, id)}>
                <button className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm">
                  Archive
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Details */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>

          <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Attendance Tracking</span>
              <span className="font-medium text-gray-900">
                {semester.tracking_mode ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Capacity Warning Threshold</span>
              <span className="font-medium text-gray-900">
                {semester.capacity_warning_threshold ?? 0}%
              </span>
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Sessions ({sessions?.length ?? 0})
          </h2>

          {sessions?.length === 0 ? (
            <div className="text-sm text-gray-500">No sessions added.</div>
          ) : (
            <div className="space-y-4">
              {sessions?.map((s) => (
                <div
                  key={s.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="font-medium text-gray-900">{s.title}</div>

                  <div className="text-sm text-gray-500">
                    {s.start_date} → {s.end_date}
                  </div>

                  <div className="text-sm text-gray-500">
                    Capacity: {s.capacity}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Discounts */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Discounts ({semesterDiscounts?.length ?? 0})
          </h2>

          {semesterDiscounts?.length === 0 ? (
            <div className="text-sm text-gray-500">No discounts applied.</div>
          ) : (
            <div className="space-y-4">
              {semesterDiscounts?.map((sd) => (
                <div
                  key={sd.discount?.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="font-medium text-gray-900">
                    {sd.discount?.name}
                  </div>

                  <div className="text-sm text-gray-500">Scope: {sd.scope}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Back */}
        <div className="pt-6 border-t border-gray-200">
          <a
            href="/admin/semesters"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Semesters
          </a>
        </div>
      </div>
    </div>
  );
}
