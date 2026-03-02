"use client";

import { Dancer, User } from "@/types";
import { useMemo } from "react";
import AddDancerForm from "./AddDancerForm";

interface FamilyProfileCardProps {
  user: User;
  dancers?: Dancer[] | null;
}

export const FamilyProfileCard = ({
  user,
  dancers,
}: FamilyProfileCardProps) => {
  const totalRegistrations = useMemo(() => {
    if (!dancers) return 0;
    return dancers.reduce((sum, d) => sum + (d.registrations?.length ?? 0), 0);
  }, [dancers]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
      {/* ============================================================
          Header
      ============================================================ */}
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
          Family Dashboard
        </h1>
        <p className="text-gray-500">
          {user.first_name} {user.last_name}
        </p>
      </header>

      {/* ============================================================
          Summary Cards
      ============================================================ */}
      <section className="grid sm:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Dancers</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">
            {dancers?.length ?? 0}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Registrations</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">
            {totalRegistrations}
          </p>
        </div>
      </section>

      {/* ============================================================
          Add Dancer Section
      ============================================================ */}
      <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Add Dancer</h2>
        </div>

        <AddDancerForm familyId={user.family_id} />
      </section>

      {/* ============================================================
          Dancers Section
      ============================================================ */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-gray-900">Dancers</h2>

        {!dancers || dancers.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-gray-500 text-sm">
            No dancers have been added yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {dancers.map((dancer) => (
              <div
                key={dancer.id}
                className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition"
              >
                {/* Dancer Name */}
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {dancer.first_name} {dancer.last_name}
                  </h3>
                </div>

                {/* Registrations */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    Registered Classes
                  </h4>

                  {!dancer.registrations ||
                  dancer.registrations.length === 0 ? (
                    <p className="text-sm text-gray-400">No registrations.</p>
                  ) : (
                    dancer.registrations.map((registration) => {
                      const session = registration.sessions;

                      return (
                        <div
                          key={registration.id}
                          className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                        >
                          <p className="font-medium text-gray-900">
                            {session?.title}
                          </p>

                          {session?.title && (
                            <p className="text-xs text-gray-500">
                              {session.title}
                            </p>
                          )}

                          <p className="text-xs text-gray-500">
                            {session?.start_date} – {session?.end_date}
                          </p>

                          {session?.location && (
                            <p className="text-xs text-gray-500">
                              {session.location}
                            </p>
                          )}

                          <div className="mt-3">
                            <span
                              className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                                registration.status === "pending"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : registration.status === "confirmed"
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {registration.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};
