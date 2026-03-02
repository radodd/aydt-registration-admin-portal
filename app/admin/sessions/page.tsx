"use client";

import { useEffect, useState } from "react";
import { getClasses } from "@/queries/admin";
import Link from "next/link";

interface ClassWithSessions {
  id: string;
  semester_id: string;
  name: string;
  discipline: string;
  division: string;
  level: string | null;
  is_active: boolean;
  class_sessions: {
    id: string;
    day_of_week: string;
    start_time: string | null;
    end_time: string | null;
    start_date: string | null;
    end_date: string | null;
    capacity: number | null;
  }[];
}

const DIVISION_LABELS: Record<string, string> = {
  early_childhood: "Early Childhood",
  junior: "Junior",
  senior: "Senior",
  competition: "Competition",
};

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassWithSessions[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await getClasses();
      setClasses(data as ClassWithSessions[]);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">All Classes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Read-only overview of all classes across all semesters. To create or
            edit classes, open the semester editor and navigate to the
            &ldquo;Classes &amp; Sessions&rdquo; step.
          </p>
        </div>
        <Link
          href="/admin/semesters"
          className="inline-flex items-center px-5 py-2.5 rounded-2xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          Manage Semesters
        </Link>
      </header>

      {/* Notice */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <strong>Phase 1 update:</strong> Classes are now managed within each
        semester editor (Classes &amp; Sessions step). The global session pool
        has been replaced by semester-owned classes with per-day time slots.
      </div>

      {/* Classes list */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500 text-sm">
          Loading classes…
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500 text-sm">
          No classes found. Create classes inside a semester editor.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-6 py-4 text-left font-medium">Name</th>
                <th className="px-6 py-4 text-left font-medium">Discipline</th>
                <th className="px-6 py-4 text-left font-medium">Division</th>
                <th className="px-6 py-4 text-left font-medium">Level</th>
                <th className="px-6 py-4 text-left font-medium">Sessions</th>
                <th className="px-6 py-4 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {classes.map((cls) => (
                <tr key={cls.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {cls.name}
                  </td>
                  <td className="px-6 py-4 text-gray-600 capitalize">
                    {cls.discipline.replace(/_/g, " ")}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {DIVISION_LABELS[cls.division] ?? cls.division}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {cls.level ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {cls.class_sessions?.length ?? 0}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                        cls.is_active
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {cls.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
