"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Family } from "@/types";
import { getFamilies } from "@/queries/admin";

export default function FamiliesAdmin() {
  const supabase = createClient();
  const [families, setFamilies] = useState<Family[] | null>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await getFamilies();
      setFamilies(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500">
          Loading families...
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      {/* ============================================================
          Header
      ============================================================ */}
      <header>
        <h1 className="text-3xl font-semibold text-gray-900">Families</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of families, parents, and dancers.
        </p>
      </header>

      {/* ============================================================
          Content
      ============================================================ */}
      {families?.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
          No families found.
        </div>
      ) : (
        <div className="space-y-8">
          {families?.map((family) => {
            const primaryParent = family.users.find((u) => u.is_primary_parent);
            const secondaryParent = family.users.find(
              (u) => !u.is_primary_parent,
            );

            return (
              <div
                key={family.id}
                className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6"
              >
                {/* Family Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {family.family_name}
                  </h2>

                  <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                    {family.dancers.length} Dancer
                    {family.dancers.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Parents Section */}
                <section className="grid md:grid-cols-2 gap-8">
                  <ParentCard
                    title="Primary Parent"
                    parent={primaryParent}
                    primary
                  />
                  <ParentCard
                    title="Additional Parent"
                    parent={secondaryParent}
                  />
                </section>

                {/* Dancers Section */}
                <section className="space-y-4">
                  <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
                    Dancers
                  </h3>

                  {family.dancers.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-sm text-gray-500">
                      No dancers added yet.
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                      {family.dancers.map((dancer) => (
                        <div
                          key={dancer.id}
                          className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900">
                              {dancer.first_name} {dancer.last_name}
                            </p>

                            {dancer.is_self && (
                              <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                                Self
                              </span>
                            )}
                          </div>

                          {/* Registered Classes */}
                          {dancer.registrations.length > 0 ? (
                            <ul className="space-y-2 text-sm text-gray-600">
                              {dancer.registrations.flatMap((reg) => (
                                <li
                                  key={reg.sessions?.id}
                                  className="bg-white border border-gray-200 rounded-xl px-3 py-2"
                                >
                                  <span className="font-medium text-gray-800">
                                    {reg.sessions?.title}
                                  </span>
                                  <div className="text-xs text-gray-500">
                                    {reg.sessions?.days_of_week} •{" "}
                                    {reg.sessions?.start_time}–
                                    {reg.sessions?.end_time}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-gray-400">
                              No registered classes.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

/* ============================================================
   Parent Card Component
============================================================ */

function ParentCard({
  title,
  parent,
  primary,
}: {
  title: string;
  parent: any;
  primary?: boolean;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
          {title}
        </h3>

        {primary && (
          <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">
            Primary
          </span>
        )}
      </div>

      {parent ? (
        <div className="text-sm text-gray-700 space-y-1">
          <div className="font-medium text-gray-900">
            {parent.first_name} {parent.last_name}
          </div>
          <div>{parent.email}</div>
          <div className="text-gray-500">
            {parent.phone_number || "No phone listed"}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">None listed.</p>
      )}
    </div>
  );
}
