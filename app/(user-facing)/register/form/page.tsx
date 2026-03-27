"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RegistrationProvider,
  useRegistration,
} from "@/app/providers/RegistrationProvider";
import { useAuth } from "@/app/providers/AuthProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { buildDynamicFormSchema } from "@/lib/schemas/registration";
import type { RegistrationFormElement, ProfileFieldKey } from "@/types";
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
        <h2 className="text-base font-bold text-neutral-900">{el.label}</h2>
        {el.subtitle && (
          <p className="text-sm text-neutral-500 mt-0.5">{el.subtitle}</p>
        )}
      </div>
    );
  }

  if (el.type === "text_block") {
    if (el.htmlContent) {
      return (
        <div
          key={el.id}
          className="text-sm text-neutral-600 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: el.htmlContent }}
        />
      );
    }
    return (
      <p key={el.id} className="text-sm text-neutral-600">
        {el.label}
      </p>
    );
  }

  // type === "question"
  const error = errors[el.id]?.message as string | undefined;

  return (
    <div key={el.id} className="space-y-1.5">
      <label className="block text-sm font-medium text-neutral-700">
        {el.label}
        {el.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {el.instructionalText && (
        <p className="text-xs text-neutral-400">{el.instructionalText}</p>
      )}

      {el.inputType === "short_answer" && (
        <input
          {...register(el.id)}
          className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      )}

      {el.inputType === "long_answer" && (
        <textarea
          {...register(el.id)}
          rows={4}
          className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
        />
      )}

      {el.inputType === "select" && (
        <select
          {...register(el.id)}
          className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
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
                    className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-400"
                  />
                  <span className="text-sm text-neutral-700">{opt}</span>
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
          className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      )}

      {el.inputType === "phone_number" && (
        <input
          type="tel"
          {...register(el.id)}
          className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
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
  mode = "live",
}: {
  semesterId: string;
  continueUrl: string;
  mode?: "live" | "preview";
}) {
  const router = useRouter();
  const { state, setFormData } = useRegistration();
  const { userRecord } = useAuth();

  const [semester, setSemester] = useState<PublicSemester | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!semesterId) {
      console.error("[FormContent] No semesterId provided");
      setFetchError("No semester selected.");
      setLoading(false);
      return;
    }
    getSemesterForDisplay(semesterId, mode)
      .then((data) => {
        console.log(
          "[FormContent] Semester loaded. registrationForm element count:",
          data.registrationForm?.length ?? 0,
          "| raw registrationForm:",
          JSON.stringify(data.registrationForm),
        );
        setSemester(data);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[FormContent] Failed to load semester:", msg);
        setFetchError(msg);
      })
      .finally(() => setLoading(false));
  }, [semesterId, mode]);

  const elements = semester?.registrationForm ?? [];

  // Build the schema only once data has loaded so the resolver reflects the
  // actual form shape. Re-compute on every render so that react-hook-form
  // always validates against the latest schema.
  const schema = buildDynamicFormSchema(elements);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: state.formData as Record<string, unknown>,
  });

  // After semester loads, seed any profileField-mapped questions from the
  // logged-in user's profile. state.formData takes precedence so previously
  // entered answers are never overwritten.
  useEffect(() => {
    if (!semester || elements.length === 0) return;

    const profileMap: Partial<Record<ProfileFieldKey, string | undefined>> = {
      parent_first_name:    userRecord?.first_name    ?? undefined,
      parent_last_name:     userRecord?.last_name     ?? undefined,
      parent_email:         userRecord?.email         ?? undefined,
      parent_phone:         userRecord?.phone_number  ?? undefined,
      parent_address_line1: userRecord?.address_line1 ?? undefined,
      parent_address_line2: userRecord?.address_line2 ?? undefined,
      parent_city:          userRecord?.city          ?? undefined,
      parent_state:         userRecord?.state         ?? undefined,
      parent_zipcode:       userRecord?.zipcode       ?? undefined,
    };

    const profileSeeded: Record<string, unknown> = {};
    for (const el of elements) {
      if (el.profileField && profileMap[el.profileField]) {
        profileSeeded[el.id] = profileMap[el.profileField];
      }
    }

    // Only reset if there's actually something to seed
    if (Object.keys(profileSeeded).length > 0) {
      reset({ ...profileSeeded, ...state.formData });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester]);

  function onSubmit(data: Record<string, unknown>) {
    setFormData(data);
    router.push(continueUrl);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-neutral-200 rounded-xl" />
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="text-center py-10">
        <p className="text-red-600 mb-2 font-medium">
          Could not load registration form
        </p>
        <p className="text-neutral-400 text-sm mb-4">{fetchError}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-primary-600 hover:underline text-sm"
        >
          ← Go back
        </button>
      </div>
    );
  }

  if (elements.length === 0) {
    // No form elements configured — skip this step
    console.log(
      "[FormContent] registrationForm is empty — showing skip screen. semesterId:",
      semesterId,
    );
    return (
      <div className="text-center py-10">
        <p className="text-neutral-500 mb-4">
          No additional information required.
        </p>
        <button
          type="button"
          onClick={() => router.push(continueUrl)}
          className="bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors text-sm"
        >
          Continue to Payment
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">
          Registration Information
        </h1>
        <p className="text-neutral-500 text-sm">
          Please complete all required fields.
        </p>
      </div>

      {elements.map((el) => renderField(el, register, control, errors))}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors text-sm font-medium"
        >
          ← Back
        </button>
        <button
          type="submit"
          className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors text-sm"
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
