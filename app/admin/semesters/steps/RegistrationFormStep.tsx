"use client";

import { useState } from "react";
import {
  SemesterDraft,
  SemesterAction,
  RegistrationFormElement,
} from "@/types";
import CustomQuestionModal from "@/app/components/semester-flow/CustomQuestionModal";
import { v4 as uuid } from "uuid";

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
};

export default function RegistrationFormStep({
  state,
  dispatch,
  onNext,
  onBack,
}: Props) {
  const elements = state.registrationForm?.elements ?? [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingElement, setEditingElement] =
    useState<RegistrationFormElement | null>(null);

  /* -------------------------------------------------------------------------- */
  /* Element Operations                                                         */
  /* -------------------------------------------------------------------------- */

  function handleAddQuestion() {
    setEditingElement(null);
    setIsModalOpen(true);
  }

  function handleSaveQuestion(element: RegistrationFormElement) {
    if (editingElement) {
      dispatch({ type: "UPDATE_FORM_ELEMENT", payload: element });
    } else {
      dispatch({ type: "ADD_FORM_ELEMENT", payload: element });
    }
    setIsModalOpen(false);
    setEditingElement(null);
  }

  function handleDelete(id: string) {
    dispatch({ type: "REMOVE_FORM_ELEMENT", payload: id });
  }

  function moveUp(index: number) {
    if (index === 0) return;

    const reordered = [...elements];
    [reordered[index - 1], reordered[index]] = [
      reordered[index],
      reordered[index - 1],
    ];

    dispatch({ type: "REORDER_FORM_ELEMENTS", payload: reordered });
  }

  function moveDown(index: number) {
    if (index === elements.length - 1) return;

    const reordered = [...elements];
    [reordered[index], reordered[index + 1]] = [
      reordered[index + 1],
      reordered[index],
    ];

    dispatch({ type: "REORDER_FORM_ELEMENTS", payload: reordered });
  }

  function handleAddSubheader() {
    const newElement: RegistrationFormElement = {
      id: uuid(),
      type: "subheader",
      label: "New Section Header",
    };

    dispatch({ type: "ADD_FORM_ELEMENT", payload: newElement });
  }

  function handleAddTextBlock() {
    const newElement: RegistrationFormElement = {
      id: uuid(),
      type: "text_block",
      label: "Informational text...",
    };

    dispatch({ type: "ADD_FORM_ELEMENT", payload: newElement });
  }

  /* -------------------------------------------------------------------------- */
  /* Validation                                                                 */
  /* -------------------------------------------------------------------------- */

  function isValid(): boolean {
    for (const el of elements) {
      if (el.type === "question") {
        if (!el.label?.trim()) return false;
        if (!el.inputType) return false;

        if (
          (el.inputType === "select" || el.inputType === "checkbox") &&
          (!el.options || el.options.length === 0)
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Registration Form
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Customize the questions users must complete before registering.
        </p>
      </div>

      {/* Add Controls */}
      <div className="flex gap-4">
        <button
          onClick={handleAddQuestion}
          className="px-4 py-2 rounded-xl border border-indigo-500 text-indigo-600 hover:bg-indigo-50 transition text-sm font-medium"
        >
          + Custom Question
        </button>

        <button
          onClick={handleAddSubheader}
          className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition text-sm"
        >
          + Subheader
        </button>

        <button
          onClick={handleAddTextBlock}
          className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition text-sm"
        >
          + Text Block
        </button>
      </div>

      {/* Element List */}
      <div className="space-y-4">
        {elements.length === 0 && (
          <div className="text-sm text-gray-400">
            No form elements added yet.
          </div>
        )}

        {elements.map((el, index) => (
          <div
            key={el.id}
            className="border border-gray-200 rounded-xl p-4 flex justify-between items-start"
          >
            <div className="space-y-1">
              {el.type === "question" && (
                <>
                  <div className="font-medium text-gray-900">{el.label}</div>
                  <div className="text-xs text-gray-500">
                    Type: {el.inputType}
                    {el.required && " • Required"}
                  </div>
                </>
              )}

              {el.type === "subheader" && (
                <div className="font-semibold text-gray-700">{el.label}</div>
              )}

              {el.type === "text_block" && (
                <div className="text-sm text-gray-600">{el.label}</div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 text-sm">
              <div className="flex gap-2">
                <button
                  onClick={() => moveUp(index)}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveDown(index)}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ↓
                </button>
              </div>

              {el.type === "question" && (
                <button
                  onClick={() => {
                    setEditingElement(el);
                    setIsModalOpen(true);
                  }}
                  className="text-indigo-600 hover:underline"
                >
                  Edit
                </button>
              )}

              <button
                onClick={() => handleDelete(el.id)}
                className="text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>

        <button
          onClick={onNext}
          disabled={!isValid()}
          className={`px-5 py-2 rounded-xl text-white transition ${
            isValid()
              ? "bg-indigo-600 hover:bg-indigo-700"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          Continue
        </button>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <CustomQuestionModal
          initialElement={editingElement}
          onClose={() => {
            setIsModalOpen(false);
            setEditingElement(null);
          }}
          onSave={handleSaveQuestion}
          sessions={state.sessions?.appliedSessions ?? []}
        />
      )}
    </div>
  );
}
