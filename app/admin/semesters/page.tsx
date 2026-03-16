"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { deleteSemester } from "./actions/deleteSemester";
import { Button, Badge, PageHeader, SectionCard } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";

type Semester = {
  id: string;
  name: string;
  status: string;
  publish_at: string | null;
  created_at: string;
};

type View = "current" | "past";

export default function SemesterListPage() {
  const [view, setView] = useState<View>("current");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchSemesters() {
      setLoading(true);
      let query = createClient()
        .from("semesters")
        .select("*")
        .order("created_at", { ascending: false });

      if (view === "current") {
        query = query.neq("status", "archived");
      } else {
        query = query.eq("status", "archived");
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching semesters:", error);
        setLoading(false);
        return;
      }

      setSemesters(data as Semester[]);
      setLoading(false);
    }

    fetchSemesters();
  }, [view]);

  async function handleDelete(id: string) {
    const confirmed = confirm("Are you sure you want to delete this semester?");
    if (!confirmed) return;

    try {
      setDeletingId(id);
      setSemesters((prev) => prev.filter((s) => s.id !== id));
      await deleteSemester(id);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Semesters"
        subtitle="Manage and publish academic semesters."
        action={
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push("/admin/semesters/new")}
          >
            <Plus size={15} />
            Create New Semester
          </Button>
        }
      />

      <SectionCard
        action={
          /* Segmented toggle */
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 gap-1">
            {(["current", "past"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                  view === v
                    ? "bg-white text-neutral-900 shadow-sm border border-neutral-200"
                    : "text-neutral-500 hover:text-neutral-700",
                ].join(" ")}
              >
                {v === "current" ? "Current Seasons" : "Past Seasons"}
              </button>
            ))}
          </div>
        }
        flush
      >
        {loading ? (
          <div className="px-6 py-10 text-center">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-neutral-500">Loading semesters…</p>
          </div>
        ) : semesters.length === 0 ? (
          <div className="px-6 py-10 text-center border border-dashed border-neutral-300 rounded-lg m-4">
            <p className="text-sm text-neutral-500">
              {view === "current"
                ? "No active or upcoming semesters."
                : "No archived semesters."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {semesters.map((s) => {
              const isDeleting = deletingId === s.id;
              const label = s.status.charAt(0).toUpperCase() + s.status.slice(1);

              return (
                <li
                  key={s.id}
                  className="px-6 py-4 flex justify-between items-center hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{s.name}</p>
                    </div>
                    <Badge status={s.status as BadgeStatus}>{label}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/admin/semesters/${s.id}`)}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => handleDelete(s.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
