"use client";

import { useEffect, useMemo, useState } from "react";
import { getWaitlistEntries, type AdminWaitlistEntry } from "./queries";
import { inviteWaitlistEntryByLink } from "./actions/inviteWaitlistEntryByLink";
import { registerWaitlistEntryInPortal } from "./actions/registerWaitlistEntryInPortal";

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
/* Register-in-portal modal (Path B)                                           */
/* -------------------------------------------------------------------------- */

function RegisterModal({
  entry,
  onClose,
  onRegistered,
}: {
  entry: AdminWaitlistEntry;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [price, setPrice] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const result = await registerWaitlistEntryInPortal({
      entryId: entry.id,
      priceOverride: price ? Number(price) : null,
      paymentMethod,
      amountCollected: amount ? Number(amount) : 0,
      notes: notes || undefined,
    });
    if (!result.success) {
      setError(result.error ?? "Failed to register");
      setSaving(false);
      return;
    }
    onRegistered();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">
            Register from waitlist
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            {entry.dancerName ?? "Dancer"} → {entry.className}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              Custom total (optional)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Leave blank to use standard pricing"
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 text-slate-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
                Payment method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 text-slate-700"
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card_present">Card (in person)</option>
                <option value="comp">Comp / waived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
                Amount collected
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 text-slate-700"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none text-slate-700"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-50"
          >
            {saving ? "Registering…" : "Register dancer"}
          </button>
        </div>
      </div>
    </div>
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
  const [registerTarget, setRegisterTarget] = useState<AdminWaitlistEntry | null>(null);

  async function load() {
    setLoading(true);
    setEntries(await getWaitlistEntries());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const byClass = useMemo(() => {
    const groups = new Map<string, { className: string; semesterName: string; rows: AdminWaitlistEntry[] }>();
    for (const e of entries) {
      const key = e.classId ?? "unknown";
      if (!groups.has(key)) {
        groups.set(key, { className: e.className, semesterName: e.semesterName, rows: [] });
      }
      groups.get(key)!.rows.push(e);
    }
    return [...groups.values()];
  }, [entries]);

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
                <div className="text-xs text-neutral-500">
                  {group.rows.length} waitlisted
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
                          <button
                            onClick={() => setRegisterTarget(e)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition"
                          >
                            Register
                          </button>
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

      {registerTarget && (
        <RegisterModal
          entry={registerTarget}
          onClose={() => setRegisterTarget(null)}
          onRegistered={() => {
            setRegisterTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}
