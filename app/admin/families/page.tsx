"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Family } from "@/types";
import { getFamilies } from "@/queries/admin";
import { createFamily, type CreateFamilyInput } from "./actions/createFamily";
import { FormField, ModalActions, inputCls } from "./_components/FormHelpers";

export default function FamiliesAdmin() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getFamilies()
      .then((data) => setFamilies((data as Family[]) ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateFamily = (input: CreateFamilyInput) => {
    startTransition(async () => {
      try {
        setCreateError(null);
        await createFamily(input);
        const data = await getFamilies();
        setFamilies((data as Family[]) ?? []);
        setShowCreate(false);
      } catch (e: unknown) {
        setCreateError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-sm text-neutral-400">Loading families…</div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Families</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {families.length} famil{families.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
        >
          + New Family
        </button>
      </div>

      {/* Family list */}
      {families.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-6 py-12 text-center text-sm text-neutral-400">
          No families yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {families.map((family) => {
            const primaryParent = family.users.find((u) => u.is_primary_parent);
            const activeRegs = family.dancers.flatMap((d) =>
              d.registrations.filter((r) => r.status !== "cancelled")
            ).length;

            return (
              <Link
                key={family.id}
                href={`/admin/families/${family.id}`}
                className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(family.family_name ?? "?")[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 text-sm group-hover:text-primary-600 transition-colors">
                    {family.family_name}
                  </p>
                  {primaryParent && (
                    <p className="text-xs text-neutral-500 mt-0.5 truncate">
                      {primaryParent.first_name} {primaryParent.last_name} · {primaryParent.email}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 shrink-0 text-xs text-neutral-500">
                  <span>
                    {family.dancers.length} dancer{family.dancers.length !== 1 ? "s" : ""}
                  </span>
                  {activeRegs > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      {activeRegs} enrolled
                    </span>
                  )}
                  <svg
                    className="w-4 h-4 text-neutral-300 group-hover:text-neutral-400 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Family Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <CreateFamilyModal
              onSubmit={handleCreateFamily}
              onClose={() => { setShowCreate(false); setCreateError(null); }}
              error={createError}
              isPending={isPending}
            />
          </div>
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* CreateFamilyModal                                                           */
/* -------------------------------------------------------------------------- */

function CreateFamilyModal({
  onSubmit,
  onClose,
  error,
  isPending,
}: {
  onSubmit: (input: CreateFamilyInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [familyName, setFamilyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendInvite, setSendInvite] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ familyName, firstName, lastName, email, phone, sendInvite });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">New Family</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Create a family and its primary parent account.
        </p>
      </div>

      <div className="space-y-3">
        <FormField label="Family Name" required>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="e.g. Smith Family"
            required
            className={inputCls}
          />
        </FormField>

        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 pt-1">
          Primary Parent
        </p>

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

        <FormField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </FormField>

        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={sendInvite}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="mt-0.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
          />
          <div>
            <p className="text-sm font-medium text-neutral-800">Send invite email</p>
            <p className="text-xs text-neutral-500">
              A welcome email will be sent to the parent once auth is configured.
            </p>
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions onClose={onClose} isPending={isPending} submitLabel="Create Family" />
    </form>
  );
}
