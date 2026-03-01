"use client";

import { useEffect, useState } from "react";
import {
  RegistrationFormElement,
  QuestionInputType,
} from "@/types";
import { v4 as uuid } from "uuid";

type Props = {
  initialElement: RegistrationFormElement | null;
  onSave: (element: RegistrationFormElement) => void;
  onClose: () => void;
  sessions: { sessionId: string; title: string }[];
};

const QUESTION_TYPES: QuestionInputType[] = [
  "short_answer",
  "long_answer",
  "select",
  "checkbox",
  "date",
  "phone_number",
];

export default function CustomQuestionModal({
  initialElement,
  onSave,
  onClose,
  sessions,
}: Props) {
  const isEditMode = !!initialElement;

  const [label, setLabel] = useState(initialElement?.label ?? "");

  const [reportLabel, setReportLabel] = useState(
    initialElement?.reportLabel ?? "",
  );

  const [inputType, setInputType] = useState<QuestionInputType>(
    initialElement?.inputType ?? "short_answer",
  );

  const [required, setRequired] = useState(initialElement?.required ?? false);

  const [options, setOptions] = useState<string[]>(
    initialElement?.options ?? [],
  );

  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(
    initialElement?.sessionIds ?? [],
  );

  /* -------------------------------------------------------------------------- */
  /* Option Management                                                          */
  /* -------------------------------------------------------------------------- */

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function updateOption(index: number, value: string) {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  }

  function removeOption(index: number) {
    const updated = [...options];
    updated.splice(index, 1);
    setOptions(updated);
  }

  /* -------------------------------------------------------------------------- */
  /* Session Selection                                                          */
  /* -------------------------------------------------------------------------- */

  function toggleSession(sessionId: string) {
    if (selectedSessionIds.includes(sessionId)) {
      setSelectedSessionIds((prev) => prev.filter((id) => id !== sessionId));
    } else {
      setSelectedSessionIds((prev) => [...prev, sessionId]);
    }
  }

  function appliesToAll(): boolean {
    return selectedSessionIds.length === 0;
  }

  function toggleAllSessions() {
    if (appliesToAll()) {
      setSelectedSessionIds(sessions.map((s) => s.sessionId));
    } else {
      setSelectedSessionIds([]);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Validation                                                                 */
  /* -------------------------------------------------------------------------- */

  function isValid(): boolean {
    if (!label.trim()) return false;
    if (!inputType) return false;

    if (
      (inputType === "select" || inputType === "checkbox") &&
      options.filter((o) => o.trim()).length === 0
    ) {
      return false;
    }

    return true;
  }

  /* -------------------------------------------------------------------------- */
  /* Save                                                                       */
  /* -------------------------------------------------------------------------- */

  function handleSave() {
    if (!isValid()) return;

    const element: RegistrationFormElement = {
      id: initialElement?.id ?? uuid(),
      type: "question",
      label: label.trim(),
      reportLabel: reportLabel.trim() || undefined,
      inputType,
      required,
      options:
        inputType === "select" || inputType === "checkbox"
          ? options.filter((o) => o.trim())
          : undefined,
      sessionIds:
        selectedSessionIds.length > 0 ? selectedSessionIds : undefined,
    };

    onSave(element);
  }

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-gray-200 p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? "Edit Custom Question" : "Create Custom Question"}
          </h2>
        </div>

        {/* Question Label */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Question Label *
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Report Label */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Report Label
          </label>
          <input
            type="text"
            value={reportLabel}
            onChange={(e) => setReportLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Question Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Question Type *
          </label>
          <select
            value={inputType}
            onChange={(e) => setInputType(e.target.value as QuestionInputType)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Options (Conditional) */}
        {(inputType === "select" || inputType === "checkbox") && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">
                Options *
              </label>
              <button
                type="button"
                onClick={addOption}
                className="text-sm text-indigo-600 hover:underline"
              >
                + Add Option
              </button>
            </div>

            {options.map((opt, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(index, e.target.value)}
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="text-red-500 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Required Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
          />
          <label className="text-sm text-gray-700">Required</label>
        </div>

        {/* Session Applicability */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-700">
              Applies To Sessions
            </label>
            <button
              type="button"
              onClick={toggleAllSessions}
              className="text-sm text-indigo-600 hover:underline"
            >
              {appliesToAll() ? "Select All" : "Clear All"}
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3 space-y-2">
            {sessions.map((s) => (
              <label
                key={s.sessionId}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedSessionIds.includes(s.sessionId)}
                  onChange={() => toggleSession(s.sessionId)}
                />
                {s.title}
              </label>
            ))}
          </div>
          <div className="text-xs text-gray-400">
            If none selected, applies to all sessions.
          </div>
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
            {isEditMode ? "Update Question" : "Create Question"}
          </button>
        </div>
      </div>
    </div>
  );
}
