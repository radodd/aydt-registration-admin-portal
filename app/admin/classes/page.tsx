"use client";

import { Suspense, useEffect, useState, useMemo, useTransition, type ReactNode } from "react";
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
// Meeting-plan #25: surface + act on the per-class waitlist without leaving the
// Classes tab. Reuses the waitlist sub-zone's query + invite action; "Register"
// hands off to the manual registration flow with the entry pre-loaded
// (/admin/register?fromWaitlist=<id>).
import { getWaitlistEntries, type AdminWaitlistEntry } from "@/app/admin/waitlist/queries";
import { inviteWaitlistEntryByLink } from "@/app/admin/waitlist/actions/inviteWaitlistEntryByLink";
// Meeting-plan #28: surface admin-managed seat holds (held / freed) + reopen.
import { reopenFreedSeats } from "@/app/admin/classes/actions/reopenFreedSeats";
import type { TemplateListRow } from "@/types";
import type { SessionInstructorAssignment, InstructorRow } from "@/queries/admin";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/app/components/Toast";

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

/** Short "Jun 4, 3:05 PM" stamp for waitlist sign-up order. */
function fmtWaitlistDate(d: string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const toast = useToast();

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { success, error } = await updateClassMeta(cls.id, form);
    if (!success) {
      setError(error ?? "Failed to save");
      toast.error(error ?? "Couldn’t save class details.");
      setSaving(false);
      return;
    }
    toast.success("Class details saved.");
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
  waitlistCount,
  onClick,
}: {
  cls: ClassListItem;
  selected: boolean;
  enrolledCount: number | null;
  waitlistCount: number;
  onClick: () => void;
}) {
  const cap = totalCapacity(cls);

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
      className="cursor-pointer transition"
      style={{
        margin: "2px 8px",
        padding: "11px 12px",
        borderRadius: 10,
        background: selected ? "#FDF2F1" : undefined,
        boxShadow: selected ? "inset 2px 0 0 #8E2A23" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.background = "#F7F5F2";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "";
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[14px] font-semibold truncate"
          style={{ color: "#201D18" }}
        >
          {cls.name}
        </span>
        <span className="text-[12px] shrink-0" style={{ color: "#9E9890" }}>
          {enrolledCount !== null ? enrolledCount : "—"} / {cap || "—"}
        </span>
      </div>

      <p className="text-[11px] mt-0.5" style={{ color: "#736D65" }}>
        <span className="capitalize">{cls.discipline.replace(/_/g, " ")}</span>
        {" · "}
        {DIVISION_LABELS[cls.division] ?? cls.division}
        {!cls.is_active && " · Inactive"}
      </p>

      {days && (
        <p className="text-[11px] mt-0.5" style={{ color: "#9E9890" }}>
          {days}
          {firstSession?.start_time &&
            ` · ${formatTime(firstSession.start_time)}–${formatTime(firstSession.end_time)}`}
        </p>
      )}

      {/* Meeting-plan #25: waitlist count visible in the list at a glance. */}
      {waitlistCount > 0 && (
        <span
          className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "#FBEFD6", color: "#8A6510" }}
        >
          {waitlistCount} waitlisted
        </span>
      )}
    </div>
  );
}

// ─── Waitlist Card (Classes detail panel) ─────────────────────────────────────
// Meeting-plan #25: per-class waitlist queue with inline invite (Send link) and
// Register actions, so admins act from the single Classes view.

