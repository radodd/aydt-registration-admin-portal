"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

import { Family } from "@/types";

export default function FamiliesAdminPage() {
  const supabase = createClient();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("families")
        .select(
          `
          id,
          family_name,
          created_at,

          users:users!family_id (
            id,
            first_name,
            last_name,
            email,
            phone_number,
            is_primary_parent
          ),

          dancers:dancers!family_id (
            id,
            first_name,
            last_name,

            registrations:registrations!dancer_id (
              id,
              programs:programs!program_id (
                id,
      title,
                days_of_week,
                start_time,
                end_time
              )
            )
          )
        `
        )
        .order("family_name", { ascending: true });

      if (error) console.error("Failed to load families:", error.message);

      setFamilies(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <p>Loading families...</p>;

  return (
    <main className="max-w-6xl mx-auto p-6 text-black">
      <h1 className="text-2xl font-bold mb-6">Families</h1>

      {families.length === 0 ? (
        <p>No families found.</p>
      ) : (
        <div className="space-y-6">
          {families.map((family) => {
            const primaryParent = family.users.find((u) => u.is_primary_parent);
            const secondaryParent = family.users.find(
              (u) => !u.is_primary_parent
            );

            return (
              <div
                key={family.id}
                className="border p-4 rounded-lg bg-gray-50 shadow-sm"
              >
                <h2 className="text-xl font-semibold mb-3">
                  {family.family_name}
                </h2>

                {/* Parents */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <h3 className="font-medium">Primary Parent</h3>
                    {primaryParent ? (
                      <p>
                        {primaryParent.first_name} {primaryParent.last_name}
                        <br />
                        {primaryParent.email}
                        <br />
                        {primaryParent.phone_number || "No phone"}
                      </p>
                    ) : (
                      <p>No primary parent found.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="font-medium">Additional Parent</h3>
                    {secondaryParent ? (
                      <p>
                        {secondaryParent.first_name} {secondaryParent.last_name}
                        <br />
                        {secondaryParent.email}
                        <br />
                        {secondaryParent.phone_number || "No phone"}
                      </p>
                    ) : (
                      <p>None listed.</p>
                    )}
                  </div>
                </div>

                {/* Dancers + Classes */}
                <div>
                  <h3 className="font-medium mb-2">Dancers</h3>
                  {family.dancers.length === 0 ? (
                    <p>No dancers added yet.</p>
                  ) : (
                    family.dancers.map((dancer) => (
                      <div
                        key={dancer.id}
                        className="border rounded-md p-3 mb-3 bg-white"
                      >
                        <p className="font-semibold">
                          {dancer.first_name} {dancer.last_name}
                        </p>

                        {/* Registered Classes */}
                        {dancer.registrations.length > 0 ? (
                          <ul className="list-disc ml-5 mt-2">
                            {dancer.registrations.map((reg) => (
                              <li key={reg.id}>
                                {reg.programs?.title} —{" "}
                                {reg.programs?.days_of_week},{" "}
                                {reg.programs?.start_time}–
                                {reg.programs?.end_time}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-600 text-sm mt-1">
                            No registered classes.
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
