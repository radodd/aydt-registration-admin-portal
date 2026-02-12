"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Replace with your Supabase client
import { createClient } from "@/utils/supabase/client";
import { deleteSemester } from "./actions/deleteSemester";
import { r } from "happy-dom/lib/PropertySymbol";
import { StatusBadge } from "@/app/components/SemesterStatusBadge";

type Semester = {
  id: string;
  name: string;
  status: string;
  publish_at: string | null;
  created_at: string;
};

export default function SemesterListPage() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  async function handleDelete(id: string) {
    console.log("🖱 Delete button clicked for:", id);

    const confirmed = confirm("Are you sure you want to delete this semester?");

    console.log("User confirmed:", confirmed);

    if (!confirmed) return;

    try {
      setDeletingId(id);
      console.log("🚀 Calling server action...");
      // Optimistically remove from UI
      setSemesters((prev) => prev.filter((s) => s.id !== id));

      const result = await deleteSemester(id);

      console.log("🎉 Server action result:", result);
    } catch (err) {
      console.error("🔥 Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Semesters
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage and publish academic semesters.
            </p>
          </div>

          <button
            onClick={() => router.push("/admin/semesters/new")}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
          >
            + Create New Semester
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-sm text-gray-500">Loading semesters...</div>
        ) : semesters.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-500">No semesters found.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {semesters.map((s) => {
              const isDeleting = deletingId === s.id;

              return (
                <li
                  key={s.id}
                  className="border border-gray-200 rounded-xl p-5 flex justify-between items-center hover:border-gray-300 transition"
                >
                  {/* Semester Info */}
                  <div className="space-y-1">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <StatusBadge status={s.status} />
                    <div className="text-sm text-gray-500">
                      {s.publish_at
                        ? `Published: ${new Date(
                            s.publish_at,
                          ).toLocaleDateString()}`
                        : "Unpublished"}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => router.push(`/admin/semesters/${s.id}`)}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
                    >
                      View
                    </button>

                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={isDeleting}
                      className="text-sm font-medium text-red-600 hover:text-red-700 transition disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
