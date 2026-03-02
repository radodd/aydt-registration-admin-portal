"use client";

import { useState } from "react";
import { RegistrationFormElement } from "@/types";
import { v4 as uuid } from "uuid";
import TipTapEditor from "./TipTapEditor";

type Props = {
  initialElement: RegistrationFormElement | null;
  onSave: (element: RegistrationFormElement) => void;
  onClose: () => void;
};

export default function TextBlockModal({ initialElement, onSave, onClose }: Props) {
  const isEditMode = !!initialElement;

  const [html, setHtml] = useState<string>(
    initialElement?.htmlContent ?? (initialElement?.label ? `<p>${initialElement.label}</p>` : ""),
  );

  function isValid(): boolean {
    const stripped = html.replace(/<[^>]*>/g, "").trim();
    return stripped.length > 0;
  }

  function handleSave() {
    if (!isValid()) return;

    const element: RegistrationFormElement = {
      id: initialElement?.id ?? uuid(),
      type: "text_block",
      htmlContent: html,
      // keep label as plain-text fallback (strip tags)
      label: html.replace(/<[^>]*>/g, "").trim(),
    };

    onSave(element);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-gray-200 p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? "Edit Text Block" : "Create Text Block"}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Format text using the toolbar. Supports headings, bold, italic, underline, lists, links, and colors.
          </p>
        </div>

        {/* TipTap Editor */}
        <TipTapEditor
          value={html}
          onChange={setHtml}
          placeholder="Enter your text content..."
          minHeight="140px"
        />

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
