"use client";

import { useState } from "react";
import { RegistrationFormElement, TextBlockFormatting } from "@/types";
import { v4 as uuid } from "uuid";

type Props = {
  initialElement: RegistrationFormElement | null;
  onSave: (element: RegistrationFormElement) => void;
  onClose: () => void;
};

const DEFAULT_FORMATTING: TextBlockFormatting = {
  style: "normal",
  bold: false,
  italic: false,
  underline: false,
  color: "black",
  listType: null,
  link: "",
};

export default function TextBlockModal({
  initialElement,
  onSave,
  onClose,
}: Props) {
  const isEditMode = !!initialElement;

  const [text, setText] = useState(initialElement?.label ?? "");
  const [formatting, setFormatting] = useState<TextBlockFormatting>(
    initialElement?.textFormatting ?? DEFAULT_FORMATTING,
  );

  function update<K extends keyof TextBlockFormatting>(
    key: K,
    value: TextBlockFormatting[K],
  ) {
    setFormatting((prev) => ({ ...prev, [key]: value }));
  }

  function isValid(): boolean {
    return text.trim().length > 0;
  }

  function handleSave() {
    if (!isValid()) return;

    const element: RegistrationFormElement = {
      id: initialElement?.id ?? uuid(),
      type: "text_block",
      label: text,
      textFormatting: formatting,
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
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Text Content *
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Enter your text..."
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
          />
        </div>

        {/* Style + Color */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Display Style
            </label>
            <select
              value={formatting.style}
              onChange={(e) =>
                update("style", e.target.value as TextBlockFormatting["style"])
              }
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="normal">Normal</option>
              <option value="header">Header</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Text Color
            </label>
            <select
              value={formatting.color}
              onChange={(e) =>
                update("color", e.target.value as TextBlockFormatting["color"])
              }
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="black">Black</option>
              <option value="gray">Gray</option>
              <option value="indigo">Indigo</option>
            </select>
          </div>
        </div>

        {/* Formatting Toggles */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Formatting
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formatting.bold}
                onChange={(e) => update("bold", e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span className="font-bold">Bold</span>
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formatting.italic}
                onChange={(e) => update("italic", e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span className="italic">Italic</span>
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formatting.underline}
                onChange={(e) => update("underline", e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span className="underline">Underline</span>
            </label>
          </div>
        </div>

        {/* List Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">List Type</label>
          <div className="flex gap-6">
            {(["none", "bullet", "numbered"] as const).map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="radio"
                  name="listType"
                  checked={(formatting.listType ?? "none") === type}
                  onChange={() =>
                    update("listType", type === "none" ? null : type)
                  }
                  className="h-4 w-4 text-indigo-600 border-gray-300"
                />
                <span className="capitalize">{type}</span>
              </label>
            ))}
          </div>
          {formatting.listType && (
            <p className="text-xs text-gray-400">
              Each line of text will be rendered as a list item.
            </p>
          )}
        </div>

        {/* Link URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Link URL
          </label>
          <input
            type="url"
            value={formatting.link ?? ""}
            onChange={(e) => update("link", e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
