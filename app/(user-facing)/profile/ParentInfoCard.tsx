"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import {
  updateUserProfile,
  type UpdateUserProfileInput,
} from "./actions/updateUserProfile";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface ParentInfoCardProps {
  user: User;
}

export function ParentInfoCard({ user }: ParentInfoCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<UpdateUserProfileInput>({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    phone_number: user.phone_number ?? "",
    address_line1: user.address_line1 ?? "",
    address_line2: user.address_line2 ?? "",
    city: user.city ?? "",
    state: user.state ?? "",
    zipcode: user.zipcode ?? "",
  });

  function set(field: keyof UpdateUserProfileInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateUserProfile(form);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm({
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      phone_number: user.phone_number ?? "",
      address_line1: user.address_line1 ?? "",
      address_line2: user.address_line2 ?? "",
      city: user.city ?? "",
      state: user.state ?? "",
      zipcode: user.zipcode ?? "",
    });
    setError(null);
    setEditing(false);
  }

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Parent / Guardian Info
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Used to pre-fill registration forms.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Name */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              First Name
            </label>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              disabled={!editing}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Last Name
            </label>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              disabled={!editing}
              className={inputClass}
            />
          </div>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Email Address
          </label>
          <input
            type="email"
            value={user.email}
            disabled
            className={inputClass}
          />
          <p className="text-xs text-gray-400">
            Email cannot be changed here.
          </p>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Phone Number
          </label>
          <input
            type="tel"
            value={form.phone_number}
            onChange={(e) => set("phone_number", e.target.value)}
            disabled={!editing}
            placeholder="(555) 555-5555"
            className={inputClass}
          />
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Street Address
          </label>
          <input
            type="text"
            value={form.address_line1}
            onChange={(e) => set("address_line1", e.target.value)}
            disabled={!editing}
            placeholder="123 Main St"
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Apt / Suite / Unit{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={form.address_line2}
            onChange={(e) => set("address_line2", e.target.value)}
            disabled={!editing}
            placeholder="Apt 4B"
            className={inputClass}
          />
        </div>

        {/* City / State / Zip */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700">
              City
            </label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              disabled={!editing}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              State
            </label>
            <select
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              disabled={!editing}
              className={inputClass}
            >
              <option value="">— Select —</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              ZIP Code
            </label>
            <input
              type="text"
              value={form.zipcode}
              onChange={(e) => set("zipcode", e.target.value)}
              disabled={!editing}
              maxLength={10}
              className={inputClass}
            />
          </div>
        </div>

        {/* Action buttons */}
        {editing && (
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
