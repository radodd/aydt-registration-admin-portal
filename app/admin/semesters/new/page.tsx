"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";
import { createSemesterDraft } from "../actions/createSemesterDraft";
import { cloneSemester } from "../actions/cloneSemester";
import { deleteSemester } from "../actions/deleteSemester";
import { archiveSemester } from "../actions/archiveSemester";

type SemesterRaw = {
  id: string;
  name: string;
  status: string;
  publish_at: string | null;
  published_at: string | null;
  created_at: string;
};

type SemesterWithStats = SemesterRaw & {
  classCount: number;
  sessionCount: number;
  enrolledCount: number;
  dateRange: string | null;
  regWindow: string | null;
  publishedInfo: string | null;
};

type ViewMode = "active" | "all";

function detectYear(name: string): number | null {
  const match = name.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function formatDateLocal(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts);
}

function formatDateRange(start: string, end: string): string {
  const startStr = formatDateLocal(start, { month: "short", day: "numeric" });
  const endStr = formatDateLocal(end, { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function formatRegWindow(open: string, close: string): string {
  const openStr = new Date(open).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const closeStr = new Date(close).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${openStr} – ${closeStr}`;
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NewSemesterPage() {
  const router = useRouter();
  const [semesters, setSemesters] = useState<SemesterWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archiveModal, setArchiveModal] = useState<SemesterWithStats | null>(null);
  const [cloneModal, setCloneModal] = useState<{
    semester: SemesterRaw;
    sourceYear: number | null;
    targetYear: number;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const supabase = createClient();

      const { data: semestersRaw } = await supabase
        .from("semesters")
        .select("id, name, status, publish_at, published_at, created_at")
        .order("created_at", { ascending: false });

      if (!semestersRaw || semestersRaw.length === 0) {
        setSemesters([]);
        setLoading(false);
        return;
      }

      const semesterIds = semestersRaw.map((s) => s.id);

      const [{ data: classRows }, { data: sessionRows }, { data: scheduleRows }] =
        await Promise.all([
          supabase.from("classes").select("semester_id").in("semester_id", semesterIds),
          supabase
            .from("class_meetings")
            .select("id, semester_id")
            .in("semester_id", semesterIds),
          supabase
            .from("class_sections")
            .select(
              "id, semester_id, start_date, end_date, registration_open_at, registration_close_at",
            )
            .in("semester_id", semesterIds),
        ]);

      const scheduleIds = (scheduleRows ?? []).map((s) => s.id);
      const sessionIds = (sessionRows ?? []).map((s) => s.id);

      const [{ data: schedEnrolls }, { data: sessionRegs }] = await Promise.all([
        scheduleIds.length
          ? supabase
              .from("section_enrollments")
              .select("section_id")
              .in("section_id", scheduleIds)
              .neq("status", "cancelled")
          : Promise.resolve({ data: [] as { section_id: string }[] }),
        sessionIds.length
          ? supabase
              .from("meeting_enrollments")
              .select("meeting_id")
              .in("meeting_id", sessionIds)
              .in("status", ["confirmed", "pending"])
          : Promise.resolve({ data: [] as { meeting_id: string }[] }),
      ]);

      // Build maps
      const classCountMap: Record<string, number> = {};
      for (const row of classRows ?? []) {
        classCountMap[row.semester_id] = (classCountMap[row.semester_id] ?? 0) + 1;
      }

      const sessionCountMap: Record<string, number> = {};
      const sessionSemMap: Record<string, string> = {};
      for (const row of sessionRows ?? []) {
        sessionCountMap[row.semester_id] = (sessionCountMap[row.semester_id] ?? 0) + 1;
        sessionSemMap[row.id] = row.semester_id;
      }

      const scheduleSemMap: Record<string, string> = {};
      const minStartMap: Record<string, string> = {};
      const maxEndMap: Record<string, string> = {};
      const minRegOpenMap: Record<string, string> = {};
      const maxRegCloseMap: Record<string, string> = {};
      for (const row of scheduleRows ?? []) {
        const sid = row.semester_id;
        scheduleSemMap[row.id] = sid;
        if (row.start_date && (!minStartMap[sid] || row.start_date < minStartMap[sid]))
          minStartMap[sid] = row.start_date;
        if (row.end_date && (!maxEndMap[sid] || row.end_date > maxEndMap[sid]))
          maxEndMap[sid] = row.end_date;
        if (
          row.registration_open_at &&
          (!minRegOpenMap[sid] || row.registration_open_at < minRegOpenMap[sid])
        )
          minRegOpenMap[sid] = row.registration_open_at;
        if (
          row.registration_close_at &&
          (!maxRegCloseMap[sid] || row.registration_close_at > maxRegCloseMap[sid])
        )
          maxRegCloseMap[sid] = row.registration_close_at;
      }

      const enrollMap: Record<string, number> = {};
      for (const row of schedEnrolls ?? []) {
        const semId = scheduleSemMap[row.section_id];
        if (semId) enrollMap[semId] = (enrollMap[semId] ?? 0) + 1;
      }
      for (const row of sessionRegs ?? []) {
        const semId = sessionSemMap[row.meeting_id];
        if (semId) enrollMap[semId] = (enrollMap[semId] ?? 0) + 1;
      }

      const withStats: SemesterWithStats[] = semestersRaw.map((s) => {
        const startDate = minStartMap[s.id];
        const endDate = maxEndMap[s.id];
        const regOpen = minRegOpenMap[s.id];
        const regClose = maxRegCloseMap[s.id];

        let publishedInfo: string | null = null;
        if (s.status === "published" && s.published_at)
          publishedInfo = `Published: ${formatTs(s.published_at)}`;
        else if (s.status === "scheduled" && s.publish_at)
          publishedInfo = `Published: Scheduled ${formatTs(s.publish_at)}`;

        return {
          ...s,
          classCount: classCountMap[s.id] ?? 0,
          sessionCount: sessionCountMap[s.id] ?? 0,
          enrolledCount: enrollMap[s.id] ?? 0,
          dateRange: startDate && endDate ? formatDateRange(startDate, endDate) : null,
          regWindow: regOpen && regClose ? formatRegWindow(regOpen, regClose) : null,
          publishedInfo,
        };
      });

      setSemesters(withStats);
      setLoading(false);
    }

    fetchData();
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

  function openCloneModal(semester: SemesterWithStats) {
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

  async function handleDelete(id: string) {
    const confirmed = confirm("Are you sure you want to delete this semester?");
    if (!confirmed) return;
    setDeletingId(id);
    setSemesters((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSemester(id);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleArchiveConfirm() {
    if (!archiveModal) return;
    const id = archiveModal.id;
    setArchiveModal(null);
    setDeletingId(id);
    setSemesters((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "archived" } : s)),
    );
    try {
      await archiveSemester(id);
    } catch (err) {
      console.error("Archive failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  const q = search.trim().toLowerCase();

  const baseGroups: { label: string; status: string }[] = [
    { label: "Published", status: "published" },
    { label: "Scheduled", status: "scheduled" },
    { label: "Drafts", status: "draft" },
  ];

  const allGroups =
    viewMode === "all"
      ? [...baseGroups, { label: "Archived", status: "archived" }]
      : baseGroups;

  const visibleGroups = allGroups
    .map((g) => ({
      ...g,
      items: semesters.filter(
        (s) =>
          s.status === g.status && (!q || s.name.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const anyLoading = loadingId !== null || deletingId !== null;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
          Create New Semester
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Start from scratch or duplicate an existing semester.
        </p>
      </div>

      {/* Start Blank */}
      <button
        onClick={handleBlank}
        disabled={anyLoading}
        className="w-full text-left border border-neutral-200 rounded-2xl p-6 hover:border-primary-400 hover:bg-primary-50/40 transition group disabled:opacity-60 disabled:cursor-not-allowed bg-white"
      >
        <div className="flex justify-between items-center">
          <div>
            <div className="font-medium text-neutral-900 group-hover:text-primary-700 transition">
              Start Blank
            </div>
            <div className="text-sm text-neutral-500 mt-1">
              Create a completely new semester configuration.
            </div>
          </div>
          <div className="text-sm font-medium text-primary-600">
            {loadingId === "blank" ? "Creating..." : "Create →"}
          </div>
        </div>
      </button>

      {/* Template section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
            Use Existing Semester as Template
          </h2>
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 gap-1">
            {(["active", "all"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={[
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                  viewMode === v
                    ? "bg-white text-neutral-900 shadow-sm border border-neutral-200"
                    : "text-neutral-500 hover:text-neutral-700",
                ].join(" ")}
              >
                {v === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search semesters…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
        />

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-neutral-500">Loading semesters…</p>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-neutral-300 rounded-2xl">
            <p className="text-sm text-neutral-500">
              {q ? `No semesters match "${search}".` : "No semesters found."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <div key={group.status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-700">{group.label}</span>
                  <span className="text-xs font-medium text-neutral-400 bg-neutral-100 rounded-full px-2 py-0.5">
                    {group.items.length}
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map((s) => (
                    <SemesterCard
                      key={s.id}
                      semester={s}
                      anyLoading={anyLoading}
                      isCloning={loadingId === s.id}
                      isDeleting={deletingId === s.id}
                      onUseTemplate={() => openCloneModal(s)}
                      onEdit={() =>
                        router.push(`/admin/semesters/${s.id}/edit?step=details`)
                      }
                      onView={() => router.push(`/admin/semesters/${s.id}`)}
                      onArchive={() => setArchiveModal(s)}
                      onDelete={() => handleDelete(s.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archive confirmation modal */}
      {archiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Archive semester?</h2>
              <p className="text-sm text-neutral-500 mt-1">
                <span className="font-medium text-neutral-700">{archiveModal.name}</span> will be
                moved to the archive. Existing registrations are preserved, but the semester will
                no longer accept new sign-ups.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This action cannot be undone from this screen. Contact a developer to restore.
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setArchiveModal(null)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveConfirm}
                className="px-5 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition"
              >
                Yes, archive semester
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone modal */}
      {cloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Adjust Offering Dates</h2>
              <p className="text-sm text-neutral-500 mt-1">
                All session dates, payment due dates, and registration windows will be shifted to
                the target year.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-neutral-50 border border-neutral-200 p-4">
                <div className="text-sm text-neutral-500 shrink-0">Source</div>
                <div className="font-medium text-neutral-900 truncate">
                  {cloneModal.semester.name}
                </div>
                {cloneModal.sourceYear && (
                  <div className="ml-auto shrink-0 text-xs font-medium text-neutral-400 bg-neutral-200 rounded-full px-2 py-0.5">
                    {cloneModal.sourceYear}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-neutral-700 shrink-0">
                  Target Year
                </label>
                <input
                  type="number"
                  min={2020}
                  max={2099}
                  value={cloneModal.targetYear}
                  onChange={(e) =>
                    setCloneModal((m) =>
                      m ? { ...m, targetYear: parseInt(e.target.value, 10) || m.targetYear } : m,
                    )
                  }
                  className="w-28 rounded-lg border text-slate-600 border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                {cloneModal.sourceYear != null && (
                  <span className="text-sm text-neutral-400">
                    (shift +{cloneModal.targetYear - cloneModal.sourceYear} yr)
                  </span>
                )}
              </div>

              {cloneModal.sourceYear == null && (
                <p className="text-xs text-mauve-text bg-mauve/10 border border-mauve rounded-lg px-3 py-2">
                  No year detected in the semester name — dates will not be shifted unless you set
                  a target year above and the source semester has a detected base year.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCloneModal(null)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCloneConfirm}
                className="px-5 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
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

function SemesterCard({
  semester,
  anyLoading,
  isCloning,
  isDeleting,
  onUseTemplate,
  onEdit,
  onView,
  onArchive,
  onDelete,
}: {
  semester: SemesterWithStats;
  anyLoading: boolean;
  isCloning: boolean;
  isDeleting: boolean;
  onUseTemplate: () => void;
  onEdit: () => void;
  onView: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const label = semester.status.charAt(0).toUpperCase() + semester.status.slice(1);

  return (
    <div
      className={[
        "bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 transition-opacity",
        isDeleting ? "opacity-40 pointer-events-none" : "",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[15px] text-neutral-900 truncate">
            {semester.name}
          </div>
          {semester.dateRange && (
            <div className="text-xs text-neutral-400 mt-0.5">{semester.dateRange}</div>
          )}
        </div>
        <Badge status={semester.status as BadgeStatus}>{label}</Badge>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 rounded-xl overflow-hidden border border-neutral-100 divide-x divide-neutral-100">
        {[
          { label: "CLASSES", value: semester.classCount },
          { label: "SESSIONS", value: semester.sessionCount },
          { label: "ENROLLED", value: semester.enrolledCount },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-3 text-center bg-neutral-50">
            <div className="text-lg font-semibold text-neutral-800 leading-none">{value}</div>
            <div className="text-[10px] text-neutral-400 tracking-wide mt-1 uppercase">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Meta */}
      {(semester.regWindow || semester.publishedInfo) && (
        <div className="space-y-0.5">
          {semester.regWindow && (
            <div className="text-xs text-neutral-500">Reg window: {semester.regWindow}</div>
          )}
          {semester.publishedInfo && (
            <div className="text-xs text-neutral-500">{semester.publishedInfo}</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
        <div className="flex items-center gap-1">
          <button
            onClick={onUseTemplate}
            disabled={anyLoading}
            className="text-sm font-medium bg-primary-800 hover:bg-primary-900 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCloning ? "Cloning…" : "Use Template"}
          </button>
          <button
            onClick={onEdit}
            disabled={anyLoading}
            className="text-sm text-neutral-600 hover:text-neutral-900 px-2 py-1.5 transition disabled:opacity-50"
          >
            Edit
          </button>
          <button
            onClick={onView}
            disabled={anyLoading}
            className="text-sm text-neutral-600 hover:text-neutral-900 px-2 py-1.5 transition disabled:opacity-50"
          >
            View
          </button>
        </div>
        {semester.status === "published" || semester.status === "scheduled" ? (
          <button
            onClick={onArchive}
            disabled={anyLoading}
            className="text-sm text-amber-600 hover:text-amber-800 transition disabled:opacity-50"
          >
            Archive
          </button>
        ) : (
          <button
            onClick={onDelete}
            disabled={anyLoading}
            className="text-sm text-red-500 hover:text-red-700 transition disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