function WaitlistCard({
  entries,
  onChanged,
}: {
  entries: AdminWaitlistEntry[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleInvite(entry: AdminWaitlistEntry) {
    setBusyId(entry.id);
    setFeedback(null);
    const result = await inviteWaitlistEntryByLink(entry.id);
    setBusyId(null);
    setFeedback({
      id: entry.id,
      text: result.success ? "Payment link sent" : (result.error ?? "Failed to send"),
      ok: result.success,
    });
    if (result.success) onChanged();
  }

  const THRESHOLD = 4;
  const overflow = entries.length > THRESHOLD;
  const visible = expanded ? entries : entries.slice(0, THRESHOLD);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
    >
      <div
        className="flex items-center px-5 py-3.5"
        style={{ borderBottom: "0.5px solid #EDE9E4" }}
      >
        <span
          className="text-[13px] font-semibold flex items-center gap-2"
          style={{ color: "#201D18" }}
        >
          Waitlist
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "#EDE9E4", color: "#736D65" }}
          >
            {entries.length}
          </span>
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-5 text-[13px]" style={{ color: "#9E9890" }}>
          No one is waitlisted for this class.
        </p>
      ) : (
        <div>
          {visible.map((e, i) => (
            <div
              key={e.id}
              className="flex items-center gap-3.5 px-5 py-3"
              style={{
                borderBottom:
                  i < visible.length - 1 ? "0.5px solid #EDE9E4" : undefined,
              }}
            >
              <span
                className="shrink-0 flex items-center justify-center rounded-full text-[11px] font-bold"
                style={{ width: 22, height: 22, background: "#FBEFD6", color: "#8A6510" }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold flex items-center gap-1.5"
                  style={{ color: "#201D18" }}
                >
                  {e.dancerName ?? "—"}
                  {e.status === "invited" && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "#FBEFD6", color: "#7A4E08" }}
                    >
                      Invited
                    </span>
                  )}
                </p>
                <p className="text-[11px] truncate" style={{ color: "#9E9890" }}>
                  {e.contactName ?? e.contactEmail ?? "—"} · joined {fmtWaitlistDate(e.signedUpAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {feedback?.id === e.id && (
                  <span
                    className="text-[10px]"
                    style={{ color: feedback.ok ? "#0A5A50" : "#C14B3B" }}
                  >
                    {feedback.text}
                  </span>
                )}
                <button
                  onClick={() => handleInvite(e)}
                  disabled={busyId === e.id}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                  style={{ background: "#F2E7E4", color: "#5C1713" }}
                >
                  {busyId === e.id ? "Sending…" : "Send link"}
                </button>
                {/* Hands off to the manual registration flow with this entry
                    pre-loaded (dancer + class + semester + form answers). */}
                <Link
                  href={`/admin/register?fromWaitlist=${e.id}`}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
                  style={{ background: "#8E2A23" }}
                >
                  Register
                </Link>
              </div>
            </div>
          ))}
          {overflow && (
            <div className="px-5 py-3" style={{ borderTop: "0.5px solid #EDE9E4" }}>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[12px] font-semibold transition hover:opacity-70"
                style={{ color: "#8E2A23" }}
              >
                {expanded ? "Collapse ↑" : `Show all ${entries.length} →`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Capacity legend item ─────────────────────────────────────────────────────

function LegendItem({
  color,
  border,
  num,
  label,
}: {
  color?: string;
  border?: boolean;
  num: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block"
        style={{
          width: 9,
          height: 9,
          borderRadius: 3,
          background: color ?? "#EDE9E4",
          border: border ? "1px solid #DDD9D2" : undefined,
        }}
      />
      <span className="text-[13px] font-semibold" style={{ color: "#201D18" }}>
        {num}
      </span>
      <span className="text-[12px]" style={{ color: "#736D65" }}>
        {label}
      </span>
    </span>
  );
}

// ─── Collapsible reference card ────────────────────────────────────────────────

function CollapsibleCard({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        style={open ? { borderBottom: "0.5px solid #EDE9E4" } : undefined}
      >
        <span
          className="text-[13px] font-semibold flex items-center gap-2"
          style={{ color: "#201D18" }}
        >
          {title}
          {count !== undefined && (
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#EDE9E4", color: "#736D65" }}
            >
              {count}
            </span>
          )}
        </span>
        <svg
          className="w-4 h-4 transition-transform"
          style={{ color: "#9E9890", transform: open ? undefined : "rotate(-90deg)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─── Class Detail Panel ───────────────────────────────────────────────────────

function ClassDetailPanel({
  detail,
  registrants,
  waitlistEntries,
  onWaitlistChanged,
  onEmail,
  onEdit,
  onArchive,
  onCancelClass,
  archiving,
  archiveError,
}: {
  detail: ClassDetail;
  registrants: Registrant[];
  waitlistEntries: AdminWaitlistEntry[];
  onWaitlistChanged: () => void;
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

  // Meeting-plan #28: seat holds. `held` = live (mid-checkout) reservations;
  // `freed` = abandoned holds still keeping the seat full to the public until an
  // admin reopens them. Both occupy a seat, so neither counts as an open spot.
  const [holds, setHolds] = useState<{ held: number; freed: number }>({ held: 0, freed: 0 });
  const [reopening, setReopening] = useState(false);

  function loadHolds() {
    const sb = createClient();
    sb.from("class_meetings")
      .select("section_id")
      .eq("class_id", detail.id)
      .then(({ data }) => {
        const ids = [
          ...new Set(
            (data ?? [])
              .map((m) => (m as { section_id: string | null }).section_id)
              .filter((x): x is string => !!x),
          ),
        ];
        if (ids.length === 0) {
          setHolds({ held: 0, freed: 0 });
          return;
        }
        sb.rpc("admin_section_hold_breakdown", { p_section_ids: ids }).then(({ data: rows }) => {
          let held = 0;
          let freed = 0;
          for (const r of (rows ?? []) as { live_holds: number; freed_holds: number }[]) {
            held += r.live_holds ?? 0;
            freed += r.freed_holds ?? 0;
          }
          setHolds({ held, freed });
        });
      });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => loadHolds(), [detail.id]);

  async function handleReopen() {
    setReopening(true);
    await reopenFreedSeats(detail.id);
    setReopening(false);
    loadHolds();
  }

  const openSpots = Math.max(0, cap - confirmed - pending - holds.held - holds.freed);

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

  const [rosterExpanded,      setRosterExpanded]      = useState(false);
  const [attendanceExpanded,  setAttendanceExpanded]  = useState(false);
  const [attendanceData,      setAttendanceData]      = useState<import("@/queries/admin").AdminSessionAttendance[] | null>(null);
  const [attendanceLoading,   setAttendanceLoading]   = useState(false);
  // Redesign: kebab action menu + collapsible reference cards
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [scheduleOpen,    setScheduleOpen]    = useState(false);
  const [instructorsOpen, setInstructorsOpen] = useState(false);
  const [aboutOpen,       setAboutOpen]       = useState(false);

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
  const toast = useToast();

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
      toast.success(
        `Session cancelled. ${n} famil${n === 1 ? "y" : "ies"} notified via email & SMS.`
      );
      setCancellingSessionId(null);
      setCancelReason("");
    });
  }

  const ROSTER_THRESHOLD = 5;
  const rosterOverflow = registrants.length > ROSTER_THRESHOLD;

  // Redesign: summary-strip + capacity-card derived values
  const firstSession = sortedSessions[0];
  const daysLabel = [
    ...new Set(
      sortedSessions.map(
        (s) => s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1, 3)
      )
    ),
  ].join(" · ");
  const filled = confirmed + pending + holds.held + holds.freed;
  const capPct = (n: number) => (cap > 0 ? Math.min(100, (n / cap) * 100) : 0);
  const confirmedPct = capPct(confirmed);
  const pendingPct = capPct(pending);
  const heldPct = capPct(holds.held);
  const freedPct = capPct(holds.freed);
  const instructorCount = new Set(
    (assignments ?? []).flatMap((s) => s.instructors.map((i) => i.userId))
  ).size;

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

    <div className="pb-16">
      {/* ── Sticky header zone ── */}
      <div
        className="sticky top-0 z-[5] px-7 pt-6"
        style={{ background: "#fff", borderBottom: "0.5px solid #DDD9D2" }}
      >
        <div className="flex items-start gap-4">
          {/* Title + badges */}
          <div className="flex-1 min-w-0">
            <h1
              className="text-[24px] font-semibold leading-tight"
              style={{ color: "#201D18" }}
            >
              {detail.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span
                className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-0.5 rounded-full font-medium"
                style={{
                  background: detail.is_active ? "#C8EEE2" : "#EDE9E4",
                  color: detail.is_active ? "#0A5A50" : "#736D65",
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: detail.is_active ? "#0A5A50" : "#9E9890",
                  }}
                />
                {detail.is_active ? "Active" : "Inactive"}
              </span>
              <span
                className="text-[12px] px-2.5 py-0.5 rounded-full capitalize"
                style={{ background: "#EDE9E4", color: "#736D65" }}
              >
                {detail.discipline.replace(/_/g, " ")}
              </span>
              <span
                className="text-[12px] px-2.5 py-0.5 rounded-full"
                style={{ background: "#EDE9E4", color: "#736D65" }}
              >
                {DIVISION_LABELS[detail.division] ?? detail.division}
              </span>
              {semester && (
                <span
                  className="text-[12px] px-2.5 py-0.5 rounded-full"
                  style={{ background: "#EDE9E4", color: "#736D65" }}
                >
                  {semester.name}
                </span>
              )}
            </div>
          </div>

          {/* Header actions */}
          <div className="relative flex items-center gap-2 shrink-0">
            <Link
              href={`/admin/register?semester=${detail.semester_id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-white transition hover:opacity-90"
              style={{ background: "#8E2A23" }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Register into class
            </Link>
            <button
              onClick={onEmail}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition hover:opacity-90"
              style={{ background: "#F2E7E4", color: "#5C1713" }}
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
              Email class
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-lg transition hover:bg-[#F7F5F2]"
              style={{ width: 34, height: 34, border: "0.5px solid #DDD9D2", color: "#736D65" }}
              aria-label="More actions"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[10]"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  className="absolute right-0 z-[20] rounded-xl p-1.5"
                  style={{
                    top: 42,
                    width: 210,
                    background: "#fff",
                    border: "0.5px solid #DDD9D2",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                  }}
                >
                  {!isLocked && (
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition hover:bg-[#F7F5F2]"
                      style={{ color: "#201D18" }}
                    >
                      <svg className="w-[15px] h-[15px]" style={{ color: "#736D65" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
                      </svg>
                      Edit details
                    </button>
                  )}
                  {semester && (
                    <Link
                      href={`/admin/semesters/${detail.semester_id}/edit?step=sessions`}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition hover:bg-[#F7F5F2]"
                      style={{ color: "#201D18" }}
                    >
                      <svg className="w-[15px] h-[15px]" style={{ color: "#736D65" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                      Edit in semester
                    </Link>
                  )}
                  {(!isLocked || detail.is_active) && (
                    <div style={{ height: "0.5px", background: "#EDE9E4", margin: "6px 4px" }} />
                  )}
                  {!isLocked && (
                    <button
                      onClick={() => { setMenuOpen(false); onArchive(); }}
                      disabled={archiving}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition hover:bg-[#F7F5F2] disabled:opacity-50"
                      style={{ color: "#8E2A23" }}
                    >
                      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="4" rx="1" />
                        <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                        <path d="M10 12h4" />
                      </svg>
                      {detail.is_active ? "Archive class" : "Restore class"}
                    </button>
                  )}
                  {detail.is_active && (
                    <button
                      onClick={() => { setMenuOpen(false); onCancelClass(); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition hover:bg-[#F7F5F2]"
                      style={{ color: "#C14B3B" }}
                    >
                      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m15 9-6 6M9 9l6 6" />
                      </svg>
                      Cancel class
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9E9890" }}>
              Schedule
            </span>
            <span className="text-[13px] font-semibold" style={{ color: "#201D18" }}>
              {daysLabel || "—"}
            </span>
          </div>
          <div style={{ width: "0.5px", alignSelf: "stretch", background: "#DDD9D2" }} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9E9890" }}>
              Time
            </span>
            <span className="text-[13px] font-medium" style={{ color: "#736D65" }}>
              {firstSession?.start_time
                ? `${formatTime(firstSession.start_time)} – ${formatTime(firstSession.end_time)}`
                : "—"}
            </span>
          </div>
          <div style={{ width: "0.5px", alignSelf: "stretch", background: "#DDD9D2" }} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9E9890" }}>
              Sessions
            </span>
            <span className="text-[13px] font-medium" style={{ color: "#736D65" }}>
              {detail.class_meetings.length} weekly
            </span>
          </div>
          <div style={{ width: "0.5px", alignSelf: "stretch", background: "#DDD9D2" }} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9E9890" }}>
              Capacity
            </span>
            <span className="text-[13px] font-semibold" style={{ color: "#201D18" }}>
              {confirmed} / {cap || "—"} enrolled
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-7 pt-5 flex flex-col gap-4">

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

      {/* Enrollment capacity card — single source of truth (incl. seat holds) */}
      <div
        className="rounded-xl p-5"
        style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-[13px] font-semibold" style={{ color: "#201D18" }}>
            Enrollment
          </span>
          <span className="text-[12px]" style={{ color: "#736D65" }}>
            <b style={{ color: "#201D18" }}>{filled}</b> of {cap || "—"} spots filled ·{" "}
            <b style={{ color: "#201D18" }}>{openSpots}</b> open
          </span>
        </div>
        <div
          className="flex overflow-hidden rounded-full"
          style={{ height: 12, background: "#EDE9E4" }}
        >
          <div style={{ width: `${confirmedPct}%`, height: "100%", background: "#8E2A23" }} />
          <div style={{ width: `${pendingPct}%`, height: "100%", background: "#D9A66B" }} />
          {holds.held > 0 && (
            <div style={{ width: `${heldPct}%`, height: "100%", background: "#7DCEC2" }} />
          )}
          {holds.freed > 0 && (
            <div style={{ width: `${freedPct}%`, height: "100%", background: "#C8A09D" }} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 mt-3.5">
          <LegendItem color="#8E2A23" num={confirmed} label="Confirmed" />
          <LegendItem color="#D9A66B" num={pending} label="Pending" />
          {/* Meeting-plan #28: live reservations (someone mid-checkout). */}
          {holds.held > 0 && (
            <LegendItem color="#7DCEC2" num={holds.held} label="Held (in checkout)" />
          )}
          {/* Abandoned holds — still "full" to the public until reopened. */}
          {holds.freed > 0 && (
            <span className="flex items-center gap-2">
              <LegendItem color="#C8A09D" num={holds.freed} label="Freed (abandoned)" />
              <button
                type="button"
                onClick={handleReopen}
                disabled={reopening}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "#C8EEE2", color: "#0A5A50", opacity: reopening ? 0.6 : 1 }}
                title="Release abandoned seats back to the public catalog"
              >
                {reopening ? "Reopening…" : "Reopen"}
              </button>
            </span>
          )}
          <LegendItem border num={openSpots} label="Open" />
          <LegendItem color="#FBEFD6" num={waitlistEntries.length} label="Waitlisted" />
        </div>
      </div>

      {/* Registered dancers roster — the main work */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#fff", border: "0.5px solid #DDD9D2" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "0.5px solid #EDE9E4" }}
        >
          <span
            className="text-[13px] font-semibold flex items-center gap-2"
            style={{ color: "#201D18" }}
          >
            Registered dancers
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#EDE9E4", color: "#736D65" }}
            >
              {registrants.length}
            </span>
          </span>
          <Link
            href={`/admin/register?semester=${detail.semester_id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition hover:bg-[#DDD9D2]"
            style={{ background: "#EDE9E4", color: "#38342E" }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add dancer
          </Link>
        </div>

        {registrants.length === 0 ? (
          <p className="px-5 py-7 text-center text-[13px]" style={{ color: "#9E9890" }}>
            No registrations yet.
          </p>
        ) : (
          <>
            <div
              className="[&::-webkit-scrollbar]:w-0"
              style={{
                maxHeight: rosterExpanded ? "none" : `${ROSTER_THRESHOLD * 42}px`,
                overflowY: "auto",
                scrollbarWidth: "none",
              }}
            >
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    {["Dancer", "Parent", "Status", "Enrolled"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider font-medium"
                        style={{
                          color: "#9E9890",
                          background: "#fff",
                          borderBottom: "0.5px solid #DDD9D2",
                          position: "sticky",
                          top: 0,
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
                      <td className="px-5 py-2.5 font-medium">
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
                      <td className="px-5 py-2.5" style={{ color: "#736D65" }}>
                        {r.parentName ?? "—"}
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block rounded-full"
                            style={{
                              width: "6px",
                              height: "6px",
                              background:
                                r.status === "confirmed"
                                  ? "#1D9E75"
                                  : r.status === "pending_payment" || r.status === "pending"
                                  ? "#E8A838"
                                  : "#9E9890",
                            }}
                          />
                          <span className="capitalize" style={{ color: "#201D18" }}>
                            {r.status.replace(/_/g, " ")}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-[11px]" style={{ color: "#9E9890" }}>
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
            {rosterOverflow && (
              <div className="px-5 py-3" style={{ borderTop: "0.5px solid #EDE9E4" }}>
                <button
                  onClick={() => setRosterExpanded((v) => !v)}
                  className="text-[12px] font-semibold transition hover:opacity-70"
                  style={{ color: "#8E2A23" }}
                >
                  {rosterExpanded
                    ? "Collapse ↑"
                    : `Show all ${registrants.length} dancers →`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Meeting-plan #25: per-class waitlist queue + inline actions. */}
      <WaitlistCard entries={waitlistEntries} onChanged={onWaitlistChanged} />

      {/* Schedule & sessions (collapsible) — incl. per-session cancel */}
      <CollapsibleCard
        title="Schedule & sessions"
        open={scheduleOpen}
        onToggle={() => setScheduleOpen((v) => !v)}
      >
        {visibleSessions.length === 0 ? (
          <p className="px-5 py-5 text-[13px]" style={{ color: "#9E9890" }}>
            No sessions defined.
          </p>
        ) : (
          visibleSessions.map((s, i) => (
            <div
              key={s.id}
              className="group flex items-center gap-3 px-5 py-3"
              style={{
                borderBottom:
                  i < visibleSessions.length - 1 ? "0.5px solid #EDE9E4" : undefined,
              }}
            >
              <span
                className="shrink-0 flex items-center justify-center text-[10px] font-bold rounded-md"
                style={{ background: "#F2E7E4", color: "#5C1713", width: 38, height: 24 }}
              >
                {s.day_of_week.slice(0, 3).toUpperCase()}
              </span>
              <span className="flex-1 text-[13px]" style={{ color: "#201D18" }}>
                {formatTime(s.start_time)} – {formatTime(s.end_time)}
              </span>
              {s.capacity && (
                <span className="text-[12px]" style={{ color: "#736D65" }}>
                  {sessionEnrolledCounts[s.id] ?? 0} / {s.capacity}
                </span>
              )}
              <button
                onClick={() => {
                  setCancellingSessionId(s.id);
                  setCancelReason("");
                  setCancelError(null);
                }}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-[11px] px-2 py-0.5 rounded transition hover:bg-red-50"
                style={{ color: "#C14B3B" }}
                title="Cancel this session"
              >
                Cancel
              </button>
            </div>
          ))
        )}
      </CollapsibleCard>

      {/* ── Instructors (collapsible) ─────────────────────────────── */}
      {addingToSessionId && (
        <div
          className="fixed inset-0 z-[5]"
          onClick={() => setAddingToSessionId(null)}
        />
      )}
      <CollapsibleCard
        title="Instructors"
        count={instructorCount}
        open={instructorsOpen}
        onToggle={() => setInstructorsOpen((v) => !v)}
      >
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
      </CollapsibleCard>

      {/* About this class (collapsible) */}
      <CollapsibleCard
        title="About this class"
        open={aboutOpen}
        onToggle={() => setAboutOpen((v) => !v)}
      >
        <div className="px-5 py-4 text-[13px] leading-relaxed" style={{ color: "#736D65" }}>
          {(detail.min_age || detail.max_age) && (
            <p className="mb-2 font-medium" style={{ color: "#201D18" }}>
              Ages {detail.min_age ?? "?"}–{detail.max_age ?? "?"}
              {detail.min_grade || detail.max_grade
                ? ` · Grades ${detail.min_grade ?? "?"}–${detail.max_grade ?? "?"}`
                : ""}
            </p>
          )}
          {detail.description || "No description provided."}
        </div>
      </CollapsibleCard>

      {/* ── Attendance (collapsible) ──────────────────────────────── */}
      <CollapsibleCard
        title="Attendance records"
        open={attendanceExpanded}
        onToggle={handleAttendanceToggle}
      >
        <div>
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
        </CollapsibleCard>
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
  // Meeting-plan #25: active waitlist entries (waiting/invited) across all classes.
  const [waitlist, setWaitlist] = useState<AdminWaitlistEntry[]>([]);

  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelClassModal, setShowCancelClassModal] = useState(false);
  const toast = useToast();
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

  // Meeting-plan #25: load the active waitlist once. getWaitlistEntries returns
  // all waiting/invited entries; we bucket them per class for the list + detail.
  function refreshWaitlist() {
    getWaitlistEntries().then(setWaitlist);
  }
  useEffect(() => {
    refreshWaitlist();
  }, []);

  const waitlistCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of waitlist) {
      if (e.classId) counts[e.classId] = (counts[e.classId] ?? 0) + 1;
    }
    return counts;
  }, [waitlist]);

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
    toast.success(
      `Class cancelled. ${notified} famil${notified === 1 ? "y" : "ies"} notified via email & SMS.`
    );
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
                  waitlistCount={waitlistCounts[cls.id] ?? 0}
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
              waitlistEntries={detail ? waitlist.filter((e) => e.classId === detail.id) : []}
              onWaitlistChanged={refreshWaitlist}
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
