"use client";

import { useState } from "react";
import { RegistrationFormElement } from "@/types";
import { v4 as uuid } from "uuid";

type Props = {
  initialElement: RegistrationFormElement | null;
  onSave: (element: RegistrationFormElement) => void;
  onClose: () => void;
};

export default function SubheaderModal({
  initialElement,
  onSave,
  onClose,
}: Props) {
  const isEditMode = !!initialElement;

  const [label, setLabel] = useState(initialElement?.label ?? "");
  const [subtitle, setSubtitle] = useState(initialElement?.subtitle ?? "");

  function isValid(): boolean {
    return label.trim().length > 0;
  }

  function handleSave() {
    if (!isValid()) return;

    const element: RegistrationFormElement = {
      id: initialElement?.id ?? uuid(),
      type: "subheader",
      label: label.trim(),
      subtitle: subtitle.trim() || undefined,
    };

    onSave(element);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-gray-200 p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? "Edit Subheader" : "Create Subheader"}
          </h2>
        </div>

        {/* Subheader Label */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Subheader *
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Section title"
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Subtitle */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Subtitle
          </label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Optional supporting text"
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={!isValid()}
            className={`px-5 py-2 rounded-xl text-white transition ${
              isValid()
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            {isEditMode ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
