"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { StatusBadge } from "@/app/components/SemesterStatusBadge";
import { createSemesterDraft } from "../actions/createSemesterDraft";
import { cloneSemester } from "../actions/cloneSemester";

type Semester = {
  id: string;
  name: string;
  status: string;
  publish_at: string | null;
  created_at: string;
};

export default function NewSemesterPage() {
  const router = useRouter();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSemesters() {
      const { data, error } = await createClient()
        .from("semesters")
        .select("id, name, status, publish_at, created_at")
        .order("created_at", { ascending: false });

      if (!error && data) setSemesters(data as Semester[]);
    }
    fetchSemesters();
  }, []);

  async function handleBlank() {
    setLoadingId("blank");
    try {
      const id = await createSemesterDraft();
      router.push(`/admin/semesters/${id}/edit?step=details`);
    } catch {
      setLoadingId(null);
    }
  }

  async function handleTemplate(sourceId: string) {
    setLoadingId(sourceId);
    try {
      const newId = await cloneSemester(sourceId);
      router.push(`/admin/semesters/${newId}/edit?step=details`);
    } catch {
      setLoadingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Create New Semester
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Start from scratch or duplicate an existing semester.
          </p>
        </div>

        {/* Blank Option */}
        <div>
          <button
            onClick={handleBlank}
            disabled={loadingId !== null}
            className="w-full text-left border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:bg-indigo-50/40 transition group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium text-gray-900 group-hover:text-indigo-700 transition">
                  Start Blank
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Create a completely new semester configuration.
                </div>
              </div>
              <div className="text-sm font-medium text-indigo-600">
                {loadingId === "blank" ? "Creating..." : "Create →"}
              </div>
            </div>
          </button>
        </div>

        {/* Template Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Use Existing Semester as Template
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {semesters.map((s) => (
              <button
                key={s.id}
                onClick={() => handleTemplate(s.id)}
                disabled={loadingId !== null}
                className="text-left border border-gray-200 rounded-2xl p-5 hover:border-indigo-400 hover:shadow-md transition group bg-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-medium text-gray-900 group-hover:text-indigo-700 transition truncate pr-2">
                      {s.name}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  {s.publish_at && (
                    <div className="text-xs text-gray-400">
                      Published {new Date(s.publish_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="mt-4 text-sm font-medium text-indigo-600">
                  {loadingId === s.id ? "Cloning..." : "Use Template →"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
