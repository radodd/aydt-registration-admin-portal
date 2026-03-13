"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { RegistrationFormElement } from "@/types";

type Props = {
  semesterId: string;
  semesterName: string;
  sessionIds: string[];
  dancerName: string;
  initialFormData: Record<string, unknown>;
  onNext: (formData: Record<string, unknown>) => void;
  onBack: () => void;
};

export default function QuestionsStep({
  semesterId,
  semesterName,
  sessionIds,
  dancerName,
  initialFormData,
  onNext,
  onBack,
}: Props) {
  const [elements, setElements] = useState<RegistrationFormElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, unknown>>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("semesters")
        .select("registration_form")
        .eq("id", semesterId)
        .single();
      const form = (data as any)?.registration_form;
      const elems: RegistrationFormElement[] = form?.elements ?? [];
      setElements(elems);
      setLoading(false);
    }
    load();
  }, [semesterId]);

  // Filter elements applicable to any of the selected sessions
  const visibleElements = elements.filter((el) => {
    if (!el.sessionIds || el.sessionIds.length === 0) return true;
    return el.sessionIds.some((sid) => sessionIds.includes(sid));
  });

  function setValue(id: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const el of visibleElements) {
      if (el.type !== "question" || !el.required) continue;
      const val = formData[el.id];
      if (!val || (typeof val === "string" && !val.trim())) {
        newErrors[el.id] = "This field is required.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (!validate()) return;
    onNext(formData);
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        Loading questions…
      </div>
    );
  }

  if (visibleElements.filter((el) => el.type === "question").length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-slate-500 text-sm">
            No additional questions for this semester.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => onNext(formData)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div className="pb-3 border-b border-gray-100">
          <p className="text-sm text-slate-500">
            Answering on behalf of <span className="font-medium text-slate-700">{dancerName}</span>
          </p>
        </div>

        {visibleElements.map((el) => (
          <FormElement
            key={el.id}
            el={el}
            value={formData[el.id]}
            error={errors[el.id]}
            onChange={(val) => setValue(el.id, val)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function FormElement({
  el,
  value,
  error,
  onChange,
}: {
  el: RegistrationFormElement;
  value: unknown;
  error?: string;
  onChange: (val: unknown) => void;
}) {
  if (el.type === "subheader") {
    return (
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-slate-700">{el.label}</h3>
        {el.subtitle && <p className="text-xs text-slate-400 mt-0.5">{el.subtitle}</p>}
      </div>
    );
  }

  if (el.type === "text_block") {
    if (el.htmlContent) {
      return (
        <div
          className="text-sm text-slate-600 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: el.htmlContent }}
        />
      );
    }
    return <p className="text-sm text-slate-600">{el.label}</p>;
  }

  // question
  const inputId = `q-${el.id}`;
  const strVal = typeof value === "string" ? value : "";
  const baseInputClass = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? "border-red-300" : "border-gray-200"
  }`;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {el.label}
        {el.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {el.instructionalText && (
        <p className="text-xs text-slate-400">{el.instructionalText}</p>
      )}

      {el.inputType === "long_answer" ? (
        <textarea
          id={inputId}
          rows={3}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      ) : el.inputType === "select" ? (
        <select
          id={inputId}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClass} bg-white`}
        >
          <option value="">Select…</option>
          {(el.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : el.inputType === "checkbox" ? (
        <div className="space-y-1.5">
          {(el.options ?? []).map((opt) => {
            const checked = Array.isArray(value) ? (value as string[]).includes(opt) : false;
            return (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const prev = Array.isArray(value) ? (value as string[]) : [];
                    onChange(
                      e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt)
                    );
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            );
          })}
        </div>
      ) : el.inputType === "date" ? (
        <input
          id={inputId}
          type="date"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      ) : el.inputType === "phone_number" ? (
        <input
          id={inputId}
          type="tel"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      ) : (
        // short_answer (default)
        <input
          id={inputId}
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
