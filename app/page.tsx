import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();

  /* ---------------------------
     Auth
  ----------------------------*/
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  console.log("Authenticated user:", user);
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("first_name")
      .eq("id", user.id)
      .single();

    profile = data;
    console.log("User profile:", data);
  }

  /* ---------------------------
     Fetch Semesters
  ----------------------------*/
  const { data: semesters, error } = await supabase
    .from("semesters")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  console.log("Fetched semesters:", semesters);
  if (error) {
    console.error("Error fetching semesters:", error);
    return (
      <main className="max-w-6xl mx-auto p-8">
        <p className="text-red-600 font-medium">Failed to load semesters.</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-10">
      {/* ---------------------------
          Header
      ---------------------------- */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            Welcome
            {profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="text-gray-500 mt-1">Explore available semesters.</p>
        </div>

        {user ? (
          <Link
            href="/profile"
            className="bg-gray-900 text-white px-5 py-2.5 rounded-2xl hover:bg-black transition"
          >
            View Profile
          </Link>
        ) : (
          <Link
            href="/auth/login"
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-2xl hover:bg-indigo-700 transition"
          >
            Log In
          </Link>
        )}
      </header>

      {/* ---------------------------
          Semester Section
      ---------------------------- */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">
          Available Semesters
        </h2>

        {!semesters || semesters.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-gray-500">
            No semesters available.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {semesters.map((semester) => (
              <div
                key={semester.id}
                className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition"
              >
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {semester.name}
                  </h3>

                  {semester.status && (
                    <span className="inline-block mt-2 text-xs font-medium bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">
                      {semester.status}
                    </span>
                  )}
                </div>

                {semester.description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {semester.description}
                  </p>
                )}

                <Link
                  href={`/semesters/${semester.id}`}
                  className="block text-center bg-indigo-600 text-white rounded-xl py-2.5 font-medium hover:bg-indigo-700 transition"
                >
                  View Semester
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
