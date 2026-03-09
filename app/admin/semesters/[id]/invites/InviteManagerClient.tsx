"use client";

import { useState, useEffect, useTransition } from "react";
import type { ClassInviteRow, InviteAccessType } from "@/types";
import {
  listClassInvites,
  createClassInvite,
  revokeClassInvite,
  listAuditionSessions,
  createAuditionSession,
} from "@/app/actions/competition/manageInvites";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface CompClass {
  id: string;
  name: string;
  discipline: string;
  division: string;
  visibility: string;
  enrollment_type: string;
  /** Per-class invitation email config; null if not yet configured. */
  invite_email?: {
    subject: string;
    fromName: string;
    fromEmail: string;
    htmlBody: string;
  } | null;
}

const ACCESS_TYPE_DESCRIPTIONS: Record<InviteAccessType, string> = {
  invite_only:
    "Creates a one-time invite tied to the email you enter. Only that specific link works for that dancer.",
  token_link:
    "Creates a shareable URL. Anyone with the link can book a slot. Set a max-use cap to limit total bookings.",
  hybrid:
    "Sends a named invite but uses a shareable link — the named dancer and anyone else with the URL can book.",
};

interface AuditionSessionRow {
  id: string;
  label: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  capacity: number | null;
  price: number | null;
  bookingCount: number;
}

