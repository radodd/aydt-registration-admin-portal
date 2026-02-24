import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "American Youth Dance Theater — Registration",
  description:
    "Explore available dance programs and register your child for our upcoming semesters.",
};

export default async function HomePage() {
  const supabase = await createClient();

  const { data: semesters, error } = await supabase
    .from("semesters")
    .select("id, name, status, sessions(start_date, end_date)")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  console.log("hello", semesters);

  console.log("error:", error);
  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-indigo-600 font-semibold text-sm tracking-wide uppercase mb-3">
              Enrollment Open
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
              Dance Programs for Young Artists
            </h1>
            <p className="text-gray-600 text-lg leading-relaxed mb-8">
              American Youth Dance Theater offers world-class dance training for
              children and young adults. Browse our upcoming semesters and
              secure your spot today.
            </p>
            <a
              href="#semesters"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
            >
              View Available Semesters
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Semesters grid                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section id="semesters" className="max-w-6xl mx-auto px-6 py-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Available Semesters
        </h2>
        <p className="text-gray-500 mb-8">
          Select a semester to view sessions, schedules, and pricing.
        </p>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
            Unable to load semesters. Please try again shortly.
          </div>
        ) : !semesters || semesters.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
            <p className="text-gray-500 font-medium">
              No semesters are currently open for registration.
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Check back soon for upcoming programs.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {semesters.map((semester) => {
              // Derive date range from sessions
              const sessions = (semester.sessions ?? []) as {
                start_date: string | null;
                end_date: string | null;
              }[];
              const allDates = sessions.flatMap((s) =>
                [s.start_date, s.end_date].filter(Boolean),
              ) as string[];
              const earliest =
                allDates.length > 0
                  ? allDates.reduce((a, b) => (a < b ? a : b))
                  : null;
              const latest =
                allDates.length > 0
                  ? allDates.reduce((a, b) => (a > b ? a : b))
                  : null;

              return (
                <div
                  key={semester.id}
                  className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
                >
                  {/* Header */}
                  <div className="mb-4 flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {semester.name}
                    </h3>

                    {/* Date range */}
                    {earliest && latest && (
                      <p className="text-sm text-indigo-600 font-medium mb-2">
                        {formatDate(earliest)} – {formatDate(latest)}
                      </p>
                    )}

                    {/* {semester.description && (
                      <p className="text-gray-500 text-sm leading-relaxed line-clamp-3">
                        {semester.description}
                      </p> */}
                  </div>

                  {/* Sessions count pill */}
                  {sessions.length > 0 && (
                    <p className="text-xs text-gray-400 mb-4">
                      {sessions.length} session
                      {sessions.length !== 1 ? "s" : ""} available
                    </p>
                  )}

                  <Link
                    href={`/semester/${semester.id}`}
                    className="block text-center bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    View Sessions
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
