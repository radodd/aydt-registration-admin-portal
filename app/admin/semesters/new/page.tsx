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

/** Extract a 4-digit year from a semester name, e.g. "Fall 2025" → 2025. */
function detectYear(name: string): number | null {
  const match = name.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

export default function NewSemesterPage() {
  const router = useRouter();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [cloneModal, setCloneModal] = useState<{
    semester: Semester;
    sourceYear: number | null;
    targetYear: number;
  } | null>(null);

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

  function openCloneModal(semester: Semester) {
    const sourceYear = detectYear(semester.name);
    const targetYear = sourceYear ? sourceYear + 1 : new Date().getFullYear();
    setCloneModal({ semester, sourceYear, targetYear });
  }

  async function handleCloneConfirm() {
    if (!cloneModal) return;
    const { semester, sourceYear, targetYear } = cloneModal;
    const yearShift = sourceYear != null ? targetYear - sourceYear : 0;
    setLoadingId(semester.id);
    setCloneModal(null);
    try {
      const newId = await cloneSemester(semester.id, yearShift);
      router.push(`/admin/semesters/${newId}/edit?step=details`);
    } catch (err) {
      console.error("[handleCloneConfirm] cloneSemester failed:", err);
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
                onClick={() => openCloneModal(s)}
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

      {/* Date Adjustment Modal */}
      {cloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Adjust Offering Dates
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                All session dates, payment due dates, and registration windows
                will be shifted to the target year.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 p-4">
                <div className="text-sm text-gray-500 shrink-0">Source</div>
                <div className="font-medium text-gray-900 truncate">
                  {cloneModal.semester.name}
                </div>
                {cloneModal.sourceYear && (
                  <div className="ml-auto shrink-0 text-xs font-medium text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">
                    {cloneModal.sourceYear}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 shrink-0">
                  Target Year
                </label>
                <input
                  type="number"
                  min={2020}
                  max={2099}
                  value={cloneModal.targetYear}
                  onChange={(e) =>
                    setCloneModal((m) =>
                      m
                        ? {
                            ...m,
                            targetYear:
                              parseInt(e.target.value, 10) || m.targetYear,
                          }
                        : m,
                    )
                  }
                  className="w-28 rounded-lg border text-slate-600 border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {cloneModal.sourceYear != null && (
                  <span className="text-sm text-gray-400">
                    (shift +{cloneModal.targetYear - cloneModal.sourceYear} yr)
                  </span>
                )}
              </div>

              {cloneModal.sourceYear == null && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No year detected in the semester name — dates will not be
                  shifted unless you set a target year above and the source
                  semester has a detected base year.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCloneModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCloneConfirm}
                className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Clone &amp; Adjust →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
