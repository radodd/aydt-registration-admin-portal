"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function FamilyPage() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [familyData, setFamilyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // 1️⃣ Get current auth user
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      // 2️⃣ Get user record (for family_id)
      const { data: appUser } = await supabase
        .from("users")
        .select("id, first_name, last_name, family_id")
        .eq("id", authUser.id)
        .single();

      if (!appUser?.family_id) {
        setFamilyData([]);
        setLoading(false);
        return;
      }

      setUser(appUser);

      // 3️⃣ Get all dancers in that family + their programs
      const { data, error } = await supabase
        .from("dancers")
        .select(
          `
          id,
          first_name,
          last_name,
          registrations (
            id,
            status,
            program_id,
            programs (
              id,
              title,
              start_date,
              end_date,
              location
            )
          )
        `
        )
        .eq("family_id", appUser.family_id);

      if (error) {
        console.error("Error fetching family registrations:", error.message);
      } else {
        setFamilyData(data);
      }

      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <p className="text-center mt-10">Loading...</p>;
  if (!familyData.length)
    return (
      <p className="text-center mt-10 text-gray-600">
        No registrations found for your family.
      </p>
    );

  return (
    <main className="max-w-4xl mx-auto p-6 text-black">
      <h1 className="text-3xl font-bold mb-6">
        {user?.first_name} {user?.last_name}’s Family Dashboard
      </h1>

      {familyData.map((dancer) => (
        <section key={dancer.id} className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {dancer.first_name} {dancer.last_name}
          </h2>

          {dancer.registrations.length ? (
            <ul className="space-y-3">
              {dancer.registrations.map((r: any) => (
                <li
                  key={r.id}
                  className="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition"
                >
                  <p className="font-medium">{r.programs.title}</p>
                  <p className="text-sm text-gray-600">
                    {r.programs.start_date} – {r.programs.end_date}
                  </p>
                  <p className="text-sm text-gray-600">
                    Location: {r.programs.location}
                  </p>
                  <p className="text-sm text-gray-700 mt-1">
                    Status:{" "}
                    <span
                      className={
                        r.status === "pending"
                          ? "text-yellow-600"
                          : "text-green-700"
                      }
                    >
                      {r.status}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No classes registered yet.</p>
          )}
        </section>
      ))}
    </main>
  );
}
