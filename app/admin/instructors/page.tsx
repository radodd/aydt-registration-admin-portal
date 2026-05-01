"use client";

import { useEffect, useState, useTransition } from "react";
import { getInstructors, type InstructorRow } from "@/queries/admin";
import { createInstructor, type CreateInstructorInput } from "./actions/createInstructor";
import { setInstructorStatus } from "./actions/setInstructorStatus";
import { FormField, ModalActions, inputCls } from "@/app/admin/families/_components/FormHelpers";

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function InstructorsAdmin() {
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showInvite,  setShowInvite]  = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isPending,   startTransition] = useTransition();

  const reload = () =>
    getInstructors().then((data) => setInstructors(data)).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  const handleInvite = (input: CreateInstructorInput) => {
    startTransition(async () => {
      try {
        setInviteError(null);
        await createInstructor(input);
        await reload();
        setShowInvite(false);
      } catch (e: unknown) {
        setInviteError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  const handleToggleStatus = (instructor: InstructorRow) => {
    if (instructor.status === "invited") return; // button hidden in UI, but guard here too
    const next = instructor.status === "active" ? "inactive" : "active";
    const label = next === "inactive" ? "deactivate" : "reactivate";
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${instructor.first_name} ${instructor.last_name}?`)) return;

    startTransition(async () => {
      await setInstructorStatus(instructor.id, next);
      await reload();
    });
  };

  const active   = instructors.filter((i) => i.status === "active");
  const invited  = instructors.filter((i) => i.status === "invited");
  const inactive = instructors.filter((i) => i.status === "inactive");

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto">
        <div className="text-sm text-neutral-400">Loading instructors…</div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto space-y-5">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Instructors</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {active.length} active
            {invited.length > 0 && ` · ${invited.length} pending`}
            {inactive.length > 0 && ` · ${inactive.length} inactive`}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
        >
          + Invite Instructor
        </button>
      </div>

      {/* ── Instructor list ───────────────────────────────────────── */}
      {instructors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-6 py-12 text-center text-sm text-neutral-400">
          No instructors yet. Invite one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {instructors.map((instructor) => (
            <InstructorRow
              key={instructor.id}
              instructor={instructor}
              onToggleStatus={() => handleToggleStatus(instructor)}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* ── Invite modal ──────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <InviteInstructorModal
              onSubmit={handleInvite}
              onClose={() => { setShowInvite(false); setInviteError(null); }}
              error={inviteError}
              isPending={isPending}
            />
          </div>
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* InstructorRow                                                               */
/* -------------------------------------------------------------------------- */

function InstructorRow({
  instructor,
  onToggleStatus,
  isPending,
}: {
  instructor: InstructorRow;
  onToggleStatus: () => void;
  isPending: boolean;
}) {
  const status  = instructor.status ?? "inactive";
  const initials = `${instructor.first_name[0]}${instructor.last_name[0]}`.toUpperCase();

  const statusBadge = {
    active:   { label: "Active",  cls: "bg-green-100 text-green-700" },
    invited:  { label: "Invited", cls: "bg-amber-50 text-amber-600 border border-amber-200" },
    inactive: { label: "Inactive", cls: "bg-neutral-100 text-neutral-500" },
  }[status] ?? { label: "Inactive", cls: "bg-neutral-100 text-neutral-500" };

  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-neutral-200 bg-white">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-900 text-sm">
          {instructor.first_name} {instructor.last_name}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 truncate">
          {instructor.email}
          {instructor.phone_number && ` · ${instructor.phone_number}`}
        </p>
      </div>

      {/* Stats + status + action */}
      <div className="flex items-center gap-3 shrink-0">
        {instructor.sessionCount > 0 && (
          <span className="text-xs text-neutral-500 hidden sm:block">
            {instructor.sessionCount} session{instructor.sessionCount !== 1 ? "s" : ""}
          </span>
        )}

        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>

        {/* Only active/inactive instructors can be toggled — invited are still pending */}
        {status !== "invited" && (
          <button
            onClick={onToggleStatus}
            disabled={isPending}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
              status === "active"
                ? "border-red-200 text-red-600 hover:bg-red-50"
                : "border-green-200 text-green-700 hover:bg-green-50"
            }`}
          >
            {status === "active" ? "Deactivate" : "Reactivate"}
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* InviteInstructorModal                                                       */
/* -------------------------------------------------------------------------- */

function InviteInstructorModal({
  onSubmit,
  onClose,
  error,
  isPending,
}: {
  onSubmit: (input: CreateInstructorInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ firstName, lastName, email });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Invite Instructor</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          They&apos;ll receive an email with a link to set their password.
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Last Name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
        </FormField>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions onClose={onClose} isPending={isPending} submitLabel="Send Invite" />
    </form>
  );
}
