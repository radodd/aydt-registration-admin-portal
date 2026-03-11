"use client";

import type { Dancer, User } from "@/types";
import { ParentInfoCard } from "./ParentInfoCard";
import { DancerCard } from "./DancerCard";
import AddDancerForm from "./AddDancerForm";

interface FamilyProfileCardProps {
  user: User;
  dancers?: Dancer[] | null;
}

export const FamilyProfileCard = ({
  user,
  dancers,
}: FamilyProfileCardProps) => {
  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          My Profile
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your contact info and dancers.
        </p>
      </header>

      {/* Parent / Guardian */}
      <ParentInfoCard user={user} />

      {/* Dancers */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Dancers</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Dancer info is used to pre-fill registration forms.
          </p>
        </div>

        {!dancers || dancers.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-sm text-gray-400">
            No dancers added yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {dancers.map((dancer) => (
              <DancerCard key={dancer.id} dancer={dancer} />
            ))}
          </div>
        )}

        {/* Add dancer */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Add a Dancer
          </h3>
          <AddDancerForm familyId={user.family_id} />
        </div>
      </section>
    </main>
  );
};
