"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import AddressBlockField from "@/app/components/semester-flow/AddressBlockField";
import { isAddressComplete } from "@/lib/address";
import {
  isAcknowledged,
  makeAcknowledgment,
  DEFAULT_ACKNOWLEDGMENT_LABEL,
} from "@/lib/waiver";
import { fetchProfilePrefill } from "../actions/fetchProfilePrefill";
import type { RegistrationFormElement } from "@/types";

type Props = {
  semesterId: string;
  semesterName: string;
  sessionIds: string[];
  dancerName: string;
  /** Meeting-plan #16: identifiers used to prefill from the saved profile. */
  familyId: string | null;
  dancerId: string | null;
  initialFormData: Record<string, unknown>;
  onNext: (formData: Record<string, unknown>) => void;
  onBack: () => void;
};

export default function QuestionsStep({
  semesterId,
  semesterName,
  sessionIds,
  dancerName,
  familyId,
  dancerId,
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
      const [{ data }, prefill] = await Promise.all([
        supabase
          .from("semesters")
          .select("registration_form")
          .eq("id", semesterId)
          .single(),
        fetchProfilePrefill({ familyId, dancerId }),
      ]);
      const form = (data as any)?.registration_form;
      const elems: RegistrationFormElement[] = form?.elements ?? [];
      setElements(elems);

      // Meeting-plan #16: seed address blocks + profile-mapped questions from
      // the selected family/dancer. Mirrors the parent-facing seeding logic.
      // Existing answers (state.formData) win — never overwrite what's there.
      const seed: Record<string, unknown> = {};
      for (const el of elems) {
        if (el.inputType === "address") {
          if (prefill.address) seed[el.id] = prefill.address;
        } else if (el.profileField) {
          const val = prefill.profileMap[el.profileField];
          if (val) seed[el.id] = val;
        }
      }
      if (Object.keys(seed).length > 0) {
        setFormData((prev) => ({ ...seed, ...prev }));
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId, familyId, dancerId]);

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
      if (el.type === "waiver") {
        if (el.required && !isAcknowledged(formData[el.id])) {
          newErrors[el.id] = "You must acknowledge this waiver to continue.";
        }
        continue;
      }
      if (el.type !== "question" || !el.required) continue;
      const val = formData[el.id];
      if (el.inputType === "address") {
        if (!isAddressComplete(val)) {
          newErrors[el.id] = "Please complete the address.";
        }
      } else if (!val || (typeof val === "string" && !val.trim())) {
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
      <div className="py-12 text-center text-sm text-[#9E9890]">
        Loading questions…
      </div>
    );
  }

  if (visibleElements.filter((el) => el.type === "question").length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-8 text-center">
          <p className="text-[#736D65] text-sm">
            No additional questions for this semester.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#736D65] hover:text-[#201D18] transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => onNext(formData)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#8E2A23] text-white rounded-xl text-sm font-medium hover:bg-[#7A2420] transition"
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
      <div className="bg-white border border-[#DDD9D2] rounded-xl p-5 space-y-5">
        <div className="pb-3 border-b border-[#DDD9D2]">
          <p className="text-sm text-[#736D65]">
            Answering on behalf of <span className="font-medium text-[#201D18]">{dancerName}</span>
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
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#736D65] hover:text-[#201D18] transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#8E2A23] text-white rounded-xl text-sm font-medium hover:bg-[#7A2420] transition"
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
        <h3 className="text-sm font-semibold text-[#201D18]">{el.label}</h3>
        {el.subtitle && <p className="text-xs text-[#9E9890] mt-0.5">{el.subtitle}</p>}
      </div>
    );
  }

  if (el.type === "text_block") {
    if (el.htmlContent) {
      return (
        <div
          className="text-sm text-[#736D65] prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: el.htmlContent }}
        />
      );
    }
    return <p className="text-sm text-[#736D65]">{el.label}</p>;
  }

  if (el.type === "waiver") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#201D18]">
          {el.label}
          {el.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>

        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#DDD9D2] bg-[#FAF9F7] px-4 py-3 text-sm leading-relaxed text-[#736D65]">
          {el.waiverBody}
        </div>

        {el.waiverFileUrl && (
          <a
            href={el.waiverFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-[#8E2A23] hover:underline"
          >
            View / download waiver (PDF) ↗
          </a>
        )}

        <label className="flex items-start gap-2 cursor-pointer text-sm text-[#201D18]">
          <input
            type="checkbox"
            checked={isAcknowledged(value)}
            onChange={(e) =>
              onChange(makeAcknowledgment(e.target.checked, new Date().toISOString()))
            }
            className="mt-0.5 rounded border-[#DDD9D2] text-[#8E2A23] focus:ring-[#8E2A23]"
          />
          {el.acknowledgmentLabel ?? DEFAULT_ACKNOWLEDGMENT_LABEL}
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const inputId = `q-${el.id}`;
  const strVal = typeof value === "string" ? value : "";
  const baseInputClass = `w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23] ${
    error ? "border-red-300" : "border-[#DDD9D2]"
  }`;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-[#201D18]">
        {el.label}
        {el.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {el.instructionalText && (
        <p className="text-xs text-[#9E9890]">{el.instructionalText}</p>
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
                  className="rounded border-[#DDD9D2] text-[#8E2A23] focus:ring-[#8E2A23]"
                />
                <span className="text-sm text-[#201D18]">{opt}</span>
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
      ) : el.inputType === "address" ? (
        <AddressBlockField
          value={value}
          onChange={(v) => onChange(v)}
          inputClassName={baseInputClass}
          selectClassName={`${baseInputClass} bg-white`}
        />
      ) : (
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
