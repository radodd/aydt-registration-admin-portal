"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getWaitlistEntries, type AdminWaitlistEntry } from "./queries";
import { inviteWaitlistEntryByLink } from "./actions/inviteWaitlistEntryByLink";
import { getFreedSeats, type FreedSeatGroup } from "./actions/getFreedSeats";
import { reopenFreedSeatsToPublic } from "./actions/reopenFreedSeatsToPublic";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    waiting: "bg-neutral-100 text-neutral-600",
    invited: "bg-amber-50 text-amber-700",
    registered: "bg-emerald-50 text-emerald-700",
    declined: "bg-rose-50 text-rose-700",
    expired: "bg-neutral-100 text-neutral-400",
    cancelled: "bg-neutral-100 text-neutral-400",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
        map[status] ?? "bg-neutral-100 text-neutral-600"
      }`}
    >
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function WaitlistAdminPage() {
  const [entries, setEntries] = useState<AdminWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [freedSeats, setFreedSeats] = useState<FreedSeatGroup[]>([]);
  const [reopenBusy, setReopenBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [ents, freed] = await Promise.all([getWaitlistEntries(), getFreedSeats()]);
    setEntries(ents);
    setFreedSeats(freed);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const byClass = useMemo(() => {
    const groups = new Map<string, { classId: string; className: string; semesterName: string; rows: AdminWaitlistEntry[] }>();
    for (const e of entries) {
      const key = e.classId ?? "unknown";
      if (!groups.has(key)) {
        groups.set(key, { classId: e.classId ?? "", className: e.className, semesterName: e.semesterName, rows: [] });
      }
      groups.get(key)!.rows.push(e);
    }
    return [...groups.values()];
  }, [entries]);

  const freedByClass = useMemo(() => {
    const m = new Map<string, FreedSeatGroup>();
    for (const f of freedSeats) m.set(f.classId, f);
    return m;
  }, [freedSeats]);
  const freedNoQueue = freedSeats.filter((f) => f.queueSize === 0 && f.freedCount > 0);

  async function handleReopen(classId: string) {
    setReopenBusy(classId);
    setFeedback(null);
    const result = await reopenFreedSeatsToPublic(classId);
    setReopenBusy(null);
    if (result.success) load();
    else setFeedback({ id: classId, text: result.error ?? "Failed to reopen", ok: false });
  }

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
    if (result.success) load();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Waitlist</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Families who joined a class waitlist, in sign-up order. Invitations are
          manual — no automatic emails are ever sent.
        </p>
      </div>

      {freedNoQueue.length > 0 && (
        <div className="mb-6 border border-amber-200 bg-amber-50/60 rounded-2xl p-5">
          <div className="font-semibold text-neutral-900 mb-1">Open seats from refunds</div>
          <p className="text-xs text-neutral-500 mb-3">
            Seats freed by a refund with no one waiting. Reopen them to the public catalog, or leave them held.
          </p>
          <div className="space-y-2">
            {freedNoQueue.map((f) => (
              <div
                key={f.classId}
                className="flex items-center justify-between bg-white rounded-xl border border-neutral-200 px-4 py-2.5"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-900">{f.className}</div>
                  <div className="text-xs text-neutral-500">
                    {f.semesterName ? `${f.semesterName} · ` : ""}
                    {f.freedCount} open seat{f.freedCount !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {feedback?.id === f.classId && !feedback.ok && (
                    <span className="text-xs text-rose-600">{feedback.text}</span>
                  )}
                  <button
                    onClick={() => handleReopen(f.classId)}
                    disabled={reopenBusy === f.classId}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-50"
                  >
                    {reopenBusy === f.classId
                      ? "Reopening…"
                      : `Reopen ${f.freedCount} to public`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-400 py-12 text-center">Loading…</div>
      ) : byClass.length === 0 ? (
        <div className="text-sm text-neutral-400 py-12 text-center border border-dashed border-neutral-200 rounded-2xl">
          No one is currently on a waitlist.
        </div>
      ) : (
        <div className="space-y-8">
          {byClass.map((group) => (
            <div key={group.className} className="border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="bg-neutral-50 px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-neutral-900">{group.className}</div>
                  {group.semesterName && (
                    <div className="text-xs text-neutral-500">{group.semesterName}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(freedByClass.get(group.classId)?.freedCount ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {freedByClass.get(group.classId)!.freedCount} freed — register to fill
                    </span>
                  )}
                  <div className="text-xs text-neutral-500">
                    {group.rows.length} waitlisted
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-neutral-100">
                    <th className="px-5 py-2 font-medium">#</th>
                    <th className="px-5 py-2 font-medium">Dancer</th>
                    <th className="px-5 py-2 font-medium">Contact</th>
                    <th className="px-5 py-2 font-medium">Signed up</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((e, i) => (
                    <tr key={e.id} className="border-b border-neutral-50 last:border-0">
                      <td className="px-5 py-3 text-neutral-400">{i + 1}</td>
                      <td className="px-5 py-3 text-neutral-900 font-medium">
                        {e.dancerName ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-neutral-600">
                        <div>{e.contactName ?? "—"}</div>
                        <div className="text-xs text-neutral-400">{e.contactEmail ?? ""}</div>
                      </td>
                      <td className="px-5 py-3 text-neutral-600">{fmtDateTime(e.signedUpAt)}</td>
                      <td className="px-5 py-3"><StatusPill status={e.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {feedback?.id === e.id && (
                            <span className={`text-xs ${feedback.ok ? "text-emerald-600" : "text-rose-600"}`}>
                              {feedback.text}
                            </span>
                          )}
                          <button
                            onClick={() => handleInvite(e)}
                            disabled={busyId === e.id}
                            className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-50"
                          >
                            {busyId === e.id ? "Sending…" : "Send payment link"}
                          </button>
                          <Link
                            href={`/admin/register?fromWaitlist=${e.id}`}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition"
                          >
                            Register
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
