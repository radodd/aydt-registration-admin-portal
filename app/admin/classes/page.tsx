"use client";

import { useEffect, useState, useMemo } from "react";
import { getClasses } from "@/queries/admin";
import { initEmailForClasses } from "./actions/initEmailForClasses";
import { listTemplates } from "@/app/admin/emails/actions/listTemplates";
import { TemplateListRow } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

type SortKey = "name" | "discipline" | "division";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="ml-1 inline-flex flex-col leading-none text-[10px]">
      <span
        className={
          active && dir === "asc" ? "text-indigo-600" : "text-gray-400"
        }
      >
        ▲
      </span>
      <span
        className={
          active && dir === "desc" ? "text-indigo-600" : "text-gray-400"
        }
      >
        ▼
      </span>
    </span>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
}) {
  return (
    <th
      className="px-6 py-4 text-left font-medium cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon active={sortKey === col} dir={sortDir} />
    </th>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

type ModalStep = "choose" | "pick-template";

function EmailClassesModal({
  selectedClasses,
  onClose,
}: {
  selectedClasses: ClassWithSessions[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("choose");
  const [templates, setTemplates] = useState<TemplateListRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classIds = selectedClasses.map((c) => c.id);

  const defaultSubject = useMemo(() => {
    const names = selectedClasses.map((c) => c.name);
    if (names.length === 1) return names[0];
    if (names.length <= 3) return names.join(", ");
    return `${names.length} Classes — Update`;
  }, [selectedClasses]);

  async function goToTemplatePicker() {
    setTemplatesLoading(true);
    setError(null);
    try {
      const result = await listTemplates(0);
      setTemplates(result.data);
      setStep("pick-template");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function handleTemplate(template: TemplateListRow) {
    setSubmitting(true);
    setError(null);
    try {
      const { emailId } = await initEmailForClasses(classIds, defaultSubject, {
        bodyHtml: template.body_html,
        bodyJson: template.body_json,
      });
      router.push(`/admin/emails/${emailId}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  async function handleScratch() {
    setSubmitting(true);
    setError(null);
    try {
      const { emailId } = await initEmailForClasses(classIds, defaultSubject);
      router.push(`/admin/emails/${emailId}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">

        {/* Step: choose mode */}
        {step === "choose" && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Email Selected Classes
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {selectedClasses.length === 1
                  ? `Emailing registrants of "${selectedClasses[0].name}".`
                  : `Emailing registrants across ${selectedClasses.length} classes. Recipients will be deduplicated.`}
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={goToTemplatePicker}
                disabled={templatesLoading || submitting}
                className="w-full text-left rounded-xl border border-gray-200 px-4 py-4 hover:border-indigo-400 hover:bg-indigo-50/50 transition disabled:opacity-50 group"
              >
                <p className="font-medium text-gray-900 group-hover:text-indigo-700">
                  Use an existing template
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choose from your saved email templates
                </p>
                {templatesLoading && (
                  <p className="text-xs text-indigo-600 mt-1">
                    Loading templates…
                  </p>
                )}
              </button>

              <button
                onClick={handleScratch}
                disabled={templatesLoading || submitting}
                className="w-full text-left rounded-xl border border-gray-200 px-4 py-4 hover:border-indigo-400 hover:bg-indigo-50/50 transition disabled:opacity-50 group"
              >
                <p className="font-medium text-gray-900 group-hover:text-indigo-700">
                  Start from scratch
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Open the full email editor with a blank canvas
                </p>
                {submitting && (
                  <p className="text-xs text-indigo-600 mt-1">
                    Creating draft…
                  </p>
                )}
              </button>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                onClick={onClose}
                className="text-sm text-gray-500 hover:text-gray-800 transition"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Step: pick template */}
        {step === "pick-template" && (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setStep("choose");
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-700 transition"
                aria-label="Back"
              >
                ←
              </button>
              <h2 className="text-lg font-semibold text-gray-900">
                Choose a Template
              </h2>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No saved templates found.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplate(t)}
                    disabled={submitting}
                    className="w-full text-left rounded-xl border border-gray-200 px-4 py-3.5 hover:border-indigo-400 hover:bg-indigo-50/50 transition disabled:opacity-50 group"
                  >
                    <p className="font-medium text-sm text-gray-900 group-hover:text-indigo-700 truncate">
                      {t.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Subject: {t.subject}
                    </p>
                    {submitting && (
                      <p className="text-xs text-indigo-600 mt-1">
                        Creating draft…
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                onClick={onClose}
                className="text-sm text-gray-500 hover:text-gray-800 transition"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getClasses();
      setClasses(data as ClassWithSessions[]);
      setLoading(false);
    })();
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        let av = "";
        let bv = "";
        if (sortKey === "name") {
          av = a.name;
          bv = b.name;
        } else if (sortKey === "discipline") {
          av = a.discipline;
          bv = b.discipline;
        } else if (sortKey === "division") {
          av = a.division;
          bv = b.division;
        }
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [classes, search, sortKey, sortDir]);

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someFilteredSelected = filteredIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      // Deselect all filtered
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select all filtered
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedClasses = useMemo(
    () => classes.filter((c) => selected.has(c.id)),
    [classes, selected]
  );

  return (
    <>
      {showEmailModal && selectedClasses.length > 0 && (
        <EmailClassesModal
          selectedClasses={selectedClasses}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">
              All Classes
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Read-only overview of all classes across all semesters. To create
              or edit classes, open the semester editor and navigate to the
              &ldquo;Classes &amp; Sessions&rdquo; step.
            </p>
          </div>
          <Link
            href="/admin/semesters"
            className="shrink-0 inline-flex items-center px-5 py-2.5 rounded-2xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
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

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by class name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-600"
            />
          </div>
          {!loading && (
            <span className="text-sm text-gray-500">
              {filtered.length} {filtered.length === 1 ? "class" : "classes"}
            </span>
          )}
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
        ) : filtered.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500 text-sm">
            No classes match &ldquo;{search}&rdquo;.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs tracking-wide">
                <tr>
                  {/* Select-all checkbox */}
                  <th className="pl-5 pr-2 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            someFilteredSelected && !allFilteredSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <SortableTh
                    label="Name"
                    col="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Discipline"
                    col="discipline"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Division"
                    col="division"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-6 py-4 text-left font-medium">Level</th>
                  <th className="px-6 py-4 text-left font-medium">Sessions</th>
                  <th className="px-6 py-4 text-left font-medium">Status</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((cls) => {
                  const isSelected = selected.has(cls.id);
                  return (
                    <tr
                      key={cls.id}
                      className={`transition cursor-pointer ${
                        isSelected
                          ? "bg-indigo-50"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() => router.push(`/admin/classes/${cls.id}`)}
                    >
                      {/* Row checkbox */}
                      <td
                        className="pl-5 pr-2 py-4 w-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(cls.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(cls.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
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
                      <td className="px-6 py-4 text-right">
                        <span className="text-gray-400 text-xs">View →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-xl">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "class" : "classes"} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-gray-400 hover:text-white transition text-xs"
          >
            Clear
          </button>
          <button
            onClick={() => setShowEmailModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-400 transition"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Email Selected Classes
          </button>
        </div>
      )}
    </>
  );
}
