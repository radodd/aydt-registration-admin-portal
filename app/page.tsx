import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("No user logged in");
  }
  let loggedInUser = null;
  if (user) {
    console.log("User is logged in:", user);
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    loggedInUser = data;
  }

  const { data: programs, error } = await supabase
    .from("programs")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    console.error("Error loading programs", error.message);
    return <p className="text-red-500">Failed to load programs.</p>;
  }

  if (!programs || programs.length === 0) {
    return <p className="text-gray-500">No programs available</p>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-bold text-black">
            Welcome to the New Portal
            {loggedInUser.first_name}
          </h1>
        </div>

        {/* Right side: conditional profile button */}
        <div>
          {user ? (
            <Link href="/profile">
              <button className="bg-gray-800 text-white rounded-xl px-4 py-2 hover:bg-black transition">
                View Profile
              </button>
            </Link>
          ) : (
            <Link href="/login">
              <button className="bg-blue-600 text-white rounded-xl px-4 py-2 hover:bg-blue-700 transition">
                Log In
              </button>
            </Link>
          )}
        </div>
      </header>
      <h1 className="text-3xl font-bold mb-6 text-black">Available Programs</h1>

      <div className="grid gap-6 sm:grid-cols-2">
        {programs.map((program) => (
          <div
            key={program.id}
            className="border rounded-2xl p-4 shadow-sm hover:shadow-md transition bg-white"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-1">
              {program.title}
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              {program.category === "workshop" ? "Workshop" : "Session"} •{" "}
              {program.type}
            </p>
            <p className="text-gray-700 mb-3">{program.description}</p>

            <div className="text-sm text-gray-600 space-y-1">
              <p>
                📍 <strong>Location:</strong> {program.location}
              </p>
              <p>
                📅 <strong>Dates:</strong> {program.start_date} →{" "}
                {program.end_date}
              </p>
              <p>
                🕒 <strong>Time:</strong> {program.start_time} –{" "}
                {program.end_time}
              </p>
              <p>
                💲 <strong>Price:</strong> ${program.price}
              </p>
            </div>
            <Link href={`/programs/${program.id}`}>
              <button className="mt-4 w-full bg-blue-600 text-white rounded-xl py-2 font-medium hover:bg-blue-700 transition">
                View Details
              </button>
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
