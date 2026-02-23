"use client";

import { useState } from "react";
import {
  SemesterDraft,
  SemesterAction,
  RegistrationFormElement,
} from "@/types";
import CustomQuestionModal from "@/app/components/semester-flow/CustomQuestionModal";
import SubheaderModal from "@/app/components/semester-flow/SubheaderModal";
import TextBlockModal from "@/app/components/semester-flow/TextBlockModal";

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
};

type ActiveModal = "question" | "subheader" | "text_block" | null;

export default function RegistrationFormStep({
  state,
  dispatch,
  onNext,
  onBack,
}: Props) {
  const elements = state.registrationForm?.elements ?? [];

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editingElement, setEditingElement] =
    useState<RegistrationFormElement | null>(null);

  /* -------------------------------------------------------------------------- */
  /* Modal Controls                                                             */
  /* -------------------------------------------------------------------------- */

  function openModal(modal: ActiveModal, element: RegistrationFormElement | null = null) {
    setEditingElement(element);
    setActiveModal(modal);
  }

  function closeModal() {
    setActiveModal(null);
    setEditingElement(null);
  }

  /* -------------------------------------------------------------------------- */
  /* Element Operations                                                         */
  /* -------------------------------------------------------------------------- */

  function handleSaveElement(element: RegistrationFormElement) {
    if (editingElement) {
      dispatch({ type: "UPDATE_FORM_ELEMENT", payload: element });
    } else {
      dispatch({ type: "ADD_FORM_ELEMENT", payload: element });
    }
    closeModal();
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
  /* Render Helpers                                                             */
  /* -------------------------------------------------------------------------- */

  function elementSummary(el: RegistrationFormElement): string {
    if (el.type === "question") {
      return `${el.inputType ?? "unknown"}${el.required ? " · Required" : ""}`;
    }
    if (el.type === "subheader") {
      return el.subtitle ? `Subtitle: ${el.subtitle}` : "Section header";
    }
    if (el.type === "text_block") {
      const fmt = el.textFormatting;
      const parts: string[] = [];
      if (fmt?.style === "header") parts.push("Header style");
      if (fmt?.bold) parts.push("Bold");
      if (fmt?.listType) parts.push(fmt.listType === "bullet" ? "Bullet list" : "Numbered list");
      return parts.length > 0 ? parts.join(" · ") : "Text block";
    }
    return "";
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
      <div className="flex gap-4 flex-wrap">
        <button
          onClick={() => openModal("question")}
          className="px-4 py-2 rounded-xl border border-indigo-500 text-indigo-600 hover:bg-indigo-50 transition text-sm font-medium"
        >
          + Custom Question
        </button>

        <button
          onClick={() => openModal("subheader")}
          className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition text-sm"
        >
          + Subheader
        </button>

        <button
          onClick={() => openModal("text_block")}
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
            <div className="space-y-1 min-w-0">
              {el.type === "question" && (
                <>
                  <div className="font-medium text-gray-900">{el.label}</div>
                  <div className="text-xs text-gray-500">
                    {elementSummary(el)}
                  </div>
                </>
              )}

              {el.type === "subheader" && (
                <>
                  <div className="font-semibold text-gray-700">{el.label}</div>
                  {el.subtitle && (
                    <div className="text-xs text-gray-500">{el.subtitle}</div>
                  )}
                  <div className="text-xs text-gray-400">Subheader</div>
                </>
              )}

              {el.type === "text_block" && (
                <>
                  <div className="text-sm text-gray-600 truncate max-w-sm">
                    {el.label}
                  </div>
                  <div className="text-xs text-gray-400">
                    {elementSummary(el)}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 text-sm ml-4 shrink-0">
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

              <button
                onClick={() => openModal(el.type, el)}
                className="text-indigo-600 hover:underline"
              >
                Edit
              </button>

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

      {/* Modals */}
      {activeModal === "question" && (
        <CustomQuestionModal
          initialElement={editingElement}
          onClose={closeModal}
          onSave={handleSaveElement}
          sessions={state.sessions?.appliedSessions ?? []}
        />
      )}

      {activeModal === "subheader" && (
        <SubheaderModal
          initialElement={editingElement}
          onClose={closeModal}
          onSave={handleSaveElement}
        />
      )}

      {activeModal === "text_block" && (
        <TextBlockModal
          initialElement={editingElement}
          onClose={closeModal}
          onSave={handleSaveElement}
        />
      )}
    </div>
  );
}
