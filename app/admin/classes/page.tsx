"use client";

import { Suspense, useEffect, useState, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getClasses,
  getClassWithSemester,
  getClassRegistrants,
  type Registrant,
} from "@/queries/admin";
import { archiveClass } from "./actions/archiveClass";
import { cancelClass } from "@/app/admin/semesters/actions/cancelClass";
import { cancelEntireClass } from "./actions/cancelEntireClass";
import { updateClassMeta, type ClassMetaUpdate } from "./actions/updateClassMeta";
import { initEmailForClass } from "./actions/initEmailForClass";
import { listTemplates } from "@/app/admin/emails/actions/listTemplates";
import { assignInstructorToSession } from "./actions/assignInstructor";
import { removeInstructorFromSession } from "./actions/removeInstructor";
import type { TemplateListRow } from "@/types";
import type { SessionInstructorAssignment, InstructorRow } from "@/queries/admin";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassSession {
  id: string;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
}

interface ClassListItem {
  id: string;
  name: string;
  discipline: string;
  division: string;
  is_active: boolean;
  semester_id: string;
  class_meetings: ClassSession[];
}

interface ClassDetail extends ClassListItem {
  description: string | null;
  min_age: number | null;
  max_age: number | null;
  min_grade: number | null;
  max_grade: number | null;
  /** Meeting-plan #5: per-class manual-waitlist toggle. */
  waitlist_enabled: boolean | null;
  semesters:
    | { id: string; name: string; status: string }
    | { id: string; name: string; status: string }[]
    | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIVISION_LABELS: Record<string, string> = {
  early_childhood: "Early Childhood",
  junior: "Junior",
  senior: "Senior",
  competition: "Competition",
};

const DAY_ORDER = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "ballet", label: "Ballet" },
  { key: "tap", label: "Tap" },
  { key: "hip_hop", label: "Hip Hop" },
  { key: "junior", label: "Junior" },
  { key: "senior", label: "Senior" },
  { key: "competition", label: "Comp" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getSemesterFromDetail(
  detail: ClassDetail
): { id: string; name: string; status: string } | null {
  if (!detail.semesters) return null;
  return Array.isArray(detail.semesters)
    ? detail.semesters[0]
    : detail.semesters;
}

function matchesChip(cls: ClassListItem, key: string): boolean {
  if (key === "all") return true;
  if (key === "junior") return cls.division === "junior";
  if (key === "senior") return cls.division === "senior";
  if (key === "competition") return cls.division === "competition";
  const disc = cls.discipline.toLowerCase().replace(/\s+/g, "_");
  return disc === key || disc.includes(key.replace(/-/g, "_"));
}

function totalCapacity(cls: ClassListItem): number {
  return cls.class_meetings.reduce((sum, s) => sum + (s.capacity ?? 0), 0);
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

type ModalStep = "choose" | "pick-template";

function EmailClassModal({
  cls,
  semester,
  onClose,
}: {
  cls: ClassDetail;
  semester: { id: string; name: string; status: string } | null;
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
        {step === "choose" && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Email Class</h2>
              <p className="text-sm text-neutral-500 mt-1">
                Recipients will be pre-populated with all registrants in this class.
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
                className="w-full text-left rounded-xl border border-neutral-200 px-4 py-4 hover:border-primary-400 hover:bg-primary-50/50 transition disabled:opacity-50 group"
              >
                <p className="font-medium text-neutral-900 group-hover:text-primary-700">
                  Use an existing template
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Choose from your saved email templates
                </p>
                {templatesLoading && (
                  <p className="text-xs text-primary-600 mt-1">Loading templates…</p>
                )}
              </button>
              <button
                onClick={handleScratch}
                disabled={templatesLoading || submitting}
                className="w-full text-left rounded-xl border border-neutral-200 px-4 py-4 hover:border-primary-400 hover:bg-primary-50/50 transition disabled:opacity-50 group"
              >
                <p className="font-medium text-neutral-900 group-hover:text-primary-700">
                  Start from scratch
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Open the full email editor with a blank canvas
                </p>
                {submitting && (
                  <p className="text-xs text-primary-600 mt-1">Creating draft…</p>
                )}
              </button>
            </div>
            <div className="pt-1 flex justify-end">
              <button
                onClick={onClose}
                className="text-sm text-neutral-500 hover:text-neutral-800 transition"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "pick-template" && (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setStep("choose"); setError(null); }}
                className="text-neutral-400 hover:text-neutral-700 transition"
                aria-label="Back"
              >
                ←
              </button>
              <h2 className="text-lg font-semibold text-neutral-900">Choose a Template</h2>
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {templates.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center">
                No saved templates found.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplate(t)}
                    disabled={submitting}
                    className="w-full text-left rounded-xl border border-neutral-200 px-4 py-3.5 hover:border-primary-400 hover:bg-primary-50/50 transition disabled:opacity-50 group"
                  >
                    <p className="font-medium text-sm text-neutral-900 group-hover:text-primary-700 truncate">
                      {t.name}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5 truncate">
                      Subject: {t.subject}
                    </p>
                    {submitting && (
                      <p className="text-xs text-primary-600 mt-1">Creating draft…</p>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="pt-1 flex justify-end">
              <button
                onClick={onClose}
                className="text-sm text-neutral-500 hover:text-neutral-800 transition"
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

// ─── Edit Class Modal ─────────────────────────────────────────────────────────

function EditClassModal({
  cls,
  onClose,
  onSaved,
}: {
  cls: ClassDetail;
  onClose: () => void;
  onSaved: (updates: ClassMetaUpdate) => void;
}) {
  const [form, setForm] = useState<ClassMetaUpdate>({
    name: cls.name,
    description: cls.description ?? "",
    min_age: cls.min_age,
    max_age: cls.max_age,
    min_grade: cls.min_grade,
    max_grade: cls.max_grade,
    waitlist_enabled: cls.waitlist_enabled ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { success, error } = await updateClassMeta(cls.id, form);
    if (!success) {
      setError(error ?? "Failed to save");
      setSaving(false);
      return;
    }
    onSaved(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-neutral-900">Edit Class Details</h2>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 text-slate-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(
              [
                { key: "min_age", label: "Min Age" },
                { key: "max_age", label: "Max Age" },
                { key: "min_grade", label: "Min Grade" },
                { key: "max_grade", label: "Max Grade" },
              ] as { key: keyof ClassMetaUpdate; label: string }[]
            ).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  value={(form[key] as number | null | undefined) ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [key]: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 text-slate-700"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              Description
            </label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none text-slate-700"
            />
          </div>

          {/* Meeting-plan #5: per-class manual waitlist toggle */}
          <label className="flex items-start gap-3 rounded-lg border border-neutral-200 px-3 py-3 cursor-pointer hover:bg-neutral-50 transition">
            <input
              type="checkbox"
              checked={form.waitlist_enabled ?? false}
              onChange={(e) =>
                setForm((f) => ({ ...f, waitlist_enabled: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-400"
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium block">Enable waitlist</span>
              <span className="text-xs text-neutral-500">
                When this class is full, families can join a waitlist instead of
                registering. Admins manually invite waitlisted families — no
                automatic invitations are sent.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cancel Class Modal ───────────────────────────────────────────────────────

function CancelClassModal({
  cls,
  registrantCount,
  onClose,
  onCancelled,
}: {
  cls: ClassDetail;
  registrantCount: number;
  onClose: () => void;
  onCancelled: (notified: number) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!reason.trim()) {
      setError("Please enter a cancellation reason.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelEntireClass(cls.id, reason.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      onCancelled(result.notified ?? 0);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Cancel Class</h2>
          <p className="text-sm text-neutral-500 mt-1">
            <strong>{cls.name}</strong> will be marked inactive.
            {registrantCount > 0 && (
              <>
                {" "}
                <strong>{registrantCount}</strong> enrolled famil
                {registrantCount === 1 ? "y" : "ies"} will be notified via{" "}
                <strong>email and SMS</strong>.
              </>
            )}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={3}
            placeholder="e.g. Instructor unavailable, low enrollment…"
            className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none text-slate-700"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onClose}
            disabled={pending}
            className="text-sm text-neutral-500 hover:text-neutral-800 transition disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
          >
            {pending ? "Cancelling…" : "Cancel Class"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Class List Row ───────────────────────────────────────────────────────────

function ClassListRow({
  cls,
  selected,
  enrolledCount,
  onClick,
}: {
  cls: ClassListItem;
  selected: boolean;
  enrolledCount: number | null;
  onClick: () => void;
}) {
  const cap = totalCapacity(cls);
  const pct =
    cap > 0 && enrolledCount !== null
      ? Math.min(100, (enrolledCount / cap) * 100)
      : 0;
  const barColor =
    pct >= 90
      ? "#C14B3B"
      : pct >= 70
      ? "#E8A838"
      : pct > 0
      ? "#8E2A23"
      : "#C8A09D";

  const days =
    cls.class_meetings.length > 0
      ? [
          ...new Set(
            cls.class_meetings.map((s) => s.day_of_week.slice(0, 3))
          ),
        ].join(", ")
      : null;
  const firstSession = cls.class_meetings[0];

  return (
    <div
      onClick={onClick}
      className="flex justify-between items-start cursor-pointer transition"
      style={{
        padding: selected ? "11px 16px 11px 13px" : "11px 16px",
        borderBottom: "0.5px solid #F7F5F2",
        background: selected ? "#FDF0EF" : undefined,
        borderLeft: selected ? "3px solid #8E2A23" : "3px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.background = "#FBF9F7";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "";
      }}
    >
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] font-medium mb-0.5 truncate"
          style={{ color: "#201D18" }}
        >
          {cls.name}
        </p>
        <div
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: "#9E9890" }}
        >
          <span className="capitalize">{cls.discipline.replace(/_/g, " ")}</span>
          <span>·</span>
          <span>{DIVISION_LABELS[cls.division] ?? cls.division}</span>
        </div>
        {days && (
          <p className="text-[11px] mt-0.5" style={{ color: "#9E9890" }}>
            {days}
            {firstSession?.start_time &&
              ` · ${formatTime(firstSession.start_time)}–${formatTime(firstSession.end_time)}`}
          </p>
        )}
      </div>

      <div className="ml-3 flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] font-medium" style={{ color: "#201D18" }}>
          {enrolledCount !== null ? enrolledCount : "—"} / {cap || "—"}
        </span>
        <div
          className="rounded-full overflow-hidden"
          style={{ width: "56px", height: "4px", background: "#F7F5F2" }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: "9999px",
              background: barColor,
            }}
          />
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{
            background: cls.is_active ? "#C8EEE2" : "#EDE9E4",
            color: cls.is_active ? "#0A5A50" : "#736D65",
          }}
        >
          {cls.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  );
}

// ─── Class Detail Panel ───────────────────────────────────────────────────────

function ClassDetailPanel({
  detail,
  registrants,
  onEmail,
  onEdit,
  onArchive,
  onCancelClass,
  archiving,
  archiveError,
}: {
  detail: ClassDetail;
  registrants: Registrant[];
  onEmail: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onCancelClass: () => void;
  archiving: boolean;
  archiveError: string | null;
}) {
  const semester = getSemesterFromDetail(detail);
  const isLocked = semester?.status === "published" && registrants.length > 0;

  const confirmed = registrants.filter((r) => r.status === "confirmed").length;
  const pending = registrants.filter(
    (r) => r.status === "pending_payment" || r.status === "pending"
  ).length;
  const cap = totalCapacity(detail);
  const openSpots = Math.max(0, cap - confirmed - pending);

  // Per-session enrolled counts (confirmed only)
  const sessionEnrolledCounts = registrants.reduce<Record<string, number>>(
    (acc, r) => {
      if (r.status === "confirmed" && r.sessionId) {
        acc[r.sessionId] = (acc[r.sessionId] ?? 0) + 1;
      }
      return acc;
    },
    {}
  );

  const sortedSessions = [...detail.class_meetings].sort(
    (a, b) =>
      DAY_ORDER.indexOf(
        a.day_of_week.charAt(0).toUpperCase() + a.day_of_week.slice(1)
      ) -
      DAY_ORDER.indexOf(
        b.day_of_week.charAt(0).toUpperCase() + b.day_of_week.slice(1)
      )
  );

  const [sessionsExpanded,    setSessionsExpanded]    = useState(false);
  const [rosterExpanded,      setRosterExpanded]      = useState(false);
  const [attendanceExpanded,  setAttendanceExpanded]  = useState(false);
  const [attendanceData,      setAttendanceData]      = useState<import("@/queries/admin").AdminSessionAttendance[] | null>(null);
  const [attendanceLoading,   setAttendanceLoading]   = useState(false);

  // Instructor assignments
  const [assignments,          setAssignments]          = useState<SessionInstructorAssignment[] | null>(null);
  const [assignmentsLoading,   setAssignmentsLoading]   = useState(true);
  const [availableInstructors, setAvailableInstructors] = useState<InstructorRow[] | null>(null);
  const [addingToSessionId,    setAddingToSessionId]    = useState<string | null>(null);
  const [actionLoading,        setActionLoading]        = useState<string | null>(null);
  const [instructorError,      setInstructorError]      = useState<string | null>(null);

  useEffect(() => {
    setAssignments(null);
    setAssignmentsLoading(true);
    setAddingToSessionId(null);
    import("@/queries/admin").then(({ getSessionInstructorsForClass }) =>
      getSessionInstructorsForClass(detail.id).then((data) => {
        setAssignments(data);
        setAssignmentsLoading(false);
      })
    );
  }, [detail.id]);

  async function loadAvailableInstructors() {
    if (availableInstructors !== null) return;
    const { getInstructors } = await import("@/queries/admin");
    const data = await getInstructors();
    setAvailableInstructors(data);
  }

  async function handleAssignInstructor(sessionId: string, userId: string, isLead: boolean) {
    setActionLoading(`assign-${sessionId}-${userId}`);
    setInstructorError(null);
    const result = await assignInstructorToSession(sessionId, userId, isLead);
    if (!result.success) {
      setInstructorError(result.error ?? "Failed to assign instructor");
      setActionLoading(null);
      return;
    }
    const instructor = availableInstructors?.find((i) => i.id === userId);
    if (instructor) {
      setAssignments((prev) =>
        prev
          ? prev.map((s) =>
              s.sessionId === sessionId
                ? {
                    ...s,
                    instructors: [
                      ...s.instructors,
                      { userId, firstName: instructor.first_name, lastName: instructor.last_name, isLead },
                    ],
                  }
                : s,
            )
          : prev,
      );
    }
    setAddingToSessionId(null);
    setActionLoading(null);
  }

  async function handleRemoveInstructor(sessionId: string, userId: string) {
    setActionLoading(`remove-${sessionId}-${userId}`);
    setInstructorError(null);
    const result = await removeInstructorFromSession(sessionId, userId);
    if (!result.success) {
      setInstructorError(result.error ?? "Failed to remove instructor");
      setActionLoading(null);
      return;
    }
    setAssignments((prev) =>
      prev
        ? prev.map((s) =>
            s.sessionId === sessionId
              ? { ...s, instructors: s.instructors.filter((i) => i.userId !== userId) }
              : s,
          )
        : prev,
    );
    setActionLoading(null);
  }

  // Lazy-load attendance data on first expand
  const handleAttendanceToggle = async () => {
    const next = !attendanceExpanded;
    setAttendanceExpanded(next);
    if (next && attendanceData === null) {
      setAttendanceLoading(true);
      const { getAdminClassAttendance } = await import("@/queries/admin");
      const data = await getAdminClassAttendance(detail.id);
      setAttendanceData(data);
      setAttendanceLoading(false);
    }
  };

  // ── Cancel session state ──
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelPending, startCancelTransition] = useTransition();
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());
  const [cancelToast, setCancelToast] = useState<string | null>(null);

  const visibleSessions = sortedSessions.filter((s) => !cancelledIds.has(s.id));

  function handleCancelSession() {
    if (!cancellingSessionId) return;
    if (!cancelReason.trim()) {
      setCancelError("Please enter a cancellation reason.");
      return;
    }
    setCancelError(null);
    startCancelTransition(async () => {
      const result = await cancelClass(cancellingSessionId, cancelReason.trim());
      if (result.error) {
        setCancelError(result.error);
        return;
      }
      setCancelledIds((prev) => new Set([...prev, cancellingSessionId]));
      const n = result.notified ?? 0;
      setCancelToast(
        `Session cancelled. ${n} famil${n === 1 ? "y" : "ies"} notified via email & SMS.`
      );
      setCancellingSessionId(null);
      setCancelReason("");
      setTimeout(() => setCancelToast(null), 5000);
    });
  }

  const SESSIONS_THRESHOLD = 3;
  const ROSTER_THRESHOLD = 5;
  const sessionsOverflow = visibleSessions.length > SESSIONS_THRESHOLD;
  const rosterOverflow = registrants.length > ROSTER_THRESHOLD;

  return (
    <>
      {/* Cancel Session Modal */}
      {cancellingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Cancel Session</h2>
            <p className="text-sm text-neutral-500">
              This will mark the session as cancelled and notify all enrolled families via{" "}
              <strong>email and SMS</strong>.
            </p>
            {cancelError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {cancelError}
              </div>
            )}
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  setCancelError(null);
                }}
                rows={3}
                placeholder="e.g. Instructor unavailable, facility issue…"
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none text-slate-700"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  setCancellingSessionId(null);
                  setCancelReason("");
                  setCancelError(null);
                }}
                disabled={cancelPending}
                className="text-sm text-neutral-500 hover:text-neutral-800 transition disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                onClick={handleCancelSession}
                disabled={cancelPending}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {cancelPending ? "Cancelling…" : "Cancel Session"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {cancelToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ background: "#201D18" }}
        >
          {cancelToast}
        </div>
      )}

    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-medium mb-1.5" style={{ color: "#201D18" }}>
          {detail.name}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
            style={{
              background: detail.is_active ? "#C8EEE2" : "#EDE9E4",
              color: detail.is_active ? "#0A5A50" : "#736D65",
            }}
          >
            {detail.is_active ? "Active" : "Inactive"}
          </span>
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full capitalize"
            style={{
              border: "0.5px solid #DDD9D2",
              background: "#F7F5F2",
              color: "#736D65",
            }}
          >
            {detail.discipline.replace(/_/g, " ")}
          </span>
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full"
            style={{
              border: "0.5px solid #DDD9D2",
              background: "#F7F5F2",
              color: "#736D65",
            }}
          >
            {DIVISION_LABELS[detail.division] ?? detail.division}
          </span>
          {semester && (
            <span
              className="text-[11px] px-2.5 py-0.5 rounded-full"
              style={{
                border: "0.5px solid #DDD9D2",
                background: "#F7F5F2",
                color: "#736D65",
              }}
            >
              {semester.name}
            </span>
          )}
        </div>
        {(detail.min_age || detail.max_age) && (
          <p className="text-[12px]" style={{ color: "#9E9890" }}>
            Ages {detail.min_age ?? "?"}–{detail.max_age ?? "?"}
            {detail.description ? ` · ${detail.description}` : ""}
          </p>
        )}
        {!detail.min_age && !detail.max_age && detail.description && (
          <p className="text-[12px]" style={{ color: "#9E9890" }}>
            {detail.description}
          </p>
        )}
      </div>

      {/* Lock banner */}
      {isLocked && (
        <div
          className="rounded-xl px-4 py-3 text-[12px]"
          style={{
            background: "rgba(196,160,212,0.08)",
            border: "0.5px solid rgba(196,160,212,0.5)",
            color: "#6B2E80",
          }}
        >
          <strong>Read-only:</strong> This class belongs to a published semester
          with active registrations. Editing and archiving are disabled.
        </div>
      )}

      {archiveError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[12px] text-red-700">
          {archiveError}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onEmail}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium text-white transition hover:opacity-90"
          style={{ background: "#8E2A23" }}
        >
          <svg
            className="w-3.5 h-3.5"
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
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition hover:bg-[#F7F5F2]"
              style={{ border: "0.5px solid #DDD9D2", color: "#201D18" }}
            >
              Edit Details
            </button>

            <button
              onClick={onArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition disabled:opacity-50"
              style={{
                border: `0.5px solid ${detail.is_active ? "rgba(196,160,212,0.6)" : "rgba(28,158,117,0.4)"}`,
                color: detail.is_active ? "#6B2E80" : "#0A5A50",
              }}
            >
              {archiving ? "…" : detail.is_active ? "Archive Class" : "Restore Class"}
            </button>
          </>
        )}

        {semester && (
          <Link
            href={`/admin/semesters/${detail.semester_id}/edit?step=sessions`}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-[12px] font-medium transition hover:bg-[#F7F5F2]"
            style={{ border: "0.5px solid #DDD9D2", color: "#736D65" }}
          >
            Edit in Semester →
          </Link>
        )}

        {detail.is_active && (
          <button
            onClick={onCancelClass}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition hover:bg-red-50"
            style={{ border: "0.5px solid rgba(193, 75, 59, 0.4)", color: "#C14B3B" }}
          >
            Cancel Class
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className="rounded-xl p-3.5"
          style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: "#9E9890" }}
          >
            Enrolled
          </p>
          <p
            className="text-[22px] font-medium leading-none"
            style={{ color: "#201D18" }}
          >
            {confirmed}
          </p>
          {cap > 0 && (
            <>
              <div
                className="w-full rounded-full overflow-hidden mt-2"
                style={{ height: "5px", background: "#F7F5F2" }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (confirmed / cap) * 100)}%`,
                    height: "100%",
                    borderRadius: "9999px",
                    background: "#8E2A23",
                  }}
                />
              </div>
              <p className="text-[10px] mt-1" style={{ color: "#9E9890" }}>
                of {cap} capacity
              </p>
            </>
          )}
        </div>

        <div
          className="rounded-xl p-3.5"
          style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: "#9E9890" }}
          >
            Sessions
          </p>
          <p
            className="text-[22px] font-medium leading-none"
            style={{ color: "#201D18" }}
          >
            {detail.class_meetings.length}
          </p>
          <p className="text-[10px] mt-1" style={{ color: "#9E9890" }}>
            {[...new Set(sortedSessions.map((s) => s.day_of_week.slice(0, 3)))].join(" + ")}{" "}
            weekly
          </p>
        </div>

        <div
          className="rounded-xl p-3.5"
          style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: "#9E9890" }}
          >
            Pending
          </p>
          <p
            className="text-[22px] font-medium leading-none"
            style={{ color: "#201D18" }}
          >
            {pending}
          </p>
          <p
            className="text-[10px] mt-1"
            style={{ color: pending > 0 ? "#7A4E08" : "#9E9890" }}
          >
            {pending > 0 ? `${pending} awaiting payment` : "all confirmed"}
          </p>
        </div>
      </div>

      {/* Two columns: sessions + enrollment breakdown */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Sessions card */}
        <div
          className="rounded-xl p-4"
          style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
        >
          <p
            className="text-[12px] font-medium mb-3"
            style={{ color: "#201D18" }}
          >
            Sessions
          </p>
          {visibleSessions.length === 0 ? (
            <p className="text-[12px]" style={{ color: "#9E9890" }}>
              No sessions defined.
            </p>
          ) : (
            <>
              <div className="relative">
                <div
                  className="[&::-webkit-scrollbar]:w-0"
                  style={{
                    maxHeight: sessionsExpanded ? "none" : `${SESSIONS_THRESHOLD * 52}px`,
                    overflowY: "auto",
                    scrollbarWidth: "none",
                  }}
                >
                  {visibleSessions.map((s, i) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-2.5 py-2"
                      style={{
                        borderBottom:
                          i < visibleSessions.length - 1
                            ? "0.5px solid #F7F5F2"
                            : undefined,
                      }}
                    >
                      <span
                        className="shrink-0 text-[10px] font-medium text-white rounded-md text-center"
                        style={{
                          background: "#8E2A23",
                          padding: "3px 7px",
                          minWidth: "36px",
                        }}
                      >
                        {s.day_of_week.slice(0, 3).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[12px] font-medium"
                          style={{ color: "#201D18" }}
                        >
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                        </p>
                      </div>
                      {s.capacity && (
                        <span
                          className="text-[11px] shrink-0"
                          style={{ color: "#736D65" }}
                        >
                          {sessionEnrolledCounts[s.id] ?? 0} / {s.capacity}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setCancellingSessionId(s.id);
                          setCancelReason("");
                          setCancelError(null);
                        }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition hover:bg-red-50"
                        style={{ color: "#C14B3B" }}
                        title="Cancel this session"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
                {sessionsOverflow && !sessionsExpanded && (
                  <div
                    className="absolute bottom-0 left-0 right-0 pointer-events-none"
                    style={{
                      height: "40px",
                      background: "linear-gradient(to bottom, transparent, #fff)",
                    }}
                  />
                )}
              </div>
              {sessionsOverflow && (
                <button
                  onClick={() => setSessionsExpanded((v) => !v)}
                  className="mt-2 text-[11px] font-medium transition hover:opacity-70"
                  style={{ color: "#8E2A23" }}
                >
                  {sessionsExpanded
                    ? "Collapse ↑"
                    : `Show all ${visibleSessions.length} sessions →`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Enrollment breakdown */}
        <div
          className="rounded-xl p-4"
          style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
        >
          <p
            className="text-[12px] font-medium mb-3"
            style={{ color: "#201D18" }}
          >
            Enrollment breakdown
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#736D65" }}>Confirmed</span>
              <span className="font-medium" style={{ color: "#201D18" }}>
                {confirmed}
              </span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#736D65" }}>Pending</span>
              <span className="font-medium" style={{ color: "#201D18" }}>
                {pending}
              </span>
            </div>
            <div
              className="flex justify-between text-[12px]"
              style={{
                borderTop: "0.5px solid #F7F5F2",
                paddingTop: "8px",
                marginTop: "4px",
              }}
            >
              <span style={{ color: "#736D65" }}>Open spots</span>
              <span className="font-medium" style={{ color: "#0A5A50" }}>
                {openSpots}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Instructors ──────────────────────────────────────────── */}
      {addingToSessionId && (
        <div
          className="fixed inset-0 z-[5]"
          onClick={() => setAddingToSessionId(null)}
        />
      )}
      <div
        className="rounded-xl"
        style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
      >
        <div
          className="px-4 py-3 rounded-t-xl"
          style={{ borderBottom: "0.5px solid #DDD9D2" }}
        >
          <p className="text-[12px] font-medium" style={{ color: "#201D18" }}>
            Instructors
          </p>
        </div>

        {assignmentsLoading ? (
          <div className="px-4 py-4 text-[12px]" style={{ color: "#9E9890" }}>
            Loading…
          </div>
        ) : (
          <div>
            {instructorError && (
              <div className="px-4 py-2.5 text-[12px] text-red-600 bg-red-50 border-b" style={{ borderColor: "#FEE2E2" }}>
                {instructorError}
              </div>
            )}
            {(assignments ?? []).length === 0 ? (
              <div className="px-4 py-4 text-[12px]" style={{ color: "#9E9890" }}>
                No active sessions found.
              </div>
            ) : (
              (assignments ?? []).map((session, idx) => {
                const dayStr = session.dayOfWeek.slice(0, 3).toUpperCase();
                const timeStr = session.startTime
                  ? `${formatTime(session.startTime)}–${formatTime(session.endTime)}`
                  : "";
                const isAddingHere = addingToSessionId === session.sessionId;
                const availableToAdd = (availableInstructors ?? [])
                  .filter((i) => i.status === "active")
                  .filter((i) => !session.instructors.some((a) => a.userId === i.id));

                return (
                  <div
                    key={session.sessionId}
                    className="px-4 py-3"
                    style={{
                      borderBottom:
                        idx < (assignments ?? []).length - 1
                          ? "0.5px solid #F7F5F2"
                          : undefined,
                    }}
                  >
                    {/* Session label */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="shrink-0 text-[10px] font-medium text-white rounded-md"
                        style={{ background: "#8E2A23", padding: "2px 7px" }}
                      >
                        {dayStr}
                      </span>
                      {timeStr && (
                        <span className="text-[11px]" style={{ color: "#736D65" }}>
                          {timeStr}
                        </span>
                      )}
                    </div>

                    {/* Instructor pills + Add button */}
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {session.instructors.map((instructor) => (
                        <div
                          key={instructor.userId}
                          className="flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5"
                          style={{ background: "#F7F5F2", border: "0.5px solid #DDD9D2" }}
                        >
                          <span
                            className="text-[9px] font-semibold text-white rounded-full px-1.5 py-px"
                            style={{ background: instructor.isLead ? "#8E2A23" : "#736D65" }}
                          >
                            {instructor.isLead ? "Lead" : "Asst"}
                          </span>
                          <span className="text-[11px]" style={{ color: "#201D18" }}>
                            {instructor.firstName} {instructor.lastName}
                          </span>
                          <button
                            onClick={() => handleRemoveInstructor(session.sessionId, instructor.userId)}
                            disabled={actionLoading !== null}
                            className="ml-0.5 text-[15px] leading-none transition hover:text-red-500 disabled:opacity-40"
                            style={{ color: "#9E9890" }}
                            title="Remove instructor"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {/* Add dropdown trigger */}
                      <div className="relative z-[6]">
                        <button
                          onClick={() => {
                            if (isAddingHere) {
                              setAddingToSessionId(null);
                            } else {
                              setAddingToSessionId(session.sessionId);
                              setInstructorError(null);
                              loadAvailableInstructors();
                            }
                          }}
                          disabled={actionLoading !== null}
                          className="rounded-full text-[11px] px-2.5 py-0.5 transition hover:opacity-70 disabled:opacity-40"
                          style={{
                            border: "0.5px solid #DDD9D2",
                            color: isAddingHere ? "#C14B3B" : "#8E2A23",
                          }}
                        >
                          {isAddingHere ? "✕ Cancel" : "+ Add"}
                        </button>

                        {isAddingHere && (
                          <div
                            className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg z-[6] min-w-[200px] max-h-52 overflow-y-auto"
                            style={{ border: "0.5px solid #DDD9D2" }}
                          >
                            {availableInstructors === null ? (
                              <p className="px-3 py-2.5 text-[12px]" style={{ color: "#9E9890" }}>
                                Loading instructors…
                              </p>
                            ) : availableToAdd.length === 0 ? (
                              <p className="px-3 py-2.5 text-[12px]" style={{ color: "#9E9890" }}>
                                All active instructors assigned.
                              </p>
                            ) : (
                              availableToAdd.map((instructor) => {
                                const willBeLead = session.instructors.length === 0;
                                return (
                                  <button
                                    key={instructor.id}
                                    onClick={() =>
                                      handleAssignInstructor(session.sessionId, instructor.id, willBeLead)
                                    }
                                    disabled={actionLoading !== null}
                                    className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition disabled:opacity-50 hover:bg-[#F7F5F2]"
                                    style={{ borderBottom: "0.5px solid #F7F5F2" }}
                                  >
                                    <span className="text-[12px]" style={{ color: "#201D18" }}>
                                      {instructor.first_name} {instructor.last_name}
                                    </span>
                                    <span
                                      className="text-[9px] font-semibold text-white rounded-full px-1.5 py-px shrink-0"
                                      style={{ background: willBeLead ? "#8E2A23" : "#736D65" }}
                                    >
                                      {willBeLead ? "Lead" : "Asst"}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Registered dancers roster */}
      <div
        className="rounded-xl p-4"
        style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] font-medium" style={{ color: "#201D18" }}>
            Registered dancers
            <span className="ml-1.5 font-normal" style={{ color: "#9E9890" }}>
              ({registrants.length})
            </span>
          </p>
          <Link
            href={`/admin/register?semester=${detail.semester_id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition hover:opacity-80"
            style={{ background: "#8E2A23", color: "#fff" }}
          >
            + Add Dancer
          </Link>
        </div>

        {registrants.length === 0 ? (
          <p className="text-[12px] py-2" style={{ color: "#9E9890" }}>
            No registrations yet.
          </p>
        ) : (
          <>
            <div className="relative">
              <div
                className="[&::-webkit-scrollbar]:w-0"
                style={{
                  maxHeight: rosterExpanded ? "none" : `${ROSTER_THRESHOLD * 44}px`,
                  overflowY: "auto",
                  scrollbarWidth: "none",
                }}
              >
              <table className="w-full text-[12px]">
                <thead>
                  <tr>
                    {["Dancer", "Parent", "Status", "Enrolled"].map((h) => (
                      <th
                        key={h}
                        className="text-left pb-2 text-[10px] uppercase tracking-wider font-medium"
                        style={{
                          color: "#9E9890",
                          borderBottom: "0.5px solid #DDD9D2",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registrants.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "0.5px solid #F7F5F2" }}>
                      <td className="py-2 font-medium">
                        {r.dancerId ? (
                          <Link
                            href={`/admin/dancers/${r.dancerId}`}
                            className="hover:underline"
                            style={{ color: "#8E2A23" }}
                          >
                            {r.dancerName}
                          </Link>
                        ) : (
                          <span style={{ color: "#8E2A23" }}>{r.dancerName}</span>
                        )}
                      </td>
                      <td className="py-2" style={{ color: "#736D65" }}>
                        {r.parentName ?? "—"}
                      </td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block rounded-full"
                            style={{
                              width: "6px",
                              height: "6px",
                              background:
                                r.status === "confirmed"
                                  ? "#1D9E75"
                                  : r.status === "pending_payment" ||
                                    r.status === "pending"
                                  ? "#E8A838"
                                  : "#9E9890",
                            }}
                          />
                          <span className="capitalize" style={{ color: "#201D18" }}>
                            {r.status.replace(/_/g, " ")}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 text-[11px]" style={{ color: "#9E9890" }}>
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
              {rosterOverflow && !rosterExpanded && (
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-none"
                  style={{
                    height: "40px",
                    background: "linear-gradient(to bottom, transparent, #fff)",
                  }}
                />
              )}
            </div>
            {rosterOverflow && (
              <button
                onClick={() => setRosterExpanded((v) => !v)}
                className="mt-2 text-[11px] font-medium transition hover:opacity-70"
                style={{ color: "#8E2A23" }}
              >
                {rosterExpanded
                  ? "Collapse ↑"
                  : `View all ${registrants.length} dancers →`}
              </button>
            )}
          </>
        )}
      </div>
      {/* ── Attendance ──────────────────────────────────────────── */}
      <div
        className="rounded-xl"
        style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
      >
        <button
          onClick={handleAttendanceToggle}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <p className="text-[12px] font-medium" style={{ color: "#201D18" }}>
            Attendance records
          </p>
          <span className="text-[11px]" style={{ color: "#8E2A23" }}>
            {attendanceExpanded ? "Collapse ↑" : "View ↓"}
          </span>
        </button>

        {attendanceExpanded && (
          <div style={{ borderTop: "0.5px solid #DDD9D2" }}>
            {attendanceLoading ? (
              <div className="px-4 py-6 text-center text-[12px]" style={{ color: "#9E9890" }}>
                Loading…
              </div>
            ) : !attendanceData || attendanceData.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px]" style={{ color: "#9E9890" }}>
                No attendance records found for this class.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#F7F5F2" }}>
                {attendanceData.map((session) => {
                  const dayLabel = session.dayOfWeek.charAt(0).toUpperCase() + session.dayOfWeek.slice(1, 3);
                  const timeLabel = session.startTime
                    ? `${formatTime(session.startTime)}–${formatTime(session.endTime)}`
                    : "";
                  const datesWithRecords = session.dates.filter((d) => d.markedCount > 0);

                  if (datesWithRecords.length === 0) return null;

                  return (
                    <div key={session.sessionId} className="px-4 py-3">
                      <p className="text-[11px] font-semibold mb-2" style={{ color: "#736D65" }}>
                        {dayLabel} {timeLabel && `· ${timeLabel}`}
                      </p>

                      <div className="space-y-2">
                        {datesWithRecords.map((d) => {
                          const dateLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "short", month: "short", day: "numeric",
                          });
                          const pct = d.enrolledCount > 0
                            ? Math.round((d.markedCount / d.enrolledCount) * 100)
                            : 0;

                          const STATUS_COLORS: Record<string, string> = {
                            present: "#22c55e",
                            absent:  "#ef4444",
                            tardy:   "#f97316",
                            excused: "#3b82f6",
                          };

                          return (
                            <div key={d.dateId} className="rounded-lg p-3" style={{ background: "#F7F5F2" }}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] font-medium" style={{ color: "#201D18" }}>
                                  {dateLabel}
                                </p>
                                <p className="text-[10px]" style={{ color: "#736D65" }}>
                                  {d.markedCount}/{d.enrolledCount} marked · {pct}%
                                </p>
                              </div>

                              {/* Status pills */}
                              <div className="flex flex-wrap gap-1">
                                {d.records.map((r, i) => (
                                  <span
                                    key={i}
                                    title={`${r.dancerName}${r.note ? ` — ${r.note}` : ""} (marked by ${r.markedBy})`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                                    style={{ background: STATUS_COLORS[r.status] ?? "#9E9890" }}
                                  >
                                    {r.dancerName.split(" ")[0]}
                                    {" · "}
                                    {r.status[0].toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
    </>
  );
}

// ─── Page Content ─────────────────────────────────────────────────────────────

function ClassesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const semesterId = searchParams.get("semester");

  const [classes, setClasses] = useState<ClassListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [semesterName, setSemesterName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});

  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelClassModal, setShowCancelClassModal] = useState(false);
  const [cancelClassToast, setCancelClassToast] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Load class list (re-runs when semester filter changes)
  useEffect(() => {
    setLoading(true);
    setClasses([]);
    setEnrolledCounts({});
    setSearch("");
    setActiveFilter("all");
    getClasses(semesterId ?? undefined).then((data) => {
      setClasses(data as ClassListItem[]);
      setLoading(false);
    });
  }, [semesterId]);

  // Fetch semester name when semesterId is present
  useEffect(() => {
    if (!semesterId) {
      setSemesterName(null);
      return;
    }
    createClient()
      .from("semesters")
      .select("name")
      .eq("id", semesterId)
      .single()
      .then(({ data }) => setSemesterName(data?.name ?? null));
  }, [semesterId]);

  // Load enrollment counts after classes are loaded (per-session model)
  useEffect(() => {
    if (classes.length === 0) return;
    const sessionIds = classes.flatMap((c) => c.class_meetings.map((s) => s.id));
    if (sessionIds.length === 0) return;

    const supabase = createClient();
    supabase
      .from("meeting_enrollments")
      .select("meeting_id")
      .in("meeting_id", sessionIds)
      .eq("status", "confirmed")
      .then(({ data }) => {
        const sessionClassMap: Record<string, string> = {};
        for (const cls of classes) {
          for (const s of cls.class_meetings) {
            sessionClassMap[s.id] = cls.id;
          }
        }
        const counts: Record<string, number> = {};
        for (const r of data ?? []) {
          const classId = sessionClassMap[r.meeting_id];
          if (classId) counts[classId] = (counts[classId] ?? 0) + 1;
        }
        setEnrolledCounts(counts);
      });
  }, [classes]);

  // Load detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setRegistrants([]);
      return;
    }
    setDetailLoading(true);
    setArchiveError(null);
    Promise.all([
      getClassWithSemester(selectedId),
      getClassRegistrants(selectedId),
    ]).then(([cls, regs]) => {
      setDetail(cls as ClassDetail | null);
      setRegistrants(regs);
      setDetailLoading(false);
    });
  }, [selectedId]);

  function selectClass(id: string) {
    if (selectedId === id) return;
    const params = new URLSearchParams();
    if (semesterId) params.set("semester", semesterId);
    params.set("id", id);
    router.replace(`/admin/classes?${params.toString()}`, { scroll: false });
    setArchiveError(null);
    setShowEmailModal(false);
    setShowEditModal(false);
  }

  async function handleArchive() {
    if (!detail) return;
    setArchiving(true);
    setArchiveError(null);
    const { success, error } = await archiveClass(detail.id, detail.is_active);
    if (!success) {
      setArchiveError(error ?? "Failed to update");
      setArchiving(false);
      return;
    }
    const newActive = !detail.is_active;
    setDetail((prev) => (prev ? { ...prev, is_active: newActive } : prev));
    setClasses((prev) =>
      prev.map((c) => (c.id === detail.id ? { ...c, is_active: newActive } : c))
    );
    setArchiving(false);
  }

  function handleEditSaved(updates: ClassMetaUpdate) {
    setDetail((prev) => (prev ? { ...prev, ...updates } : prev));
    if (updates.name) {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === detail?.id ? { ...c, name: updates.name! } : c
        )
      );
    }
    setShowEditModal(false);
  }

  function handleClassCancelled(notified: number) {
    setShowCancelClassModal(false);
    setDetail((prev) => (prev ? { ...prev, is_active: false } : prev));
    setClasses((prev) =>
      prev.map((c) => (c.id === detail?.id ? { ...c, is_active: false } : c))
    );
    const msg = `Class cancelled. ${notified} famil${notified === 1 ? "y" : "ies"} notified via email & SMS.`;
    setCancelClassToast(msg);
    setTimeout(() => setCancelClassToast(null), 5000);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter((cls) => {
      if (!matchesChip(cls, activeFilter)) return false;
      if (!q) return true;
      const tokens = q.split(/\s+/).filter(Boolean);
      const text = [
        cls.name,
        cls.discipline,
        cls.division,
        DIVISION_LABELS[cls.division] ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => text.includes(t));
    });
  }, [classes, search, activeFilter]);

  const semesterForDetail = detail ? getSemesterFromDetail(detail) : null;

  return (
    <>
      {showEmailModal && detail && (
        <EmailClassModal
          cls={detail}
          semester={semesterForDetail}
          onClose={() => setShowEmailModal(false)}
        />
      )}
      {showEditModal && detail && (
        <EditClassModal
          cls={detail}
          onClose={() => setShowEditModal(false)}
          onSaved={handleEditSaved}
        />
      )}
      {showCancelClassModal && detail && (
        <CancelClassModal
          cls={detail}
          registrantCount={registrants.filter(
            (r) => r.status !== "declined" && r.status !== "cancelled"
          ).length}
          onClose={() => setShowCancelClassModal(false)}
          onCancelled={handleClassCancelled}
        />
      )}
      {cancelClassToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ background: "#201D18" }}
        >
          {cancelClassToast}
        </div>
      )}

      {/* Master-detail layout — breaks out of layout padding */}
      <div
        className="flex overflow-hidden"
        style={{
          margin: "-32px -32px",
          height: "calc(100vh - 52px)",
        }}
      >
        {/* ── Left panel: class list ── */}
        <div
          className="flex flex-col overflow-hidden shrink-0"
          style={{
            width: "340px",
            background: "#fff",
            borderRight: "0.5px solid #DDD9D2",
          }}
        >
          {/* Header */}
          <div
            className="p-4 shrink-0"
            style={{ borderBottom: "0.5px solid #DDD9D2" }}
          >
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[15px] font-medium" style={{ color: "#201D18" }}>
                {semesterName ?? "All Classes"}
              </p>
              {semesterId && (
                <Link
                  href="/admin/classes"
                  className="text-[11px] transition hover:opacity-70"
                  style={{ color: "#8E2A23" }}
                >
                  View all →
                </Link>
              )}
            </div>
            <p className="text-[11px] mb-2.5" style={{ color: "#9E9890" }}>
              {loading
                ? "Loading…"
                : `${classes.length} ${semesterId ? "classes in this semester" : "classes across all semesters"}`}
            </p>
            <div className="relative">
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: "14px", height: "14px", color: "#9E9890" }}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search classes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-[12px] h-8 rounded-lg pl-7 pr-3 focus:outline-none"
                style={{
                  background: "#F7F5F2",
                  border: "0.5px solid #DDD9D2",
                  color: "#201D18",
                }}
              />
            </div>
          </div>

          {/* Filter chips */}
          <div
            className="flex gap-1.5 px-4 py-2.5 shrink-0 overflow-x-auto"
            style={{ borderBottom: "0.5px solid #DDD9D2" }}
          >
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setActiveFilter(chip.key)}
                className="shrink-0 text-[11px] px-2.5 py-1 rounded-full transition"
                style={{
                  border: "0.5px solid",
                  borderColor:
                    activeFilter === chip.key ? "#8E2A23" : "#DDD9D2",
                  background: activeFilter === chip.key ? "#8E2A23" : "#fff",
                  color: activeFilter === chip.key ? "#fff" : "#736D65",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Scrollable list */}
          <div className="relative flex-1 min-h-0">
            <div
              className="h-full overflow-y-auto"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
            {loading ? (
              <p className="p-5 text-[12px]" style={{ color: "#9E9890" }}>
                Loading classes…
              </p>
            ) : filtered.length === 0 ? (
              <p
                className="p-5 text-[12px] text-center"
                style={{ color: "#9E9890" }}
              >
                {search || activeFilter !== "all"
                  ? "No matching classes."
                  : "No classes found."}
              </p>
            ) : (
              filtered.map((cls) => (
                <ClassListRow
                  key={cls.id}
                  cls={cls}
                  selected={selectedId === cls.id}
                  enrolledCount={enrolledCounts[cls.id] ?? null}
                  onClick={() => selectClass(cls.id)}
                />
              ))
            )}
            </div>
          </div>
        </div>

        {/* ── Right panel: class detail ── */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: "#F7F5F2" }}
        >
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{
                  background: "#fff",
                  border: "0.5px solid #DDD9D2",
                }}
              >
                <svg
                  style={{ width: "20px", height: "20px", color: "#9E9890" }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
                </svg>
              </div>
              <p
                className="text-[14px] font-medium mb-1"
                style={{ color: "#201D18" }}
              >
                Select a class
              </p>
              <p className="text-[12px]" style={{ color: "#9E9890" }}>
                Click any class from the list to view its details.
              </p>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-[12px]" style={{ color: "#9E9890" }}>
                Loading…
              </p>
            </div>
          ) : detail ? (
            <ClassDetailPanel
              detail={detail}
              registrants={registrants}
              onEmail={() => setShowEmailModal(true)}
              onEdit={() => setShowEditModal(true)}
              onArchive={handleArchive}
              onCancelClass={() => setShowCancelClassModal(true)}
              archiving={archiving}
              archiveError={archiveError}
            />
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-[12px]" style={{ color: "#9E9890" }}>
                Class not found.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function AdminClassesPage() {
  return (
    <Suspense>
      <ClassesPageContent />
    </Suspense>
  );
}
