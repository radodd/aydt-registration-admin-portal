"use client";

import { useEffect, useState, useRef } from "react";
import {
  getClassWithSemester,
  getClassRegistrants,
  Registrant,
} from "@/queries/admin";
import { archiveClass } from "../actions/archiveClass";
import { updateClassMeta, ClassMetaUpdate } from "../actions/updateClassMeta";
import { initEmailForClass } from "../actions/initEmailForClass";
import { listTemplates } from "@/app/admin/emails/actions/listTemplates";
import { TemplateListRow } from "@/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassSession {
  id: string;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
}

interface Semester {
  id: string;
  name: string;
  status: string;
}

interface ClassDetail {
  id: string;
  semester_id: string;
  name: string;
  discipline: string;
  division: string;
  description: string | null;
  min_age: number | null;
  max_age: number | null;
  min_grade: number | null;
  max_grade: number | null;
  is_active: boolean;
  class_sessions: ClassSession[];
  semesters: Semester | Semester[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DIVISION_LABELS: Record<string, string> = {
  early_childhood: "Early Childhood",
  junior: "Junior",
  senior: "Senior",
  competition: "Competition",
};

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function formatTime(t: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSemester(cls: ClassDetail): Semester | null {
  if (!cls.semesters) return null;
  return Array.isArray(cls.semesters) ? cls.semesters[0] : cls.semesters;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
        active ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RegistrationStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-green-100 text-green-700",
    pending_payment: "bg-yellow-100 text-yellow-700",
    pending: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${
        map[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

type ModalStep = "choose" | "pick-template";

function EmailClassModal({
  cls,
  semester,
  onClose,
}: {
  cls: ClassDetail;
  semester: Semester | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("choose");
  const [templates, setTemplates] = useState<TemplateListRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const subject = `${cls.name}${semester ? ` — ${semester.name}` : ""}`;
      const { emailId } = await initEmailForClass(cls.id, subject, {
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
      const subject = `${cls.name}${semester ? ` — ${semester.name}` : ""}`;
      const { emailId } = await initEmailForClass(cls.id, subject);
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
                Email Class
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Recipients will be pre-populated with all registrants in this
                class.
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
                onClick={() => { setStep("choose"); setError(null); }}
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

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ClassMetaUpdate>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Archive state
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    (async () => {
      const [classData, regData] = await Promise.all([
        getClassWithSemester(id),
        getClassRegistrants(id),
      ]);
      setCls(classData as ClassDetail | null);
      setRegistrants(regData);
      setLoading(false);
    })();
  }, [id]);

  const semester = cls ? getSemester(cls) : null;
  const isLocked =
    semester?.status === "published" && registrants.length > 0;

  // Capacity totals
  const totalCapacity = cls?.class_sessions
    .map((s) => s.capacity ?? 0)
    .reduce((a, b) => a + b, 0) ?? 0;
  const totalEnrolled = registrants.filter(
    (r) => r.status === "confirmed"
  ).length;
  const capacityPct =
    totalCapacity > 0 ? Math.min(100, (totalEnrolled / totalCapacity) * 100) : 0;

  const sortedSessions = cls
    ? [...cls.class_sessions].sort(
        (a, b) =>
          DAY_ORDER.indexOf(
            a.day_of_week.charAt(0).toUpperCase() + a.day_of_week.slice(1)
          ) -
          DAY_ORDER.indexOf(
            b.day_of_week.charAt(0).toUpperCase() + b.day_of_week.slice(1)
          )
      )
    : [];

  function startEditing() {
    if (!cls) return;
    setEditForm({
      name: cls.name,
      description: cls.description ?? "",
      min_age: cls.min_age,
      max_age: cls.max_age,
      min_grade: cls.min_grade,
      max_grade: cls.max_grade,
    });
    setEditing(true);
    setSaveError(null);
  }

  async function handleSave() {
    if (!cls) return;
    setSaving(true);
    setSaveError(null);
    const { success, error } = await updateClassMeta(cls.id, editForm);
    if (!success) {
      setSaveError(error ?? "Failed to save");
      setSaving(false);
      return;
    }
    setCls((prev) =>
      prev
        ? {
            ...prev,
            ...editForm,
            name: editForm.name ?? prev.name,
            description: editForm.description ?? prev.description,
          }
        : prev
    );
    setEditing(false);
    setSaving(false);
  }

  async function handleArchive() {
    if (!cls) return;
    setArchiving(true);
    setArchiveError(null);
    const { success, error } = await archiveClass(cls.id, cls.is_active);
    if (!success) {
      setArchiveError(error ?? "Failed to update");
      setArchiving(false);
      return;
    }
    setCls((prev) => (prev ? { ...prev, is_active: !prev.is_active } : prev));
    setArchiving(false);
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <Link
          href="/admin/classes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          ← All Classes
        </Link>
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500 text-sm">
          Loading…
        </div>
      </main>
    );
  }

  if (!cls) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <Link
          href="/admin/classes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          ← All Classes
        </Link>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500 text-sm">
          Class not found.
        </div>
      </main>
    );
  }

  return (
    <>
      {showEmailModal && (
        <EmailClassModal
          cls={cls}
          semester={semester}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Back */}
        <Link
          href="/admin/classes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          ← All Classes
        </Link>

        {/* Lock banner */}
        {isLocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>Read-only:</strong> This class belongs to a published
            semester with active registrations. Editing and archiving are
            disabled.
          </div>
        )}

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {editing ? (
              <input
                type="text"
                value={editForm.name ?? ""}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                className="text-3xl font-semibold text-slate-600 border-b border-indigo-400 focus:outline-none bg-transparent w-full"
              />
            ) : (
              <h1 className="text-3xl font-semibold text-gray-900">
                {cls.name}
              </h1>
            )}
            <p className="text-sm text-gray-500 capitalize">
              {cls.discipline.replace(/_/g, " ")} ·{" "}
              {DIVISION_LABELS[cls.division] ?? cls.division}
            </p>
            {semester && (
              <Link
                href={`/admin/semesters/${semester.id}/edit?step=sessions`}
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 transition"
              >
                Semester: {semester.name} →
              </Link>
            )}
          </div>
          <StatusBadge active={cls.is_active} />
        </header>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowEmailModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Email Class
          </button>

          {!isLocked && (
            <>
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 transition"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={startEditing}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition"
                >
                  Edit Details
                </button>
              )}

              <button
                onClick={handleArchive}
                disabled={archiving}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition disabled:opacity-50 ${
                  cls.is_active
                    ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                    : "border-green-200 text-green-700 hover:bg-green-50"
                }`}
              >
                {archiving
                  ? "…"
                  : cls.is_active
                  ? "Archive Class"
                  : "Restore Class"}
              </button>
            </>
          )}
        </div>

        {/* Errors */}
        {saveError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}
        {archiveError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {archiveError}
          </div>
        )}

        {/* Info grid */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Class Details
          </h2>
          <form ref={formRef} className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {/* Discipline — read-only */}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Discipline
              </p>
              <p className="text-sm font-medium text-gray-800 capitalize">
                {cls.discipline.replace(/_/g, " ")}
              </p>
            </div>

            {/* Division — read-only */}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Division
              </p>
              <p className="text-sm font-medium text-gray-800">
                {DIVISION_LABELS[cls.division] ?? cls.division}
              </p>
            </div>

            {/* Min age */}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Min Age
              </p>
              {editing ? (
                <input
                  type="number"
                  value={editForm.min_age ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      min_age: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full text-sm text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              ) : (
                <p className="text-sm font-medium text-gray-800">
                  {cls.min_age ?? "—"}
                </p>
              )}
            </div>

            {/* Max age */}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Max Age
              </p>
              {editing ? (
                <input
                  type="number"
                  value={editForm.max_age ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      max_age: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full text-sm text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              ) : (
                <p className="text-sm font-medium text-gray-800">
                  {cls.max_age ?? "—"}
                </p>
              )}
            </div>

            {/* Min grade */}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Min Grade
              </p>
              {editing ? (
                <input
                  type="number"
                  value={editForm.min_grade ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      min_grade: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                  className="w-full text-sm text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              ) : (
                <p className="text-sm font-medium text-gray-800">
                  {cls.min_grade ?? "—"}
                </p>
              )}
            </div>

            {/* Max grade */}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Max Grade
              </p>
              {editing ? (
                <input
                  type="number"
                  value={editForm.max_grade ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      max_grade: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                  className="w-full text-sm text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              ) : (
                <p className="text-sm font-medium text-gray-800">
                  {cls.max_grade ?? "—"}
                </p>
              )}
            </div>

            {/* Description — full width */}
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                Description
              </p>
              {editing ? (
                <textarea
                  value={editForm.description ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full text-sm text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              ) : (
                <p className="text-sm text-gray-800">
                  {cls.description ?? "—"}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Spots remaining */}
        {totalCapacity > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Enrollment
              </h2>
              <span className="text-sm text-gray-500">
                {totalEnrolled} enrolled /{" "}
                {totalCapacity - totalEnrolled >= 0
                  ? totalCapacity - totalEnrolled
                  : 0}{" "}
                spots remaining
              </span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capacityPct >= 90
                    ? "bg-red-500"
                    : capacityPct >= 70
                    ? "bg-amber-500"
                    : "bg-indigo-500"
                }`}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {Math.round(capacityPct)}% filled ({totalCapacity} total spots)
            </p>
          </div>
        )}

        {/* Registrant roster */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Registrant Roster
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({registrants.length})
            </span>
          </h2>
          {registrants.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-500">
              No registrations yet.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Dancer</th>
                    <th className="px-5 py-3 text-left font-medium">Parent</th>
                    <th className="px-5 py-3 text-left font-medium">Email</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Session</th>
                    <th className="px-5 py-3 text-left font-medium">
                      Enrolled
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {registrants.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {r.dancerName}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {r.parentName ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {r.parentEmail ? (
                          <a
                            href={`mailto:${r.parentEmail}`}
                            className="hover:text-indigo-600 transition"
                          >
                            {r.parentEmail}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <RegistrationStatusBadge status={r.status} />
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {r.sessionLabel}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {new Date(r.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Sessions table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Class Sessions
          </h2>
          {sortedSessions.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-500">
              No sessions defined for this class.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Day</th>
                    <th className="px-5 py-3 text-left font-medium">Time</th>
                    <th className="px-5 py-3 text-left font-medium">
                      Start Date
                    </th>
                    <th className="px-5 py-3 text-left font-medium">
                      End Date
                    </th>
                    <th className="px-5 py-3 text-left font-medium">
                      Capacity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-medium text-gray-900 capitalize">
                        {s.day_of_week}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {formatTime(s.start_time)} – {formatTime(s.end_time)}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {formatDate(s.start_date)}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {formatDate(s.end_date)}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {s.capacity ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer link */}
        <div className="pt-2">
          <Link
            href={`/admin/semesters/${cls.semester_id}/edit?step=sessions`}
            className="inline-flex items-center px-5 py-2.5 rounded-2xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            Edit in Semester Editor →
          </Link>
        </div>
      </main>
    </>
  );
}
