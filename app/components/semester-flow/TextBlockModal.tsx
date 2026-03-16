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
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-neutral-200 p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">
            {isEditMode ? "Edit Text Block" : "Create Text Block"}
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
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
        <div className="flex justify-between pt-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={!isValid()}
            className={`px-5 py-2 rounded-xl text-white transition ${
              isValid()
                ? "bg-primary-600 hover:bg-primary-700"
                : "bg-neutral-300 cursor-not-allowed"
            }`}
          >
            {isEditMode ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
