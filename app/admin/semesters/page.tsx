"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Replace with your Supabase client
import { createClient } from "@/utils/supabase/client";

type Semester = {
  id: string;
  name: string;
  publish_at: string | null;
  created_at: string;
};

export default function SemesterListPage() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchSemesters() {
      setLoading(true);
      const { data, error } = await createClient()
        .from("semesters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching semesters:", error);
        setLoading(false);
        return;
      }

      setSemesters(data as Semester[]);
      setLoading(false);
    }

    fetchSemesters();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 text-slate-800">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Semesters</h1>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => router.push("/admin/semesters/new")}
        >
          + Create New Semester
        </button>
      </div>

      {loading ? (
        <p>Loading semesters...</p>
      ) : semesters.length === 0 ? (
        <p>No semesters found.</p>
      ) : (
        <ul className="space-y-4">
          {semesters.map((s) => (
            <li
              key={s.id}
              className="p-4 border rounded flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-gray-500 text-sm">
                  {s.publish_at
                    ? `Published: ${new Date(s.publish_at).toLocaleDateString()}`
                    : "Unpublished"}
                </p>
              </div>
              <button
                className="text-blue-600 underline"
                onClick={() => router.push(`/admin/semesters/${s.id}`)}
              >
                View
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
