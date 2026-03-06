"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RegistrationProvider,
  useRegistration,
} from "@/app/providers/RegistrationProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { buildDynamicFormSchema } from "@/lib/schemas/registration";
import type { RegistrationFormElement } from "@/types";
import type { PublicSemester } from "@/types/public";

/* -------------------------------------------------------------------------- */
/* Field renderer                                                              */
/* -------------------------------------------------------------------------- */

function renderField(
  el: RegistrationFormElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any,
) {
  if (el.type === "subheader") {
    return (
      <div key={el.id} className="pt-4">
        <h2 className="text-base font-bold text-gray-900">{el.label}</h2>
        {el.subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{el.subtitle}</p>
        )}
      </div>
    );
  }

  if (el.type === "text_block") {
    if (el.htmlContent) {
      return (
        <div
          key={el.id}
          className="text-sm text-gray-600 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: el.htmlContent }}
        />
      );
    }
    return (
      <p key={el.id} className="text-sm text-gray-600">
        {el.label}
      </p>
    );
  }

  // type === "question"
  const error = errors[el.id]?.message as string | undefined;

  return (
    <div key={el.id} className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {el.label}
        {el.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {el.instructionalText && (
        <p className="text-xs text-gray-400">{el.instructionalText}</p>
      )}

      {el.inputType === "short_answer" && (
        <input
          {...register(el.id)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      {el.inputType === "long_answer" && (
        <textarea
          {...register(el.id)}
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
        />
      )}

      {el.inputType === "select" && (
        <select
          {...register(el.id)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">— Select —</option>
          {el.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {el.inputType === "checkbox" && (
        <Controller
          name={el.id}
          control={control}
          defaultValue={[]}
          render={({ field }) => (
            <div className="space-y-2">
              {el.options?.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    value={opt}
                    checked={(field.value as string[]).includes(opt)}
                    onChange={(e) => {
                      const current = field.value as string[];
                      field.onChange(
                        e.target.checked
                          ? [...current, opt]
                          : current.filter((v) => v !== opt),
                      );
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          )}
        />
      )}

      {el.inputType === "date" && (
        <input
          type="date"
          {...register(el.id)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      {el.inputType === "phone_number" && (
        <input
          type="tel"
          {...register(el.id)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form content                                                                */
/* -------------------------------------------------------------------------- */

export function FormContent({
  semesterId,
  continueUrl,
}: {
  semesterId: string;
  continueUrl: string;
}) {
  const router = useRouter();
  const { state, setFormData } = useRegistration();

  const [semester, setSemester] = useState<PublicSemester | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSemesterForDisplay(semesterId, "live")
      .then(setSemester)
      .finally(() => setLoading(false));
  }, [semesterId]);

  const elements = semester?.registrationForm ?? [];
  const schema = buildDynamicFormSchema(elements);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: state.formData as Record<string, unknown>,
  });

  function onSubmit(data: Record<string, unknown>) {
    setFormData(data);
    router.push(continueUrl);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  if (elements.length === 0) {
    // No form elements — skip this step automatically
    return (
      <div className="text-center py-10">
        <p className="text-gray-500 mb-4">
          No additional information required.
        </p>
        <button
          type="button"
          onClick={() => router.push(continueUrl)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-sm"
        >
          Continue to Payment
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Registration Information
        </h1>
        <p className="text-gray-500 text-sm">
          Please complete all required fields.
        </p>
      </div>

      {elements.map((el) => renderField(el, register, control, errors))}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          ← Back
        </button>
        <button
          type="submit"
          className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-sm"
        >
          Continue to Payment
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function FormPageInner() {
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";

  return (
    <CartRestoreGuard semesterId={semesterId}>
      {/* <RegistrationProvider semesterId={semesterId}> */}
      <FormContent
        semesterId={semesterId}
        continueUrl={`/register/payment?semester=${semesterId}`}
      />
      {/* </RegistrationProvider> */}
    </CartRestoreGuard>
  );
}

export default function FormPage() {
  return (
    <Suspense>
      <FormPageInner />
    </Suspense>
  );
}