interface Props {
  semesterId: string;
  classes: CompClass[];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function InviteManagerClient({ semesterId, classes }: Props) {
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classes[0]?.id ?? "",
  );
  const [invites, setInvites] = useState<ClassInviteRow[]>([]);
  const [sessions, setSessions] = useState<AuditionSessionRow[]>([]);
  const [activeTab, setActiveTab] = useState<"invites" | "sessions" | "activity">("invites");
  const [isPending, startTransition] = useTransition();

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccessType, setInviteAccessType] =
    useState<InviteAccessType>("invite_only");
  const [inviteMaxUses, setInviteMaxUses] = useState("1");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  // Email modal
  const [emailModalInvite, setEmailModalInvite] = useState<ClassInviteRow | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  // Session form
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("");
  const [sessionStartAt, setSessionStartAt] = useState("");
  const [sessionEndAt, setSessionEndAt] = useState("");
  const [sessionLocation, setSessionLocation] = useState("");
  const [sessionCapacity, setSessionCapacity] = useState("");
  const [sessionPrice, setSessionPrice] = useState("");

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  useEffect(() => {
    if (!selectedClassId) return;
    startTransition(async () => {
      const [inv, sess] = await Promise.all([
        listClassInvites(selectedClassId),
        listAuditionSessions(selectedClassId),
      ]);
      setInvites(inv);
      setSessions(sess as AuditionSessionRow[]);
    });
  }, [selectedClassId]);

  /* ---- Invite creation -------------------------------------------------- */

  async function handleCreateInvite() {
    const result = await createClassInvite({
      classId: selectedClassId,
      accessType: inviteAccessType,
      email: inviteEmail || undefined,
      expiresAt: inviteExpiry || undefined,
      maxUses:
        inviteAccessType === "token_link"
          ? inviteMaxUses
            ? parseInt(inviteMaxUses, 10)
            : undefined
          : 1,
      notes: inviteNotes || undefined,
    });

    if (!result.success) {
      alert(result.error);
      return;
    }

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/audition/${result.invite.invite_token}`;
    setCreatedLink(link);

    // Refresh invite list
    const updated = await listClassInvites(selectedClassId);
    setInvites(updated);
    setShowInviteForm(false);
    resetInviteForm();
  }

  function resetInviteForm() {
    setInviteEmail("");
    setInviteAccessType("invite_only");
    setInviteMaxUses("1");
    setInviteExpiry("");
    setInviteNotes("");
  }

  /* ---- Invite revoke ---------------------------------------------------- */

  async function handleRevoke(inviteId: string) {
    if (!confirm("Revoke this invitation? The link will stop working.")) return;
    await revokeClassInvite(inviteId);
    const updated = await listClassInvites(selectedClassId);
    setInvites(updated);
  }

  /* ---- Session creation ------------------------------------------------- */

  async function handleCreateSession() {
    const result = await createAuditionSession({
      classId: selectedClassId,
      semesterId,
      label: sessionLabel || undefined,
      startAt: sessionStartAt,
      endAt: sessionEndAt,
      location: sessionLocation || undefined,
      capacity: sessionCapacity ? parseInt(sessionCapacity, 10) : undefined,
      price: sessionPrice ? parseFloat(sessionPrice) : undefined,
    });

    if (!result.success) {
      alert(result.error);
      return;
    }

    const updated = (await listAuditionSessions(
      selectedClassId,
    )) as AuditionSessionRow[];
    setSessions(updated);
    setShowSessionForm(false);
    setSessionLabel("");
    setSessionStartAt("");
    setSessionEndAt("");
    setSessionLocation("");
    setSessionCapacity("");
    setSessionPrice("");
  }

  /* ---- Email helper ----------------------------------------------------- */

  function buildInviteEmailText(invite: ClassInviteRow): {
    subject: string;
    body: string;
  } {
    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/audition/${invite.invite_token}`
        : `/audition/${invite.invite_token}`;
    const config = selectedClass?.invite_email;
    const className = selectedClass?.name ?? "our competition team";

    const subject =
      config?.subject ||
      `You're invited to audition — ${className}`;

    // Strip HTML tags from htmlBody for plain-text copy, or use the canonical default template.
    const rawBody = config?.htmlBody
      ? config.htmlBody.replace(/<[^>]+>/g, "").trim()
      : `Hi,\n\nYou have been personally selected to audition for {{class_name}}.\n\nPlease choose your audition time using the link below:\n\n{{invite_link}}\n\nWe look forward to seeing you at {{studio_name}}!`;

    // Substitute canonical tokens, with a catch-all for any remaining {{…}} placeholders.
    const body = rawBody
      .replace(/\{\{invite_link\}\}/g, link)
      .replace(/\{\{class_name\}\}/g, className)
      .replace(/\{\{studio_name\}\}/g, "our studio")
      .replace(/\{\{[^}]+\}\}/g, link);

    return { subject, body };
  }

  /* ---- Render ----------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Class selector */}
      <div className="flex gap-2 flex-wrap">
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelectedClassId(c.id);
              setCreatedLink(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              selectedClassId === c.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {selectedClass && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Class header */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">
                {selectedClass.name}
              </h2>
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 capitalize">
                  {selectedClass.visibility.replace(/_/g, " ")}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                  {selectedClass.discipline.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab("invites")}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === "invites"
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Invites
              <span className="ml-1.5 text-xs rounded-full bg-gray-100 text-gray-600 px-1.5 py-0.5">
                {invites.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("sessions")}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === "sessions"
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Audition Slots
              <span className="ml-1.5 text-xs rounded-full bg-gray-100 text-gray-600 px-1.5 py-0.5">
                {sessions.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === "activity"
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Activity Log
            </button>
          </div>

          {/* Tab: Invites */}
          {activeTab === "invites" && (
            <div className="p-6 space-y-4">
              {/* Created link banner */}
              {createdLink && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-medium text-green-800">
                    Invite link created — copy and share it:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-1.5 text-green-900 truncate">
                      {createdLink}
                    </code>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(createdLink)
                      }
                      className="shrink-0 text-xs text-green-700 hover:text-green-900 font-medium"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Create invite form toggle */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowInviteForm((v) => !v);
                    setCreatedLink(null);
                  }}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {showInviteForm ? "Cancel" : "+ New Invite"}
                </button>
              </div>

              {showInviteForm && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
                  <h3 className="text-sm font-medium text-gray-900">
                    Create Invitation
                  </h3>

                  {/* Access type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Access Type
                    </label>
                    <select
                      value={inviteAccessType}
                      onChange={(e) =>
                        setInviteAccessType(e.target.value as InviteAccessType)
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="invite_only">Personal Invite — specific dancer only</option>
                      <option value="token_link">Open Link — anyone with the URL</option>
                      <option value="hybrid">Shared Link — named dancer + anyone with the URL</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {ACCESS_TYPE_DESCRIPTIONS[inviteAccessType]}
                    </p>
                  </div>

                  {/* Email */}
                  {inviteAccessType !== "token_link" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {/* Max uses (token_link only) */}
                  {inviteAccessType === "token_link" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Max Uses{" "}
                        <span className="text-gray-400">(leave blank for unlimited)</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={inviteMaxUses}
                        onChange={(e) => setInviteMaxUses(e.target.value)}
                        placeholder="e.g. 20"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {/* Expiry */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Expires At{" "}
                      <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={inviteExpiry}
                      onChange={(e) => setInviteExpiry(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Internal Notes{" "}
                      <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={inviteNotes}
                      onChange={(e) => setInviteNotes(e.target.value)}
                      placeholder="e.g. Sent to Maple Dance Studio outreach"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    onClick={handleCreateInvite}
                    className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 transition-colors"
                  >
                    Create Invite
                  </button>
                </div>
              )}

              {/* Invite table */}
              {isPending ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : invites.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No invites yet. Create one above.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Email / Target</th>
                        <th className="px-4 py-2.5 text-center">Opens</th>
                        <th className="px-4 py-2.5 text-center">Registered</th>
                        <th className="px-4 py-2.5 text-center">Uses</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">First Opened</th>
                        <th className="px-4 py-2.5">Expires</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invites.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 capitalize">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              {inv.access_type.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 max-w-40 truncate">
                            {inv.dancer
                              ? `${inv.dancer.first_name} ${inv.dancer.last_name}`
                              : inv.email ?? (
                                  <span className="text-gray-400 italic">
                                    Link invite
                                  </span>
                                )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {inv.event_counts?.opened ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {inv.event_counts?.registered ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {inv.max_uses === null
                              ? `${inv.use_count} / ∞`
                              : `${inv.use_count} / ${inv.max_uses}`}
                          </td>
                          <td className="px-4 py-3">
                            <InviteStatusBadge invite={inv} />
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {inv.opened_at
                              ? new Date(inv.opened_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {inv.expires_at
                              ? new Date(inv.expires_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEmailModalInvite(inv);
                                  setEmailCopied(false);
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700"
                                title="Generate invitation email"
                              >
                                Generate email
                              </button>
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(
                                    `${window.location.origin}/audition/${inv.invite_token}`,
                                  )
                                }
                                className="text-xs text-gray-500 hover:text-gray-700"
                                title="Copy link"
                              >
                                Copy link
                              </button>
                              {inv.status !== "revoked" && (
                                <button
                                  onClick={() => handleRevoke(inv.id)}
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Audition Sessions */}
          {activeTab === "sessions" && (
            <div className="p-6 space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowSessionForm((v) => !v)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {showSessionForm ? "Cancel" : "+ New Audition Slot"}
                </button>
              </div>

              {showSessionForm && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
                  <h3 className="text-sm font-medium text-gray-900">
                    Create Audition Slot
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Label{" "}
                        <span className="text-gray-400">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={sessionLabel}
                        onChange={(e) => setSessionLabel(e.target.value)}
                        placeholder="e.g. Monday Morning Slot"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Start
                      </label>
                      <input
                        type="datetime-local"
                        value={sessionStartAt}
                        onChange={(e) => setSessionStartAt(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        End
                      </label>
                      <input
                        type="datetime-local"
                        value={sessionEndAt}
                        onChange={(e) => setSessionEndAt(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <input
                        type="text"
                        value={sessionLocation}
                        onChange={(e) => setSessionLocation(e.target.value)}
                        placeholder="Studio A"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Capacity{" "}
                        <span className="text-gray-400">(blank = unlimited)</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={sessionCapacity}
                        onChange={(e) => setSessionCapacity(e.target.value)}
                        placeholder="e.g. 15"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Price ($){" "}
                        <span className="text-gray-400">(blank = free)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={sessionPrice}
                        onChange={(e) => setSessionPrice(e.target.value)}
                        placeholder="e.g. 25.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateSession}
                    disabled={!sessionStartAt || !sessionEndAt}
                    className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium py-2.5 disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                  >
                    Create Slot
                  </button>
                </div>
              )}

              {isPending ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No audition slots yet. Create one above.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5">Slot</th>
                        <th className="px-4 py-2.5">Date / Time</th>
                        <th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5 text-center">Capacity</th>
                        <th className="px-4 py-2.5 text-center">Booked</th>
                        <th className="px-4 py-2.5">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sessions.map((sess) => {
                        const start = new Date(sess.start_at);
                        const end = new Date(sess.end_at);
                        return (
                          <tr key={sess.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {sess.label ??
                                start.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {start.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              {start.toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}{" "}
                              &ndash;{" "}
                              {end.toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {sess.location ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600">
                              {sess.capacity ?? "∞"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`font-medium ${
                                  sess.capacity !== null &&
                                  sess.bookingCount >= sess.capacity
                                    ? "text-red-600"
                                    : "text-gray-700"
                                }`}
                              >
                                {sess.bookingCount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {sess.price !== null
                                ? `$${Number(sess.price).toFixed(2)}`
                                : "Free"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Activity Log */}
          {activeTab === "activity" && (
            <div className="p-6">
              <p className="text-sm text-gray-400 text-center py-8">
                Activity log coming soon — will show opens, clicks, bookings, expirations, and revocations across all invites for this track.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Invitation Email Modal */}
      {emailModalInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg space-y-4 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Invitation Email</h3>
              <button
                onClick={() => {
                  setEmailModalInvite(null);
                  setEmailCopied(false);
                }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Subject
                </p>
                {selectedClass?.invite_email ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                    Class Template
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    System Default
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">
                {buildInviteEmailText(emailModalInvite).subject}
              </p>
            </div>

            {/* Body */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Body
                </p>
                {selectedClass?.invite_email ? (
                  <a
                    href={`/admin/semesters/${semesterId}/edit?step=sessions`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Edit template →
                  </a>
                ) : null}
              </div>
              <pre className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-3 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                {buildInviteEmailText(emailModalInvite).body}
              </pre>
            </div>

            {/* Template notice */}
            {!selectedClass?.invite_email && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Using system default template.{" "}
                <a
                  href={`/admin/semesters/${semesterId}/edit?step=sessions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-900"
                >
                  Configure a custom template →
                </a>
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  const { subject, body } = buildInviteEmailText(emailModalInvite);
                  navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 2000);
                }}
                className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 transition-colors"
              >
                {emailCopied ? "Copied!" : "Copy Email"}
              </button>
              <a
                href="/admin/emails/new"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center whitespace-nowrap"
              >
                Create Email Draft →
              </a>
              <button
                onClick={() => {
                  setEmailModalInvite(null);
                  setEmailCopied(false);
                }}
                className="px-4 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function InviteStatusBadge({ invite }: { invite: ClassInviteRow }) {
  const { status, isExpired, isExhausted } = invite;

  const effectiveStatus =
    status === "revoked"
      ? "revoked"
      : isExpired
        ? "expired"
        : isExhausted
          ? "exhausted"
          : status;

  const colors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    sent: "bg-blue-50 text-blue-700",
    opened: "bg-yellow-50 text-yellow-700",
    registered: "bg-green-50 text-green-700",
    expired: "bg-gray-100 text-gray-500",
    exhausted: "bg-gray-100 text-gray-500",
    revoked: "bg-red-50 text-red-600",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
        colors[effectiveStatus] ?? colors.pending
      }`}
    >
      {effectiveStatus}
    </span>
  );
}
