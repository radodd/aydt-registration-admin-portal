"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dancer } from "@/types";
import { updateDancer } from "./actions/updateDancer";

interface DancerCardProps {
  dancer: Dancer;
}

export function DancerCard({ dancer }: DancerCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: dancer.first_name ?? "",
    last_name: dancer.last_name ?? "",
    birth_date: dancer.birth_date ?? "",
  });

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateDancer({ id: dancer.id, ...form });
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
      first_name: dancer.first_name ?? "",
      last_name: dancer.last_name ?? "",
      birth_date: dancer.birth_date ?? "",
    });
    setError(null);
    setEditing(false);
  }

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {dancer.first_name} {dancer.last_name}
          </h3>
          {dancer.birth_date && (
            <p className="text-xs text-gray-500 mt-0.5">
              DOB: {new Date(dancer.birth_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-700">
                First Name
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-700">
                Last Name
              </label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700">
              Date of Birth
            </label>
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => set("birth_date", e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-xs disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
