"use client";

import { Dancer, User } from "@/types";
import Link from "next/link";
import { useState } from "react";
import AddDancerForm from "./AddDancerForm";
interface FamilyProfileCardProps {
  user: User;
  dancers?: Dancer[] | null;
}
export const FamilyProfileCard = ({
  user,
  dancers,
}: FamilyProfileCardProps) => {
  //   const [user, setUser] = useState<User>();
  // const [familyData, setFamilyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  return (
    <main className="max-w-4xl mx-auto p-6 text-black">
      <h1 className="text-3xl font-bold mb-6">
        {user?.first_name} {user?.last_name}’s Family Dashboard
      </h1>

      <AddDancerForm familyId={user.family_id} />

      {dancers?.map((dancer) => (
        <section key={dancer.id} className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {dancer.first_name} {dancer.last_name}
          </h2>

          {dancer.registrations?.length ? (
            <ul className="space-y-3">
              {dancer.registrations.map((r) => (
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
};
